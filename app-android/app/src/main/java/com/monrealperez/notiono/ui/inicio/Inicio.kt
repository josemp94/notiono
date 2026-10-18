package com.monrealperez.notiono.ui.inicio

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tareas.FilaTarea
import com.monrealperez.notiono.ui.tema.C
import java.time.LocalTime

/** Inicio, como el Home de Notion y el de la web: saludo, recientes y mis tareas. */
@Composable
fun PantallaInicio() {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val yo = rememberConsulta("auth.me", etiquetas = setOf("espacio")).datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }
    val tareas = rememberConsulta("db.myTasks", etiquetas = setOf("tareas", "espacio")).datos?.comoLista?.map { it.comoObjeto } ?: emptyList()
    val recientes = remember(yo?.workspace?.id) { s.recientes.lista(yo?.workspace?.id) }
    val h = LocalTime.now().hour
    val saludo = when {
        h < 7 -> "Buenas noches"
        h < 13 -> "Buenos días"
        h < 21 -> "Buenas tardes"
        else -> "Buenas noches"
    }
    val nombre = yo?.name?.split(" ")?.firstOrNull().orEmpty()
    Column(Modifier.fillMaxSize()) {
        BarraSuperior(izquierda = { BotonIcono("panel-left", n.abrirPanel) })
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Text(
                if (nombre.isNotBlank()) "$saludo, $nombre" else saludo,
                fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = C.texto, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
            )
            if (recientes.isNotEmpty()) {
                Encabezado("clock", "Recientes")
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    for (r in recientes.take(8)) {
                        Column(
                            Modifier.width(140.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, C.borde, RoundedCornerShape(10.dp))
                                .clickable { n.pagina(r.pageId) }.padding(12.dp),
                        ) {
                            IconoPagina(r.icon, 24.dp)
                            Text(r.title.ifBlank { "Sin título" }, fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 2,
                                overflow = TextOverflow.Ellipsis, color = C.texto, modifier = Modifier.padding(top = 8.dp).height(40.dp))
                        }
                    }
                }
            }
            if (tareas.isNotEmpty()) {
                Encabezado("circle-check", "Mis tareas")
                Column(Modifier.padding(horizontal = 16.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, C.borde, RoundedCornerShape(10.dp))) {
                    for (t in tareas.take(6)) FilaTarea(t)
                }
                if (tareas.size > 6) {
                    Row(Modifier.padding(16.dp).clickable { n.a("tareas") }, verticalAlignment = Alignment.CenterVertically) {
                        Text("Ver todas", color = C.apagado, fontSize = 14.sp)
                        Icono("arrow-right", tam = 14.dp, color = C.apagado, modifier = Modifier.padding(start = 4.dp))
                    }
                }
            }
            if (recientes.isEmpty() && tareas.isEmpty()) {
                Text(
                    "Aquí saldrán tus páginas recientes y lo que tengas asignado. Abre una página del panel para empezar.",
                    color = C.apagado, fontSize = 14.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.padding(24.dp).fillMaxWidth().border(1.dp, C.borde, RoundedCornerShape(10.dp)).padding(24.dp),
                )
            }
        }
    }
}

@Composable
private fun Encabezado(icono: String, texto: String) {
    Row(Modifier.padding(start = 16.dp, top = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icono(icono, tam = 15.dp, color = C.apagado)
        Text(texto, color = C.apagado, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 6.dp))
    }
}
