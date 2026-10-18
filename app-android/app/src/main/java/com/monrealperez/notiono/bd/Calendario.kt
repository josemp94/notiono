package com.monrealperez.notiono.bd

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.datos.Fila
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Etiquetas
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Fechas
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit

private val DIAS = listOf("L", "M", "X", "J", "V", "S", "D")

/** Días (inicio, fin) de una fila según el campo de fecha (o las fechas de creación/edición). */
fun diasDe(est: EstadoBD, f: Fila, campo: Campo, campoFin: Campo? = null): Pair<LocalDate, LocalDate>? {
    fun dia(s: String?) = s?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    fun deInstante(s: String?) = s?.let { runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).toLocalDate() }.getOrNull() }
    val (ini, fin) = when (campo.type) {
        "created_time" -> deInstante(f.createdAt).let { it to it }
        "last_edited_time" -> deInstante(f.updatedAt).let { it to it }
        else -> {
            val v = valorFecha(est.celdas(f)[campo.id])
            val finCampo = campoFin?.let { valorFecha(est.celdas(f)[it.id])?.first }
            dia(v?.first) to (dia(finCampo) ?: dia(v?.second) ?: dia(v?.first))
        }
    }
    if (ini == null) return null
    return ini to (fin?.takeIf { !it.isBefore(ini) } ?: ini)
}

private fun campoFecha(est: EstadoBD): Campo? =
    est.campo(est.cfgStr("dateFieldId"))?.takeIf { it.type in setOf("date", "created_time", "last_edited_time") }
        ?: est.campos.firstOrNull { it.type == "date" }

/** Calendario de mes (o de semana): tocar un día enseña sus filas y deja crear una ese día. */
@Composable
fun VistaCalendario(est: EstadoBD, abrir: (String) -> Unit, nueva: (JsonObject?) -> Unit) {
    val d = est.datos ?: return
    val campo = campoFecha(est)
    if (campo == null) {
        Vacio("Añade un campo de tipo Fecha para usar el calendario.", icono = "calendar")
        return
    }
    val semana = est.cfgStr("calMode") == "semana"
    var mes by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    var lunes by rememberSaveable { mutableStateOf(LocalDate.now().let { it.minusDays((it.dayOfWeek.value - 1).toLong()) }.toString()) }
    var dia by remember { mutableStateOf<LocalDate?>(null) }
    val ym = YearMonth.parse(mes)
    val hoy = LocalDate.now()
    val porDia = remember(d.filas, campo.id) {
        val m = HashMap<LocalDate, MutableList<Fila>>()
        for (f in d.filas) {
            val (a, b) = diasDe(est, f, campo) ?: continue
            var x = a
            var n = 0
            while (!x.isAfter(b) && n++ < 400) { m.getOrPut(x) { mutableListOf() }.add(f); x = x.plusDays(1) }
        }
        m
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            val titulo = if (semana) {
                val l = LocalDate.parse(lunes)
                "${l.dayOfMonth} – ${l.plusDays(6).dayOfMonth} ${l.plusDays(6).month.getDisplayName(TextStyle.SHORT, Fechas.es)} ${l.year}"
            } else "${ym.month.getDisplayName(TextStyle.FULL, Fechas.es).replaceFirstChar { it.uppercase() }} ${ym.year}"
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = C.texto, modifier = Modifier.weight(1f).padding(start = 8.dp))
            BotonIcono("chevron-left", { if (semana) lunes = LocalDate.parse(lunes).minusWeeks(1).toString() else mes = ym.minusMonths(1).toString() })
            Text("Hoy", fontSize = 14.sp, color = C.texto, modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable {
                mes = YearMonth.now().toString(); lunes = hoy.minusDays((hoy.dayOfWeek.value - 1).toLong()).toString()
            }.padding(8.dp))
            BotonIcono("chevron-right", { if (semana) lunes = LocalDate.parse(lunes).plusWeeks(1).toString() else mes = ym.plusMonths(1).toString() })
        }
        Row(Modifier.fillMaxWidth()) {
            for (dd in DIAS) Text(dd, fontSize = 12.sp, color = C.apagado, modifier = Modifier.weight(1f).padding(4.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        val primero = if (semana) LocalDate.parse(lunes) else ym.atDay(1).let { it.minusDays((it.dayOfWeek.value - 1).toLong()) }
        val semanas = if (semana) 1 else 6
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            for (s in 0 until semanas) {
                Row(Modifier.fillMaxWidth().heightIn(min = if (semana) 360.dp else 92.dp)) {
                    for (i in 0 until 7) {
                        val fecha = primero.plusDays((s * 7 + i).toLong())
                        val delDia = porDia[fecha] ?: emptyList()
                        val fuera = !semana && fecha.month != ym.month
                        Column(
                            Modifier.weight(1f).fillMaxHeight().heightIn(min = if (semana) 360.dp else 92.dp).border(0.5.dp, C.borde).clickable { dia = fecha }.padding(2.dp),
                        ) {
                            Box(
                                Modifier.size(22.dp).clip(CircleShape).background(if (fecha == hoy) Marca else Color.Transparent),
                                contentAlignment = Alignment.Center,
                            ) { Text("${fecha.dayOfMonth}", fontSize = 12.sp, color = if (fecha == hoy) Color.White else if (fuera) C.apagado.copy(alpha = 0.5f) else C.texto) }
                            val max = if (semana) 12 else 3
                            for (f in delDia.take(max)) {
                                Text(
                                    est.tituloDe(f), fontSize = 11.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp).clip(RoundedCornerShape(3.dp))
                                        .background(fondoFila(f.color) ?: C.hover).clickable { abrir(f.id) }.padding(horizontal = 3.dp, vertical = 1.dp),
                                )
                            }
                            if (delDia.size > max) Text("+${delDia.size - max}", fontSize = 11.sp, color = C.apagado)
                        }
                    }
                }
            }
        }
    }
    dia?.let { f ->
        val delDia = porDia[f] ?: emptyList()
        HojaLista({ dia = null }, Fechas.largo(f.toString())) {
            for (x in delDia) FilaMenu(est.tituloDe(x), "file-text") { dia = null; abrir(x.id) }
            if (delDia.isEmpty()) Text("Nada este día.", color = C.apagado, modifier = Modifier.padding(16.dp))
            if (est.editable && campo.type == "date") FilaMenu("Nueva el ${Fechas.largo(f.toString())}", "plus") {
                dia = null
                nueva(JsonObject(mapOf(campo.id to JsonPrimitive(f.toString()))))
            }
        }
    }
}

