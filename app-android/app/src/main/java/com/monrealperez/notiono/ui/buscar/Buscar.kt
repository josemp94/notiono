package com.monrealperez.notiono.ui.buscar

import androidx.compose.foundation.clickable
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
import com.monrealperez.notiono.ui.comun.Campo
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
            val input = objeto("query" to q, "inContent" to true, "tipo" to tipo).let { if (dias != null) JsonObject(it + ("editadoDias" to kotlinx.serialization.json.JsonPrimitive(dias))) else it }
            resultados = s.repo.consulta("pages.search", input, cachear = false).comoLista.map { it.comoObjeto }
            error = null
        } catch (e: ErrorApi) {
            error = if (e.sinConexion) "Sin conexión: buscando solo en títulos guardados" else e.message
            // Sin red, al menos los títulos del árbol guardado.
            val arbol = s.repo.cacheada("pages.tree")?.comoLista?.map { it.comoObjeto } ?: emptyList()
            resultados = arbol.filter { (it.str("title") ?: "").contains(q, ignoreCase = true) }
        }
    }
    Column(Modifier.fillMaxSize()) {
        BarraSuperior(izquierda = { BotonIcono("arrow-left", { n.atras() }) }, centro = {
            Box(Modifier.weight(1f)) { Campo(q, { q = it }, placeholder = "Buscar en Notiono…", autofoco = true) }
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
                items(recientes, key = { it.pageId }) { r -> Resultado(r.title, r.icon, null) { n.pagina(r.pageId) } }
            }
        } else if (lista.isEmpty()) {
            Vacio("Nada coincide con «$q».", icono = "search")
        } else {
            LazyColumn {
                items(lista, key = { it.str("id") ?: "" }) { r ->
                    Resultado(r.str("title").orEmpty(), r.str("icon"), if (r.bool("inTitle") || r["inTitle"] == null) null else "Coincide en el contenido") {
                        n.pagina(r.str("id")!!)
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
private fun Resultado(titulo: String, icono: String?, detalle: String?, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        IconoPagina(icono, 20.dp)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(titulo.ifBlank { "Sin título" }, fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (detalle != null) Text(detalle, fontSize = 12.sp, color = C.apagado)
        }
        Icono("chevron-right", tam = 16.dp, color = C.borde)
    }
}
