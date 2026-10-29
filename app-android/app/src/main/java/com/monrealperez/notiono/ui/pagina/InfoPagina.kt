package com.monrealperez.notiono.ui.pagina

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import com.monrealperez.notiono.ui.comun.Icono
import java.time.Instant
import java.time.ZoneId
import java.time.format.TextStyle
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.util.Fechas
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * El pie del menú, como el de Notion y la web (`pieInfo` de src/lib/infoPagina.ts, con las
 * mismas pruebas): «Recuento de palabras», «Última edición por …» y cuándo; lo demás
 * (caracteres, casillas, imágenes y adjuntos, creada), aparte, tras «Más información».
 */
fun pieInfo(i: JsonObject, ahora: Instant = Instant.now()): Pair<List<String>, List<String>> {
    fun num(k: String) = (i[k] as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
    fun miles(x: Int) = java.text.NumberFormat.getIntegerInstance(Fechas.es).apply { isGroupingUsed = x >= 10_000 }.format(x)
    fun n(x: Int, uno: String, varios: String) = miles(x) + " " + if (x == 1) uno else varios
    val adj = listOfNotNull(num("imagenes").takeIf { it > 0 }?.let { n(it, "imagen", "imágenes") }, num("adjuntos").takeIf { it > 0 }?.let { n(it, "adjunto", "adjuntos") })
    val creada = i.str("creada")?.let { cuandoInfo(it, ahora) }
    return listOfNotNull(
        "Recuento de palabras: ${miles(num("palabras"))}",
        i.str("editadaPor")?.let { "Última edición por $it" } ?: "Última edición",
        i.str("editada")?.let { cuandoInfo(it, ahora) },
    ) to listOfNotNull(
        n(num("caracteres"), "carácter", "caracteres"),
        num("casillas").takeIf { it > 0 }?.let { "Casillas: ${num("hechas")} de $it hechas" },
        adj.takeIf { it.isNotEmpty() }?.joinToString(" · "),
        creada?.let { c -> "Creada " + (if (c.startsWith("Hoy") || c.startsWith("Ayer")) c.replaceFirstChar { it.lowercase() } else "el $c") + (i.str("creadaPor")?.let { p -> " por $p" } ?: "") },
    )
}

/** «Hoy a las 10:51», «Ayer a las 9:05» o «29 oct 2026, 10:51» (hora de Madrid), como la web. */
fun cuandoInfo(iso: String, ahora: Instant = Instant.now()): String {
    val madrid = ZoneId.of("Europe/Madrid")
    val f = runCatching { Instant.parse(iso) }.getOrNull()?.atZone(madrid) ?: return iso
    val hoy = ahora.atZone(madrid).toLocalDate()
    val hora = "%02d:%02d".format(f.hour, f.minute)
    return when (f.toLocalDate()) {
        hoy -> "Hoy a las $hora"
        hoy.minusDays(1) -> "Ayer a las $hora"
        else -> "${f.dayOfMonth} ${f.month.getDisplayName(TextStyle.SHORT, Fechas.es).trimEnd('.')} ${f.year}, $hora"
    }
}

/** Al pie del menú de la página o de la ficha, como en la web (`app.info`). */
@Composable
fun InfoPagina(pageId: String, recordId: String? = null) {
    val input = if (recordId != null) objeto("id" to pageId, "recordId" to recordId) else objeto("id" to pageId)
    val i = rememberConsulta("app.info", input).datos?.comoObjeto ?: return
    val (principal, extra) = pieInfo(i)
    var mas by remember { mutableStateOf(false) }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).semantics { contentDescription = "Información de la página" }) {
        for (l in principal) Text(l, fontSize = 12.sp, color = C.apagado)
        Row(
            Modifier.padding(top = 2.dp).heightIn(min = 40.dp).clickable { mas = !mas },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icono(if (mas) "chevron-down" else "chevron-right", tam = 14.dp, color = C.apagado)
            Text("Más información", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(start = 4.dp))
        }
        if (mas) for (l in extra) Text(l, fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(start = 18.dp))
    }
}
