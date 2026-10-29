package com.monrealperez.notiono.ui.buscar

import androidx.compose.foundation.clickable
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject

/** Buscador global (el Ctrl+K de la web): títulos y contenido, con filtros de tipo y fecha. */
@Composable
fun PantallaBuscar() {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    var q by rememberSaveable { mutableStateOf("") }
    var tipo by rememberSaveable { mutableStateOf("all") }
    var dias by rememberSaveable { mutableStateOf<Int?>(null) }
    var resultados by remember { mutableStateOf<List<JsonObject>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(q, tipo, dias) {
        if (q.isBlank()) {
            resultados = null
            return@LaunchedEffect
        }
        delay(250)
        try {
            // `filas`: también las filas de BD (las notas de una BD «Notas»), como el buscador de Notion.
            val input = objeto("query" to q, "inContent" to true, "tipo" to tipo, "filas" to true).let { if (dias != null) JsonObject(it + ("editadoDias" to kotlinx.serialization.json.JsonPrimitive(dias))) else it }
            resultados = s.repo.consulta("pages.search", input, cachear = false).comoLista.map { it.comoObjeto }.distinctBy { it.str("recordId") ?: it.str("id") }
            error = null
        } catch (e: ErrorApi) {
            error = if (e.sinConexion) "Sin conexión: buscando solo en títulos guardados" else e.message
            // Sin red, al menos los títulos del árbol guardado.
            val arbol = s.repo.cacheada("pages.tree")?.comoLista?.map { it.comoObjeto } ?: emptyList()
            resultados = arbol.filter { (it.str("title") ?: "").contains(q, ignoreCase = true) }
        }
    }
    // El color de página de cada una (su barrita), del árbol guardado; el de las filas viene en el resultado.
    val colores = remember(resultados) { com.monrealperez.notiono.ui.comun.Arbol.de(s.repo.cacheada("pages.tree")).nodos.associate { it.id to it.color } }
    Column(Modifier.fillMaxSize()) {
        BarraSuperior(izquierda = { BotonIcono("arrow-left", { n.atras() }) }, centro = {
            CampoBusqueda(q, { q = it }, Modifier.weight(1f))
        })
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Filtro("Todo", tipo == "all") { tipo = "all" }
            Filtro("Páginas", tipo == "doc") { tipo = "doc" }
            Filtro("Bases de datos", tipo == "database") { tipo = "database" }
            Filtro("Últimos 7 días", dias == 7) { dias = if (dias == 7) null else 7 }
            Filtro("Últimos 30 días", dias == 30) { dias = if (dias == 30) null else 30 }
        }
        error?.let { Text(it, color = C.apagado, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
        val lista = resultados
        if (lista == null) {
            val recientes = s.recientes.lista(s.espacioActivo())
            if (recientes.isEmpty()) Vacio("Escribe para buscar en títulos y en el contenido de las páginas.", icono = "search")
            else LazyColumn {
                item { TituloSeccion("Recientes") }
                items(recientes, key = { it.pageId }) { r -> Resultado(r.title, r.icon, null, colores[r.pageId]) { n.pagina(r.pageId) } }
            }
        } else if (lista.isEmpty()) {
            Vacio("Nada coincide con «$q».", icono = "search")
        } else {
            LazyColumn {
                items(lista, key = { it.str("recordId") ?: it.str("id") ?: "" }) { r ->
                    val fila = r.str("recordId")
                    val enContenido = !(r.bool("inTitle") || r["inTitle"] == null)
                    if (fila != null) {
                        // Una fila de BD: su título y el nombre de su base de datos; se abre como página.
                        Resultado(
                            r.str("title").orEmpty(), null, (r.str("dbTitle")?.ifBlank { null } ?: "Base de datos") + if (enContenido) " · coincide en el contenido" else "",
                            r.str("color"), porDefecto = "file-text",
                        ) { n.fila(r.str("id")!!, fila) }
                    } else {
                        Resultado(r.str("title").orEmpty(), r.str("icon"), if (enContenido) "Coincide en el contenido" else null, colores[r.str("id")],
                            porDefecto = if (r.str("type") == "database") "database" else "file-text") {
                            n.pagina(r.str("id")!!)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Filtro(texto: String, activo: Boolean, onClick: () -> Unit) {
    FilterChip(
        activo, onClick, { Text(texto, fontSize = 13.sp) },
        shape = RoundedCornerShape(16.dp),
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.marcaSuave, selectedLabelColor = Marca),
    )
}

@Composable
private fun Resultado(titulo: String, icono: String?, detalle: String?, color: String?, porDefecto: String = "file-text", onClick: () -> Unit) {
    // La barrita del color de página en el margen, sin mover el icono ni el título de los que no tienen.
    val barra = com.monrealperez.notiono.ui.comun.ColorPagina.barra(color, C.oscuro)
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick)
            .drawBehind {
                if (barra != null) drawRoundRect(
                    barra, topLeft = androidx.compose.ui.geometry.Offset(7.dp.toPx(), size.height / 2 - 10.dp.toPx()),
                    size = androidx.compose.ui.geometry.Size(3.dp.toPx(), 20.dp.toPx()), cornerRadius = androidx.compose.ui.geometry.CornerRadius(2.dp.toPx()),
                )
            }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconoPagina(icono, 20.dp, porDefecto = porDefecto)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(titulo.ifBlank { "Sin título" }, fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (detalle != null) Text(detalle, fontSize = 12.sp, color = C.apagado)
        }
        Icono("chevron-right", tam = 16.dp, color = C.borde)
    }
}

/** El campo de la barra: compacto y relleno, como el de Notion (el de Material no cabe en 52 dp). */
@Composable
private fun CampoBusqueda(q: String, onCambio: (String) -> Unit, modifier: Modifier = Modifier) {
    val foco = remember { androidx.compose.ui.focus.FocusRequester() }
    androidx.compose.foundation.text.BasicTextField(
        q, onCambio,
        modifier = modifier.focusRequester(foco),
        singleLine = true,
        textStyle = androidx.compose.ui.text.TextStyle(fontSize = 16.sp, color = C.texto),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(Marca),
        decorationBox = { campo ->
            Row(
                Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(10.dp)).background(C.hover).padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icono("search", tam = 18.dp, color = C.apagado)
                Box(Modifier.weight(1f).padding(start = 8.dp)) {
                    if (q.isEmpty()) Text("Buscar en Notiono…", fontSize = 16.sp, color = C.apagado, maxLines = 1)
                    campo()
                }
                if (q.isNotEmpty()) Box(Modifier.size(28.dp).clip(CircleShape).clickable { onCambio("") }, contentAlignment = Alignment.Center) {
                    Icono("x", tam = 16.dp, color = C.apagado)
                }
            }
        },
    )
    LaunchedEffect(Unit) { runCatching { foco.requestFocus() } }
}