private val ZOOMS = mapOf("mes" to (1 to 34), "trimestre" to (3 to 12), "año" to (12 to 4))

/** Cronograma: barras por rango de fechas con los títulos fijos a la izquierda y zoom. */
@Composable
fun VistaCronograma(est: EstadoBD, abrir: (String) -> Unit) {
    val d = est.datos ?: return
    val campo = est.campo(est.cfgStr("dateFieldId"))?.takeIf { it.type == "date" } ?: est.campos.firstOrNull { it.type == "date" }
    if (campo == null) {
        Vacio("Añade un campo de tipo Fecha para usar el cronograma.", icono = "chart-gantt")
        return
    }
    val campoFin = est.campo(est.cfgStr("endFieldId"))
    val zoom = est.cfgStr("zoom") ?: "mes"
    val (meses, anchoDia) = ZOOMS[zoom] ?: ZOOMS.getValue("mes")
    var inicioMes by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    val ini = YearMonth.parse(inicioMes).atDay(1)
    val fin = YearMonth.parse(inicioMes).plusMonths(meses.toLong() - 1).atEndOfMonth()
    val dias = ChronoUnit.DAYS.between(ini, fin).toInt() + 1
    val conFecha = d.filas.mapNotNull { f -> diasDe(est, f, campo, campoFin)?.let { f to it } }
    val sinFecha = d.filas.filter { diasDe(est, it, campo, campoFin) == null }
    val desplazamiento = rememberScrollState()
    val hoy = LocalDate.now()
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            for ((k, nombre) in listOf("mes" to "Mes", "trimestre" to "Trimestre", "año" to "Año")) {
                Text(nombre, fontSize = 13.sp, color = if (k == zoom) Marca else C.texto, modifier = Modifier.padding(2.dp).clip(RoundedCornerShape(6.dp))
                    .background(if (k == zoom) C.marcaSuave else Color.Transparent).clickable { est.ponConfig(mapOf("zoom" to JsonPrimitive(k))) }.padding(horizontal = 8.dp, vertical = 5.dp))
            }
            Box(Modifier.weight(1f))
            BotonIcono("chevron-left", { inicioMes = YearMonth.parse(inicioMes).minusMonths(meses.toLong()).toString() })
            Text("Hoy", fontSize = 13.sp, modifier = Modifier.clickable { inicioMes = YearMonth.now().toString() }.padding(6.dp), color = C.texto)
            BotonIcono("chevron-right", { inicioMes = YearMonth.parse(inicioMes).plusMonths(meses.toLong()).toString() })
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // Cabecera: días (zoom mes) o meses.
            Row {
                Box(Modifier.width(130.dp).height(28.dp))
                Row(Modifier.horizontalScroll(desplazamiento)) {
                    if (meses == 1) for (i in 0 until dias) {
                        val x = ini.plusDays(i.toLong())
                        Text("${x.dayOfMonth}", fontSize = 10.sp, color = if (x == hoy) Marca else C.apagado, modifier = Modifier.width(anchoDia.dp).padding(top = 6.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    } else for (m in 0 until meses) {
                        val ymx = YearMonth.parse(inicioMes).plusMonths(m.toLong())
                        Text("${ymx.month.getDisplayName(TextStyle.SHORT, Fechas.es)} ${ymx.year % 100}", fontSize = 11.sp, color = C.apagado, maxLines = 1,
                            modifier = Modifier.width((ymx.lengthOfMonth() * anchoDia).dp).border(0.5.dp, C.borde).padding(4.dp))
                    }
                }
            }
            for ((f, rango) in conFecha) {
                Row(Modifier.height(36.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(est.tituloDe(f), fontSize = 13.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.width(130.dp).clickable { abrir(f.id) }.padding(horizontal = 8.dp))
                    Box(Modifier.horizontalScroll(desplazamiento).width((dias * anchoDia).dp).fillMaxHeight()) {
                        val desde = ChronoUnit.DAYS.between(ini, rango.first).toInt()
                        val hasta = ChronoUnit.DAYS.between(ini, rango.second).toInt()
                        if (hasta >= 0 && desde < dias) {
                            val a = desde.coerceAtLeast(0)
                            val b = hasta.coerceAtMost(dias - 1)
                            Box(
                                Modifier.offset(x = (a * anchoDia).dp).width(((b - a + 1) * anchoDia).dp.coerceAtLeast(10.dp)).height(24.dp).align(Alignment.CenterStart)
                                    .clip(RoundedCornerShape(5.dp)).background(f.color?.let { Etiquetas.fondo(it, C.oscuro) } ?: C.marcaSuave)
                                    .border(1.dp, Marca.copy(alpha = 0.5f), RoundedCornerShape(5.dp)).clickable { abrir(f.id) }.padding(horizontal = 6.dp),
                                contentAlignment = Alignment.CenterStart,
                            ) { Text(est.tituloDe(f), fontSize = 11.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        }
                        val h = ChronoUnit.DAYS.between(ini, hoy).toInt()
                        if (h in 0 until dias) Box(Modifier.offset(x = (h * anchoDia + anchoDia / 2).dp).width(1.dp).fillMaxHeight().background(Marca.copy(alpha = 0.5f)))
                    }
                }
            }
            if (sinFecha.isNotEmpty()) {
                Text("Sin fecha  ${sinFecha.size}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 4.dp))
                for (f in sinFecha) Row(Modifier.fillMaxWidth().clickable { abrir(f.id) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(est.tituloDe(f), fontSize = 14.sp, color = C.texto, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (est.editable) Text("Planificar hoy", fontSize = 13.sp, color = Marca, modifier = Modifier.clickable { est.ponCelda(f.id, campo.id, JsonPrimitive(hoy.toString())) }.padding(6.dp))
                }
            }
            Box(Modifier.height(80.dp))
        }
    }
}
