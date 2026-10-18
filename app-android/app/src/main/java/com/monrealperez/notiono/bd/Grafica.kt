package com.monrealperez.notiono.bd

import android.content.ClipData
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.num
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.red.strs
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo as CampoTexto
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.ColoresIcono
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private val TIPOS_GRAFICA = listOf("bar" to "Barras", "bar_h" to "Barras horizontales", "line" to "Líneas", "donut" to "Anillo", "number" to "Número")
private val AGREGADOS = listOf("count" to "Contar", "sum" to "Sumar", "avg" to "Media", "median" to "Mediana", "min" to "Mínimo", "max" to "Máximo")
private val CUBOS = listOf("day" to "Día", "week" to "Semana", "month" to "Mes", "quarter" to "Trimestre", "year" to "Año")

@Composable
private fun paletaGrafica(): List<Color> = listOf(Marca) + ColoresIcono.nombres.filter { it != "orange" }.map { ColoresIcono.de(it, C.oscuro) }

/** La gráfica: los datos los agrega el servidor (`db.chartData`, con los filtros de la vista). */
@Composable
fun VistaGrafica(est: EstadoBD) {
    val v = est.vista ?: return
    val q = rememberConsulta("db.chartData", objeto("pageId" to est.pageId, "viewId" to v.id), etiquetas = setOf("vista:${est.pageId}"))
    val datos = q.datos?.comoObjeto
    val tipo = (datos?.str("chartType") ?: "bar").let { if (it == "pie") "donut" else it }
    if (datos == null) { Esqueleto(4); return }
    val cats = datos.strs("categories")
    val valores = datos.arr("values")?.map { (it as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0 } ?: emptyList()
    val series = datos.arr("series")?.mapNotNull { s -> (s as? JsonObject)?.let { it.str("name").orEmpty() to (it.arr("values")?.map { x -> (x as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0 } ?: emptyList()) } }
    val colores = paletaGrafica()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("${datos.str("xName").orEmpty()} · ${datos.str("yName").orEmpty()}", fontSize = 13.sp, color = C.apagado)
        if (tipo == "number") {
            Text(formatea(datos.num("total") ?: 0.0), fontSize = 56.sp, fontWeight = FontWeight.Bold, color = C.texto, modifier = Modifier.padding(vertical = 32.dp))
            return@Column
        }
        if (cats.isEmpty()) { Vacio("No hay datos que dibujar con los filtros de esta vista.", icono = "chart-column"); return@Column }
        val texto = C.apagado
        val rejilla = C.borde
        when (tipo) {
            "donut" -> {
                val total = valores.sum().takeIf { it > 0 } ?: 1.0
                Canvas(Modifier.fillMaxWidth().height(240.dp)) {
                    val lado = size.minDimension * 0.9f
                    val tl = Offset((size.width - lado) / 2, (size.height - lado) / 2)
                    var ang = -90f
                    valores.forEachIndexed { i, x ->
                        val barrido = (x / total * 360).toFloat()
                        drawArc(colores[i % colores.size], ang, barrido, false, tl, Size(lado, lado), style = Stroke(width = lado * 0.18f))
                        ang += barrido
                    }
                }
            }
            "bar_h" -> {
                val max = (series?.let { s -> cats.indices.maxOfOrNull { i -> s.sumOf { it.second.getOrElse(i) { 0.0 } } } } ?: valores.maxOrNull())?.takeIf { it > 0 } ?: 1.0
                for ((i, c) in cats.withIndex()) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(c, fontSize = 12.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(0.35f))
                        Canvas(Modifier.weight(0.5f).height(18.dp)) {
                            var x0 = 0f
                            if (series != null) series.forEachIndexed { j, s ->
                                val w = (s.second.getOrElse(i) { 0.0 } / max * size.width).toFloat()
                                drawRect(colores[j % colores.size], Offset(x0, 0f), Size(w, size.height)); x0 += w
                            } else drawRect(colores[0], Offset.Zero, Size((valores[i] / max * size.width).toFloat(), size.height))
                        }
                        Text(formatea(series?.sumOf { it.second.getOrElse(i) { 0.0 } } ?: valores[i]), fontSize = 12.sp, color = C.apagado, modifier = Modifier.weight(0.15f).padding(start = 4.dp))
                    }
                }
            }
            else -> {
                val max = (series?.let { s -> if (tipo == "line") s.maxOfOrNull { it.second.maxOrNull() ?: 0.0 } else cats.indices.maxOfOrNull { i -> s.sumOf { it.second.getOrElse(i) { 0.0 } } } } ?: valores.maxOrNull())?.takeIf { it > 0 } ?: 1.0
                Canvas(Modifier.fillMaxWidth().height(240.dp)) {
                    val alto = size.height - 4f
                    for (k in 0..4) drawLine(rejilla, Offset(0f, alto * k / 4), Offset(size.width, alto * k / 4), 1f)
                    val paso = size.width / cats.size
                    if (tipo == "line") {
                        val lineas = series?.map { it.second } ?: listOf(valores)
                        lineas.forEachIndexed { j, vs ->
                            val p = Path()
                            vs.forEachIndexed { i, x ->
                                val px = paso * i + paso / 2
                                val py = alto - (x / max * alto).toFloat()
                                if (i == 0) p.moveTo(px, py) else p.lineTo(px, py)
                                drawCircle(colores[j % colores.size], 4f, Offset(px, py))
                            }
                            drawPath(p, colores[j % colores.size], style = Stroke(width = 3f))
                        }
                    } else for (i in cats.indices) {
                        var y0 = alto
                        val ancho = paso * 0.6f
                        val x = paso * i + paso * 0.2f
                        if (series != null) series.forEachIndexed { j, s ->
                            val h = (s.second.getOrElse(i) { 0.0 } / max * alto).toFloat()
                            drawRect(colores[j % colores.size], Offset(x, y0 - h), Size(ancho, h)); y0 -= h
                        } else {
                            val h = (valores[i] / max * alto).toFloat()
                            drawRect(colores[0], Offset(x, alto - h), Size(ancho, h))
                        }
                    }
                }
                Row(Modifier.fillMaxWidth()) {
                    // Categoría y su valor (sin eje con números, es lo que dice cuánto mide cada barra).
                    for ((i, c) in cats.withIndex()) Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(c, fontSize = 10.sp, color = texto, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        Text(formatea(series?.sumOf { it.second.getOrElse(i) { 0.0 } } ?: valores.getOrElse(i) { 0.0 }), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = C.texto)
                    }
                }
            }
        }
        // Leyenda: series (apiladas) o categorías (anillo).
        val leyenda = series?.map { it.first } ?: if (tipo == "donut") cats.mapIndexed { i, c -> "$c (${formatea(valores[i])})" } else emptyList()
        if (leyenda.isNotEmpty()) FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            leyenda.forEachIndexed { i, n ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(colores[i % colores.size]))
                    Text(n, fontSize = 12.sp, color = C.texto, modifier = Modifier.padding(start = 4.dp))
                }
            }
        }
    }
}

