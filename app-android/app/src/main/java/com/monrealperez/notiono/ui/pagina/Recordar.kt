package com.monrealperez.notiono.ui.pagina

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.avisos.Alarmas
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.rememberAlcance
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * Los atajos de «Recordarme…», los mismos que la web (`atajoRecordatorio` de
 * src/lib/recordatorios.ts): fechas de Madrid "YYYY-MM-DDTHH:mm", estén donde estén.
 */
object AtajosRecordar {
    val MADRID: ZoneId = ZoneId.of("Europe/Madrid")
    private val FORMATO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")

    fun enMadrid(i: Instant): String = FORMATO.format(i.atZone(MADRID))

    /** «En 1 hora» (al minuto de arriba), «Esta tarde» (19:00; null si ya pasó) y «Mañana a las 9:00». */
    fun atajo(cual: String, ahora: Instant = Instant.now()): String? {
        val hoy = ahora.atZone(MADRID).toLocalDate()
        return when (cual) {
            "1h" -> enMadrid(ahora.plusSeconds(3600).plusSeconds(59).truncatedTo(ChronoUnit.MINUTES))
            "tarde" -> hoy.atTime(19, 0).atZone(MADRID).toInstant().takeIf { it.isAfter(ahora) }?.let { "${hoy}T19:00" }
            "manana" -> "${hoy.plusDays(1)}T09:00"
            else -> null
        }
    }

    val ATAJOS = listOf(Triple("1h", "En 1 hora", "clock"), Triple("tarde", "Esta tarde (19:00)", "sunset"), Triple("manana", "Mañana a las 9:00", "sunrise"))

    /** Las antelaciones del selector «Recordar», las de la web (`RECORDATORIOS` de src/lib/recordatorios.ts). */
    private val ANTELACIONES = listOf(
        Triple("0", "A la hora del evento", "El mismo día (9:00)"),
        Triple("5m", "5 minutos antes", null), Triple("10m", "10 minutos antes", null), Triple("15m", "15 minutos antes", null),
        Triple("30m", "30 minutos antes", null), Triple("1h", "1 hora antes", null), Triple("2h", "2 horas antes", null),
        Triple("1d", "1 día antes (9:00)", "1 día antes (9:00)"), Triple("2d", "2 días antes (9:00)", "2 días antes (9:00)"),
        Triple("1w", "1 semana antes (9:00)", "1 semana antes (9:00)"),
    )

    fun antelaciones(conHora: Boolean): List<Pair<String, String>> =
        ANTELACIONES.mapNotNull { (id, con, sin) -> if (conHora) id to con else sin?.let { id to it } }

    fun textoAntelacion(id: String, conHora: Boolean): String? = antelaciones(conHora).firstOrNull { it.first == id }?.second

    /** «Recordar en 1 hora», «Recordar esta tarde (19:00)»…: el atajo en el menú @ y en el de la fecha (como `tituloAtajo`). */
    fun titulo(texto: String) = "Recordar " + texto.replaceFirstChar { it.lowercase() }

    private val DIAS = listOf("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")

