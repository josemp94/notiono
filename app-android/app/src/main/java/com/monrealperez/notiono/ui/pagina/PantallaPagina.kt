package com.monrealperez.notiono.ui.pagina

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.bd.PantallaBD
import com.monrealperez.notiono.bd.PantallaFicha
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.datos.Reciente
import com.monrealperez.notiono.editor.EditorPagina
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.Arbol
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.ConColorPagina
import com.monrealperez.notiono.ui.comun.HojaMover
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.espacios.Espacios
import com.monrealperez.notiono.ui.tema.C

/** Una página: documento (editor de bloques) o base de datos, con su barra y su menú «⋯». */
@Composable
fun PantallaPagina(id: String, alFinal: Boolean = false, vista: String? = null, nueva: Boolean = false) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val q = rememberConsulta("app.pagina", objeto("id" to id), etiquetas = setOf("pagina:$id"))
    val info = q.datos?.let { runCatching { json.decodeFromJsonElement(PaginaInfo.serializer(), it) }.getOrNull() }
    // Del disco una vez por página (y si cambia de sitio o de nombre), no en cada recomposición.
    val arbol = androidx.compose.runtime.remember(id, info?.parentId, info?.title) { Arbol.de(s.repo.cacheada("pages.tree")) }
    var menu by remember { mutableStateOf(false) }
    var comentarios by remember { mutableStateOf(false) }
    var ubicando by remember { mutableStateOf(false) }
    // No está en este espacio: si es de otro tuyo (un widget, un recordatorio, un enlace),
    // se pasa a él y se abre, como la web; si no, «no existe».
    var buscando by remember(id) { mutableStateOf(false) }
    LaunchedEffect(id, q.error?.tipo) {
        if (info == null && q.error?.tipo == ErrorApi.Tipo.NoEncontrado) {
            buscando = true
            Espacios.buscaPagina(ctx, id)
            buscando = false
        }
    }

    LaunchedEffect(info?.id, info?.title, info?.icon) {
        if (info != null && !info.embedded) {
            s.recientes.anota(s.espacioActivo(), Reciente(info.id, info.title, info.icon, System.currentTimeMillis()))
            s.repo.avisa("recientes")
        }
    }

    // El color de página tiñe el fondo, barra incluida (⋯ → Apariencia y diseño).
    ConColorPagina(info?.color) { Column(Modifier.fillMaxSize()) {
        BarraSuperior(
            izquierda = { BotonIcono("panel-left", n.abrirPanel) },
            centro = {
                // Miga de pan: la madre (toca para ir) y la página.
                val camino = arbol.camino(id)
                val madre = camino.getOrNull(camino.size - 2)
                if (madre != null) {
                    Row(Modifier.clickable { n.pagina(madre.id) }, verticalAlignment = Alignment.CenterVertically) {
                        IconoPagina(madre.icon, 16.dp)
                        Text(madre.title.ifBlank { "Sin título" }, fontSize = 14.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 4.dp).weight(1f, fill = false))
                        Text("  /  ", fontSize = 14.sp, color = C.borde)
                    }
                }
                if (info != null) {
                    IconoPagina(info.icon, 16.dp, porDefecto = if (info.esBd) "database" else "file-text")
                    Text(info.title.ifBlank { "Sin título" }, fontSize = 14.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 4.dp))
                }
            },
            acciones = {
                if (info?.locked == true) Icono("lock", tam = 16.dp, color = C.apagado, modifier = Modifier.padding(horizontal = 4.dp))
                BotonIcono("message-square", { comentarios = true })
                BotonIcono("ellipsis", { menu = true })
            },
        )
        if (info != null && ubicarNueva(nueva, info)) AñadirA { ubicando = true }
        when {
            info != null && info.esBd -> PantallaBD(info, vista)
            info != null -> EditorPagina(info, alFinal)
            buscando -> Vacio("Abriendo…", icono = "file-text")
            q.error != null -> Vacio(
                when (q.error?.tipo) {
                    ErrorApi.Tipo.NoEncontrado -> "Esta página no existe o no tienes acceso."
                    ErrorApi.Tipo.SinConexion -> "Sin conexión y sin copia guardada de esta página."
                    else -> q.error?.message ?: "No se pudo abrir"
                },
                icono = "file-text",
            )
            else -> Esqueleto(6)
        }
    } }
    if (ubicando) HojaMover(id) { ubicando = false }
    if (menu && info != null) MenuPagina(info, onCerrar = { menu = false }, onComentarios = { menu = false; comentarios = true })
    if (comentarios) HojaComentarios(id, null) { comentarios = false }
}

/**
 * ¿Sale «Añadir a ▾»? En las páginas recién creadas desde el botón de nueva página, el Inicio
 * o los widgets (`nueva`) mientras sigan en la raíz, como Notion en el móvil: si no se elige
 * sitio, se quedan donde están.
 */
fun ubicarNueva(nueva: Boolean, info: PaginaInfo) = nueva && info.parentId == null && !info.embedded && info.puedeEditar

/** La pastilla «Añadir a ▾ <espacio>»: abre el «Mover a» de siempre. */
@Composable
private fun AñadirA(onClick: () -> Unit) {
    val donde = com.monrealperez.notiono.ui.espacios.rememberYo()?.workspace?.name ?: "este espacio"
    Row(Modifier.padding(horizontal = 16.dp, vertical = 2.dp)) {
        Row(
            Modifier.clip(RoundedCornerShape(16.dp)).background(C.hover).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icono("folder-input", tam = 15.dp, color = C.apagado)
            Text("Añadir a", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(start = 6.dp))
            Text(donde, fontSize = 13.sp, color = C.texto, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 4.dp).weight(1f, fill = false))
            Icono("chevron-down", tam = 14.dp, color = C.apagado, modifier = Modifier.padding(start = 2.dp))
        }
    }
}

/** Una fila de BD abierta como página completa (enlace ?r=, Mis tareas, widgets). */
@Composable
fun PantallaFila(pageId: String, recordId: String) {
    val ctx = LocalContext.current
    val n = LocalNavegador.current
    // Una fila de otro espacio (un recordatorio, un widget): se pasa a él.
    LaunchedEffect(pageId) { Espacios.buscaPagina(ctx, pageId) }
    var comentarios by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        BarraSuperior(izquierda = { BotonIcono("arrow-left", { n.atras() }) }, acciones = {
            BotonIcono("message-square", { comentarios = true })
            BotonIcono("table", { n.pagina(pageId) })
        })
        PantallaFicha(pageId, recordId, onBorrada = { n.atras() })
    }
    if (comentarios) HojaComentarios(pageId, recordId) { comentarios = false }
}