private fun formatea(x: Double): String = if (x % 1.0 == 0.0) "%,d".format(java.util.Locale.forLanguageTag("es-ES"), x.toLong()) else "%,.2f".format(java.util.Locale.forLanguageTag("es-ES"), x)

/** Ajustes de la gráfica (los de la web: tipo, agrupar por, valor, cálculo, cubo de fecha, desglose). */
@Composable
fun GraficaAjustes(est: EstadoBD) {
    var eligiendo by remember { mutableStateOf<String?>(null) }
    val tipo = est.cfgStr("chartType") ?: "bar"
    TituloSeccion("Gráfica")
    FilaMenu("Tipo", "chart-column", detalle = TIPOS_GRAFICA.toMap()[tipo] ?: tipo) { eligiendo = "chartType" }
    if (tipo != "number") FilaMenu("Agrupar por", "group", detalle = est.campo(est.cfgStr("xFieldId"))?.name ?: "—") { eligiendo = "xFieldId" }
    FilaMenu("Cálculo", "sigma", detalle = AGREGADOS.toMap()[est.cfgStr("agg") ?: "count"]) { eligiendo = "agg" }
    if ((est.cfgStr("agg") ?: "count") != "count") FilaMenu("Valor", "hash", detalle = est.campo(est.cfgStr("yFieldId"))?.name ?: "—") { eligiendo = "yFieldId" }
    if (est.campo(est.cfgStr("xFieldId"))?.type in setOf("date", "created_time", "last_edited_time")) FilaMenu("Agrupar fechas por", "calendar", detalle = CUBOS.toMap()[est.cfgStr("dateBucket") ?: "month"]) { eligiendo = "dateBucket" }
    if (tipo in setOf("bar", "bar_h", "line")) FilaMenu("Desglose (apilar por)", "layers", detalle = est.campo(est.cfgStr("breakdownFieldId"))?.name ?: "Nada") { eligiendo = "breakdownFieldId" }
    Interruptor("Ocultar grupos vacíos", est.vista?.cfg()?.bool("omitZero") == true) { est.ponConfig(mapOf("omitZero" to JsonPrimitive(it))) }
    eligiendo?.let { clave ->
        val opciones: List<Pair<String?, String>> = when (clave) {
            "chartType" -> TIPOS_GRAFICA.map { it.first to it.second }
            "agg" -> AGREGADOS.map { it.first to it.second }
            "dateBucket" -> CUBOS.map { it.first to it.second }
            "yFieldId" -> est.campos.filter { it.type in setOf("number", "formula", "rollup") }.map { it.id to it.name }
            "breakdownFieldId" -> listOf<Pair<String?, String>>(null to "Nada") + est.campos.filter { it.type !in setOf("button", "files") }.map { it.id to it.name }
            else -> est.campos.filter { it.type !in setOf("button", "files") }.map { it.id to it.name }
        }
        HojaLista({ eligiendo = null }) {
            for ((k, n) in opciones) FilaMenu(n, null, derecha = { if (est.cfgStr(clave) == k) Icono("check", color = Marca) }) {
                est.ponConfig(mapOf(clave to k?.let { JsonPrimitive(it) }))
                eligiendo = null
            }
        }
    }
}