    /**
     * «@recordar…» del menú @, lo mismo que `sugerenciasRecordar` de la web (y las mismas
     * pruebas): null si no va de recordar; si la fecha no se entiende, los atajos.
     */
    fun sugerencias(consulta: String, ahora: Instant = Instant.now()): List<Pair<String, String>>? {
        val q = java.text.Normalizer.normalize(consulta.trim().lowercase(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}"), "").replace(Regex("\\s+"), " ")
        val m = Regex("^(recordar|recuerdame|remind)(?: (.*))?$").find(q)
        val prefijo = q.length >= 3 && ("recordar".startsWith(q) || "remind".startsWith(q))
        if (m == null && !prefijo) return null
        val atajos = ATAJOS.mapNotNull { (clave, texto, _) -> atajo(clave, ahora)?.let { f -> titulo(texto) to f } }
        val resto = m?.groupValues?.get(2)?.trim().orEmpty()
        if (resto.isEmpty()) return atajos
        val hoy = ahora.atZone(MADRID).toLocalDate()
        var dia: LocalDate? = null
        var r = resto.replace(Regex("^el (proximo )?"), "")
        val d = Regex("^(hoy|pasado manana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?)\\b ?").find(r)
        if (d != null) {
            val g = d.groupValues
            dia = when {
                g[1] == "hoy" -> hoy
                g[1] == "manana" -> hoy.plusDays(1)
                g[1] == "pasado manana" -> hoy.plusDays(2)
                g[2].isNotEmpty() -> {
                    val y = g[4].takeIf { it.isNotEmpty() }?.let { if (it.length == 2) 2000 + it.toInt() else it.toInt() } ?: hoy.year
                    runCatching { LocalDate.of(y, g[3].toInt(), g[2].toInt()) }.getOrNull() ?: return atajos
                }
                else -> {
                    val n = ((DIAS.indexOf(g[1]) + 1 - hoy.dayOfWeek.value) % 7 + 7) % 7
                    hoy.plusDays(if (n == 0) 7L else n.toLong())
                }
            }
            r = r.substring(d.value.length)
        }
        var hora: Pair<Int, Int>? = null
        if (r.isNotBlank()) {
            val h = Regex("^(?:a las? )?(\\d{1,2})(?::(\\d{2}))?(?: ?h)?$").find(r.trim()) ?: return atajos
            val hh = h.groupValues[1].toInt()
            val mm = h.groupValues[2].ifEmpty { "0" }.toInt()
            if (hh > 23 || mm > 59) return atajos
            hora = hh to mm
        }
        if (dia == null && hora == null) return atajos
        val (hh, mm) = hora ?: (9 to 0)
        var f = (dia ?: hoy).atTime(hh, mm)
        if (dia == null && !f.atZone(MADRID).toInstant().isAfter(ahora)) f = f.plusDays(1)
        val fecha = FORMATO.format(f)
        return listOf("Recordar ${cuando(fecha, ahora)}" to fecha)
    }

    /** «hoy a las 9:00», «mañana a las 19:00», «vie 30 oct a las 9:00». */
    fun cuando(fecha: String, ahora: Instant = Instant.now()): String {
        val d = runCatching { LocalDateTime.parse(fecha) }.getOrNull() ?: return fecha
        val hoy = ahora.atZone(MADRID).toLocalDate()
        val dia = when (d.toLocalDate()) {
            hoy -> "hoy"
            hoy.plusDays(1) -> "mañana"
            else -> d.format(DateTimeFormatter.ofPattern("EEE d MMM", com.monrealperez.notiono.util.Fechas.es)).replace(".", "")
        }
        return "$dia a las ${d.hour}:%02d".format(d.minute)
    }
}

/**
 * El menú de una mención de fecha (tocar el chip, como en Notion y en la web): arriba los
 * atajos de recordar (ponen esa fecha con aviso a su hora), «Elegir fecha y hora»,
 * «Incluir hora» y «Recordar» con las antelaciones de siempre. Devuelve los props nuevos
 * del chip; quien pone el recordatorio (`por`) es a quien avisa.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HojaFecha(props: JsonObject, onCambia: (JsonObject) -> Unit, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val fecha = props.str("fecha").orEmpty()
    val conHora = fecha.contains('T')
    val aviso = props.str("recordatorio").orEmpty()
    var eligeDia by remember { mutableStateOf(false) }
    var dia by remember { mutableStateOf<LocalDate?>(null) }
    fun pon(f: String = fecha, r: String = aviso) {
        onCambia(JsonObject(props + mapOf("fecha" to JsonPrimitive(f), "recordatorio" to JsonPrimitive(r), "por" to JsonPrimitive(if (r.isNotEmpty()) s.sesion.usuarioId ?: props.str("por").orEmpty() else ""))))
    }
    HojaLista(onCerrar, com.monrealperez.notiono.editor.Inline.etiquetaFecha(fecha).let { if (aviso.isNotEmpty()) "$it · con recordatorio" else it }) {
        for ((clave, texto, icono) in AtajosRecordar.ATAJOS) {
            val f = AtajosRecordar.atajo(clave) ?: continue
            FilaMenu(AtajosRecordar.titulo(texto), icono) { pon(f, "0"); onCerrar() }
        }
        Separador(Modifier.padding(vertical = 4.dp))
        FilaMenu("Elegir fecha y hora", "calendar-clock", detalle = fecha.replace('T', ' ')) { eligeDia = true }
        FilaMenu("Incluir hora", "clock", derecha = { if (conHora) Icono("check", color = Marca) }) {
            pon(if (conHora) fecha.take(10) else "${fecha.take(10)}T09:00", if (aviso.isNotEmpty() && AtajosRecordar.textoAntelacion(aviso, !conHora) == null) "0" else aviso)
        }
        Separador(Modifier.padding(vertical = 4.dp))
        TituloSeccionHoja("Recordar")
        FilaMenu("Ninguno", "bell-off", derecha = { if (aviso.isEmpty()) Icono("check", color = Marca) }) { pon(r = ""); onCerrar() }
        for ((id, texto) in AtajosRecordar.antelaciones(conHora)) {
            FilaMenu(texto, "bell", derecha = { if (aviso == id) Icono("check", color = Marca) }) { pon(r = id); onCerrar() }
        }
    }
    if (eligeDia) {
        val inicial = runCatching { LocalDate.parse(fecha.take(10)) }.getOrDefault(LocalDate.now())
        val st = rememberDatePickerState(initialSelectedDateMillis = inicial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { eligeDia = false },
            confirmButton = {
                TextButton({
                    dia = st.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    eligeDia = false
                }) { Text("Siguiente", color = Marca) }
            },
            dismissButton = { TextButton({ eligeDia = false }) { Text("Cancelar", color = C.texto) } },
        ) { DatePicker(st) }
    }
    dia?.let { d ->
        val previa = runCatching { LocalDateTime.parse(fecha) }.getOrNull()
        val st = rememberTimePickerState(previa?.hour ?: 9, previa?.minute ?: 0, is24Hour = true)
        AlertDialog(
            onDismissRequest = { dia = null },
            containerColor = C.fondo,
            text = { TimePicker(st) },
            confirmButton = {
                TextButton({
                    dia = null
                    pon("%sT%02d:%02d".format(d, st.hour, st.minute))
                    onCerrar()
                }) { Text("Listo", color = Marca) }
            },
            dismissButton = {
                // Sin hora: solo el día.
                TextButton({ dia = null; pon(d.toString(), if (aviso.isNotEmpty() && AtajosRecordar.textoAntelacion(aviso, false) == null) "0" else aviso); onCerrar() }) { Text("Sin hora", color = C.texto) }
            },
        )
    }
}

@Composable
private fun TituloSeccionHoja(t: String) =
    Text(t, fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(start = 16.dp, top = 4.dp, bottom = 2.dp))
