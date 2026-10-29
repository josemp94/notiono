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
import kotlinx.serialization.json.JsonNull
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
 * «Recordarme…» de una página o una fila (como en la web): los atajos, «Elegir fecha y
 * hora» y, si ya hay uno, quitarlo. Lo pone el servidor (`app.recordar`) arriba de la
 * página como «Recordatorio: <fecha>», y suena a su hora con una alarma del móvil.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HojaRecordar(pageId: String, recordId: String?, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberAlcance()
    val base = if (recordId != null) objeto("id" to pageId, "recordId" to recordId) else objeto("id" to pageId)
    var actual by remember { mutableStateOf<String?>(null) }
    var eligeDia by remember { mutableStateOf(false) }
    var dia by remember { mutableStateOf<LocalDate?>(null) }
    LaunchedEffect(pageId, recordId) {
        actual = runCatching { s.repo.consulta("app.recordatorio", base, cachear = false).takeIf { it != JsonNull }?.comoObjeto?.str("fecha") }.getOrNull()
    }
    fun pon(fecha: String?) = alcance.launch {
        try {
            val input = kotlinx.serialization.json.JsonObject(base + ("fecha" to (fecha?.let { kotlinx.serialization.json.JsonPrimitive(it) } ?: JsonNull)))
            s.repo.mutacion("app.recordar", input, encolable = false, etiquetas = listOf("bloques:${recordId ?: pageId}", "vista:$pageId"))
            Avisos.di(if (fecha != null) "Te lo recordaré ${AtajosRecordar.cuando(fecha)}" else "Recordatorio quitado")
            Alarmas.actualiza(ctx, "recordar")
        } catch (e: ErrorApi) {
            Avisos.di(if (e.sinConexion) "Sin conexión: el recordatorio se pone en el servidor" else e.message ?: "No se pudo")
        }
        onCerrar()
    }
    HojaLista(onCerrar, "Recordarme") {
        for ((clave, texto, icono) in AtajosRecordar.ATAJOS) {
            val f = AtajosRecordar.atajo(clave) ?: continue
            FilaMenu(texto, icono) { pon(f) }
        }
        FilaMenu("Elegir fecha y hora", "calendar-clock") { eligeDia = true }
        actual?.let { FilaMenu("Quitar recordatorio", "bell-off", detalle = AtajosRecordar.cuando(it)) { pon(null) } }
    }
    if (eligeDia) {
        val st = rememberDatePickerState(initialSelectedDateMillis = LocalDate.now().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
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
        val st = rememberTimePickerState(9, 0, is24Hour = true)
        AlertDialog(
            onDismissRequest = { dia = null },
            containerColor = C.fondo,
            text = { TimePicker(st) },
            confirmButton = {
                TextButton({
                    dia = null
                    pon("%sT%02d:%02d".format(d, st.hour, st.minute))
                }) { Text("Recordarme", color = Marca) }
            },
            dismissButton = { TextButton({ dia = null }) { Text("Cancelar", color = C.texto) } },
        )
    }
}