/** Formulario: rellenar y enviar (crea una fila), como la vista Formulario de la web. */
@Composable
fun VistaFormulario(est: EstadoBD) {
    val alcance = rememberCoroutineScope()
    val campos = est.visibles().filter { it.type !in CAMPOS_AUTOMATICOS && it.type !in setOf("button", "relation", "files", "location") }
    val obligatorios = est.vista?.cfg()?.strs("requiredFields")?.toSet() ?: emptySet()
    var valores by remember { mutableStateOf(mapOf<String, JsonElement>()) }
    var enviado by remember { mutableStateOf(false) }
    var editando by remember { mutableStateOf<Campo?>(null) }
    if (enviado) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icono("circle-check", tam = 40.dp, color = Marca)
            Text(est.cfgStr("thanksMessage")?.ifBlank { null } ?: "¡Gracias! Hemos recibido tu respuesta.", fontSize = 16.sp, color = C.texto, modifier = Modifier.padding(16.dp))
            TextButton({ enviado = false; valores = emptyMap() }) { Text("Enviar otra", color = Marca) }
        }
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        for (c in campos) {
            Column {
                Text(c.name + if (c.id in obligatorios) " *" else "", fontWeight = FontWeight.Medium, fontSize = 14.sp, color = C.texto)
                when (c.type) {
                    "text", "number", "url", "email", "phone" -> {
                        var t by remember(c.id) { mutableStateOf((valores[c.id] as? JsonPrimitive)?.content.orEmpty()) }
                        CampoTexto(t, { t = it; valores = valores + (c.id to JsonPrimitive(it)) }, unaLinea = c.type != "text")
                    }
                    "checkbox" -> {
                        val si = (valores[c.id] as? JsonPrimitive)?.content == "true"
                        Interruptor("Sí", si) { valores = valores + (c.id to JsonPrimitive(it)) }
                    }
                    else -> {
                        val etiqueta = when (val v = valores[c.id]) {
                            null -> "Elegir…"
                            is JsonPrimitive -> c.opciones().firstOrNull { it.id == v.content }?.label ?: v.content
                            is JsonArray -> v.joinToString { e -> c.opciones().firstOrNull { it.id == (e as? JsonPrimitive)?.content }?.label ?: est.nombrePersona((e as? JsonPrimitive)?.content) ?: "" }
                            is JsonObject -> v.str("start").orEmpty()
                        }
                        Text(etiqueta, fontSize = 15.sp, color = C.texto, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(C.hover).clickable { editando = c }.padding(12.dp))
                    }
                }
            }
        }
        if (est.editable) TextButton({
            val faltan = campos.filter { it.id in obligatorios && (valores[it.id] == null || (valores[it.id] as? JsonPrimitive)?.content?.isBlank() == true) }
            if (faltan.isNotEmpty()) { Avisos.di("Falta: " + faltan.joinToString { it.name }); return@TextButton }
            val celdas = valores.mapValues { (k, v) ->
                val c = est.campo(k)
                if (c?.type == "number") (v as? JsonPrimitive)?.content?.replace(',', '.')?.toDoubleOrNull()?.let { JsonPrimitive(it) } ?: v else v
            }.filterValues { !((it as? JsonPrimitive)?.isString == true && it.content.isBlank()) }
            alcance.launch { if (est.nuevaFila(JsonObject(celdas)) != null) enviado = true }
        }, Modifier.align(Alignment.End)) { Text("Enviar", color = Marca, fontWeight = FontWeight.SemiBold) }
    }
    // Selectores de opciones, personas y fecha para lo que no es texto.
    editando?.let { c ->
        EditorFormulario(est, c, onValor = { v -> valores = if (v == null) valores - c.id else valores + (c.id to v) }) { editando = null }
    }
}

