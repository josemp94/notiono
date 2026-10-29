package com.monrealperez.notiono.ui.pagina

import androidx.compose.foundation.layout.Column
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

/** Las líneas de «Información de la página» (las mismas que en la web), de la respuesta de `app.info`. */
fun lineasInfo(i: JsonObject): List<String> {
    fun num(k: String) = (i[k] as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
    fun n(x: Int, uno: String, varios: String) = "%,d".format(Fechas.es, x) + " " + if (x == 1) uno else varios
    val adj = listOfNotNull(num("imagenes").takeIf { it > 0 }?.let { n(it, "imagen", "imágenes") }, num("adjuntos").takeIf { it > 0 }?.let { n(it, "adjunto", "adjuntos") })
    return listOfNotNull(
        "${n(num("palabras"), "palabra", "palabras")} · ${n(num("caracteres"), "carácter", "caracteres")}",
        num("casillas").takeIf { it > 0 }?.let { "Casillas: ${num("hechas")} de $it hechas" },
        adj.takeIf { it.isNotEmpty() }?.joinToString(" · "),
        i.str("creada")?.let { "Creada el ${Fechas.fechaHora(it)}" + (i.str("creadaPor")?.let { p -> " por $p" } ?: "") },
        i.str("editada")?.let { "Editada el ${Fechas.fechaHora(it)}" + (i.str("editadaPor")?.let { p -> " por $p" } ?: "") },
    )
}

/** Al pie del menú de la página o de la ficha, como en la web (`app.info`). */
@Composable
fun InfoPagina(pageId: String, recordId: String? = null) {
    val input = if (recordId != null) objeto("id" to pageId, "recordId" to recordId) else objeto("id" to pageId)
    val i = rememberConsulta("app.info", input).datos?.comoObjeto ?: return
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).semantics { contentDescription = "Información de la página" }) {
        for (l in lineasInfo(i)) Text(l, fontSize = 12.sp, color = C.apagado)
    }
}