@Composable
private fun EditorFormulario(est: EstadoBD, c: Campo, onValor: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    when (c.type) {
        "select", "status", "multiselect" -> HojaLista(onCerrar, c.name) {
            for (o in c.opciones()) FilaMenu(o.label, null) {
                onValor(if (c.type == "multiselect") JsonArray(listOf(JsonPrimitive(o.id))) else JsonPrimitive(o.id)); onCerrar()
            }
        }
        "person" -> HojaLista(onCerrar, c.name) {
            for (p in est.datos?.personas ?: emptyList()) FilaMenu(p.nombre, "circle-user") { onValor(JsonArray(listOf(JsonPrimitive(p.id)))); onCerrar() }
        }
        "date" -> HojaLista(onCerrar, c.name) {
            FilaMenu("Hoy", "calendar") { onValor(JsonPrimitive(java.time.LocalDate.now().toString())); onCerrar() }
            FilaMenu("Mañana", "calendar") { onValor(JsonPrimitive(java.time.LocalDate.now().plusDays(1).toString())); onCerrar() }
        }
        else -> onCerrar()
    }
}

/** Ajustes del formulario: obligatorios, mensaje de gracias y enlace público (/f/<token>). */
@Composable
fun FormularioAjustes(est: EstadoBD) {
    val ctx = LocalContext.current
    val s = com.monrealperez.notiono.Servicios.de(ctx)
    val alcance = rememberCoroutineScope()
    var gracias by remember { mutableStateOf(est.cfgStr("thanksMessage").orEmpty()) }
    val token = est.cfgStr("publicToken")
    TituloSeccion("Formulario")
    val obligatorios = est.vista?.cfg()?.strs("requiredFields")?.toSet() ?: emptySet()
    for (c in est.visibles().filter { it.type !in CAMPOS_AUTOMATICOS && it.type != "button" }) {
        Interruptor("${c.name} obligatorio", c.id in obligatorios) { si ->
            val nuevos = if (si) obligatorios + c.id else obligatorios - c.id
            est.ponConfig(mapOf("requiredFields" to JsonArray(nuevos.map(::JsonPrimitive))))
        }
    }
    Box(Modifier.padding(horizontal = 16.dp)) { CampoTexto(gracias, { gracias = it }, placeholder = "Mensaje de gracias") }
    TextButton({ est.ponConfig(mapOf("thanksMessage" to JsonPrimitive(gracias))) }, Modifier.padding(horizontal = 8.dp)) { Text("Guardar mensaje", color = Marca) }
    if (token != null) {
        val url = "${BuildConfig.BASE_URL}/f/$token"
        FilaMenu("Copiar enlace público", "link", detalle = url) {
            ctx.getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Notiono", url))
            Avisos.di("Enlace copiado")
        }
        FilaMenu("Dejar de compartir", "x", color = C.apagado) {
            alcance.launch { runCatching { s.repo.mutacion("db.unpublishForm", objeto("viewId" to est.vista?.id), encolable = false) }; est.carga() }
        }
    } else FilaMenu("Compartir formulario (enlace público)", "share-2", detalle = "Cualquiera con el enlace podrá enviar respuestas") {
        alcance.launch { runCatching { s.repo.mutacion("db.publishForm", objeto("viewId" to est.vista?.id), encolable = false) }; est.carga() }
    }
}
