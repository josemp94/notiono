package com.monrealperez.notiono.ui.panel

import androidx.activity.compose.rememberLauncherForActivityResult
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.NodoArbol
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.AccionesPagina
import com.monrealperez.notiono.ui.comun.Arbol
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaMover
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.PedirTexto
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.espacios.Espacios
import com.monrealperez.notiono.ui.espacios.HojaEspacios
import com.monrealperez.notiono.ui.espacios.Puede
import androidx.compose.foundation.shape.CircleShape
import com.monrealperez.notiono.ui.tema.C
import kotlinx.coroutines.launch

/** Panel lateral: espacio, accesos, favoritos y el árbol de páginas (como el sidebar de la web). */
@Composable
fun Panel(onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val arbolQ = rememberConsulta("pages.tree", etiquetas = setOf("arbol"))
    val favQ = rememberConsulta("favorites.list", etiquetas = setOf("favoritos", "arbol"))
    val yoQ = rememberConsulta("auth.me", etiquetas = setOf("espacio"))
    val yo = yoQ.datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }
    val arbol = Arbol.de(arbolQ.datos)
    val favoritos = favQ.datos?.comoLista?.map { it.comoObjeto }?.distinctBy { it.str("id") } ?: emptyList()
    var abiertos by rememberSaveable { mutableStateOf(setOf<String>()) }
    var menuDe by remember { mutableStateOf<NodoArbol?>(null) }
    // La pulsación larga en un favorito: Subir/Bajar mueven entre los favoritos, no en el árbol.
    var menuEnFavoritos by remember { mutableStateOf(false) }
    var moviendo by remember { mutableStateOf<String?>(null) }
    var renombrando by remember { mutableStateOf<NodoArbol?>(null) }
    var espacios by remember { mutableStateOf(false) }
    val puede = Puede.de(yo)
    val listaEspacios = Espacios.lista(rememberConsulta("workspace.list", etiquetas = setOf("espacios", "bandeja")).datos)

    fun ir(accion: () -> Unit) {
        accion()
        onCerrar()
    }

    val importar = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) alcance.launch {
            Importar.archivo(ctx, uri, padre = null)?.let { id -> ir { n.pagina(id) } }
        }
    }

    // Filas visibles del árbol (las abiertas despliegan a sus hijas).
    val filas = remember(arbol, abiertos) {
        val out = ArrayList<Pair<NodoArbol, Int>>()
        fun baja(padre: String?, nivel: Int) {
            for (h in arbol.de(padre)) {
                out.add(h to nivel)
                if (h.id in abiertos) baja(h.id, nivel + 1)
            }
        }
        baja(null, 0)
        out
    }

    LazyColumn(Modifier.fillMaxSize().statusBarsPadding()) {
        item {
            Row(
                Modifier.fillMaxWidth().clickable { espacios = true }.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(26.dp).clip(RoundedCornerShape(6.dp)).background(C.activo), contentAlignment = Alignment.Center) {
                    val ic = yo?.workspace?.icon
                    if (ic != null) IconoPagina(ic, 18.dp) else Text((yo?.workspace?.name ?: "N").take(1).uppercase(), fontWeight = FontWeight.Bold, color = C.texto)
                }
                Text(
                    yo?.workspace?.name ?: "Notiono",
                    fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = C.texto,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false).padding(start = 10.dp, end = 6.dp),
                )
                // Avisos sin leer en otro espacio: un punto, como en la web.
                if (Espacios.avisosFuera(listaEspacios, yo?.workspace?.id)) Box(Modifier.size(8.dp).clip(CircleShape).background(com.monrealperez.notiono.ui.tema.Marca))
                Box(Modifier.weight(1f))
                Icono("chevron-down", tam = 16.dp, color = C.apagado)
            }
            FilaPanel("Buscar", "search") { ir { n.a("buscar") } }
            FilaPanel("Inicio", "house") { ir { n.nav.navigate("inicio") { popUpTo("inicio") { inclusive = true } } } }
            FilaPanel("Bandeja", "inbox") { ir { n.a("bandeja") } }
            FilaPanel("Ajustes", "settings") { ir { n.a("ajustes") } }
        }
        if (favoritos.isNotEmpty()) {
            item { TituloSeccion("Favoritos") }
            items(favoritos, key = { "fav-" + it.str("id") }) { f ->
                FilaArbol(
                    titulo = f.str("title").orEmpty(), icono = f.str("icon"), nivel = 0, abierto = false, tieneHijos = false,
                    onClick = { ir { n.pagina(f.str("id")!!) } },
                    onLargo = { arbol.porId[f.str("id")]?.let { menuDe = it; menuEnFavoritos = true } },
                )
            }
        }
        item {
            // Para un invitado, lo compartido con él (como el panel de la web y el de Notion).
            TituloSeccion(if (puede.invitado) "Compartido" else "Páginas") {
                if (puede.crear) Box(Modifier.size(28.dp).clip(RoundedCornerShape(6.dp)).clickable { ir { n.nuevaPagina(null) } }, contentAlignment = Alignment.Center) {
                    Icono("plus", tam = 16.dp, color = C.apagado)
                }
            }
        }
        if (filas.isEmpty() && !arbolQ.cargando) {
            item { Text(if (puede.invitado) "Ya no tienes páginas compartidas aquí." else "Aún no hay páginas", color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(16.dp)) }
        }
        items(filas, key = { it.first.id }) { (nodo, nivel) ->
            FilaArbol(
                titulo = nodo.title, icono = nodo.icon, nivel = nivel,
                abierto = nodo.id in abiertos, tieneHijos = nodo.hasChildren,
                onAlternar = { abiertos = if (nodo.id in abiertos) abiertos - nodo.id else abiertos + nodo.id },
                onClick = { ir { n.pagina(nodo.id) } },
                onLargo = { menuDe = nodo; menuEnFavoritos = false },
                onMas = if (puede.rol == "viewer") null else ({ abiertos = abiertos + nodo.id; ir { n.nuevaPagina(nodo.id) } }),
            )
        }
        item {
            Separador(Modifier.padding(vertical = 8.dp))
            if (puede.crear) FilaPanel("Nueva página", "square-pen") { ir { n.nuevaPagina(null) } }
            if (puede.crear) FilaPanel("Nueva base de datos", "database") {
                alcance.launch {
                    try {
                        val r = s.repo.mutacion("db.create", objeto("title" to "Base de datos"), encolable = false, etiquetas = listOf("arbol"))
                        r?.comoObjeto?.str("id")?.let { id -> ir { n.pagina(id) } }
                    } catch (e: ErrorApi) {
                        Avisos.di(e.message ?: "No se pudo crear")
                    }
                }
            }
            if (puede.crear) FilaPanel("Plantillas", "sparkles") { ir { n.a("plantillas") } }
            if (puede.crear) FilaPanel("Importar (Markdown o CSV)", "file-up") { importar.launch(arrayOf("text/*", "text/markdown", "text/csv", "application/octet-stream")) }
            if (puede.papelera) FilaPanel("Papelera", "trash-2") { ir { n.a("papelera") } }
            Box(Modifier.height(24.dp))
        }
    }

    menuDe?.let { nodo ->
        val esFav = favoritos.any { it.str("id") == nodo.id }
        Hoja({ menuDe = null }, nodo.title.ifBlank { "Sin título" }) {
            if (puede.rol != "viewer") FilaMenu("Añadir subpágina", "plus") { menuDe = null; abiertos = abiertos + nodo.id; ir { n.nuevaPagina(nodo.id) } }
            FilaMenu(if (esFav) "Quitar de favoritos" else "Añadir a favoritos", if (esFav) "star-off" else "star") {
                menuDe = null; alcance.launch { AccionesPagina.favorito(s.repo, nodo.id) }
            }
            if (puede.rol != "viewer") FilaMenu("Renombrar", "pencil") { menuDe = null; renombrando = nodo }
            if (puede.organizar) {
                FilaMenu("Duplicar", "copy-plus") { menuDe = null; alcance.launch { AccionesPagina.duplicar(s.repo, nodo.id) } }
                FilaMenu("Mover a…", "folder-input") { menuDe = null; moviendo = nodo.id }
            }
            if (menuEnFavoritos) {
                val i = favoritos.indexOfFirst { it.str("id") == nodo.id }
                favoritos.getOrNull(i - 1)?.str("id")?.let { antes ->
                    FilaMenu("Subir en favoritos", "arrow-up") { menuDe = null; alcance.launch { AccionesPagina.mueveFavorito(s.repo, nodo.id, antesDe = antes) } }
                }
                favoritos.getOrNull(i + 1)?.str("id")?.takeIf { i >= 0 }?.let { despues ->
                    FilaMenu("Bajar en favoritos", "arrow-down") { menuDe = null; alcance.launch { AccionesPagina.mueveFavorito(s.repo, nodo.id, despuesDe = despues) } }
                }
            } else if (puede.organizar) {
                FilaMenu("Subir", "arrow-up") { menuDe = null; alcance.launch { AccionesPagina.desplazar(s.repo, arbol, nodo.id, -1) } }
                FilaMenu("Bajar", "arrow-down") { menuDe = null; alcance.launch { AccionesPagina.desplazar(s.repo, arbol, nodo.id, 1) } }
            }
            if (puede.organizar) FilaMenu("Enviar a la papelera", "trash-2", color = androidx.compose.ui.graphics.Color(0xFFD44C47)) {
                menuDe = null
                alcance.launch { AccionesPagina.archivar(s.repo, nodo.id) { alcance.launch { AccionesPagina.restaurar(s.repo, nodo.id) } } }
            }
        }
    }
    moviendo?.let { HojaMover(it) { moviendo = null } }
    renombrando?.let { nodo ->
        PedirTexto("Renombrar", nodo.title, onOk = { t ->
            renombrando = null
            alcance.launch { AccionesPagina.renombrar(s.repo, nodo.id, t) }
        }, onNo = { renombrando = null })
    }
    if (espacios) HojaEspacios(
        yo, onCerrar = { espacios = false },
        // Otro espacio: al Inicio de ese espacio, sin las páginas del anterior detrás (como la web al recargar).
        onCambiado = { ir { n.nav.navigate("inicio") { popUpTo(0) { inclusive = true } } } },
        onAjustes = { espacios = false; ir { n.a("espacio/general") } },
        onInvitar = { espacios = false; ir { n.a("espacio/personas") } },
    )
}

@Composable
private fun FilaPanel(texto: String, icono: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 6.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icono(icono, tam = 18.dp, color = C.apagado)
        Text(texto, fontSize = 15.sp, color = C.texto)
    }
}

@Composable
private fun FilaArbol(
    titulo: String,
    icono: String?,
    nivel: Int,
    abierto: Boolean,
    tieneHijos: Boolean,
    onClick: () -> Unit,
    onLargo: () -> Unit,
    onAlternar: (() -> Unit)? = null,
    onMas: (() -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 6.dp).clip(RoundedCornerShape(8.dp))
            .combinedClickable(onClick = onClick, onLongClick = onLargo)
            .padding(start = (4 + nivel * 16).dp, end = 4.dp).height(38.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(6.dp)).let { if (onAlternar != null) it.clickable(onClick = onAlternar) else it },
            contentAlignment = Alignment.Center,
        ) {
            if (onAlternar != null) Icono(if (abierto) "chevron-down" else "chevron-right", tam = 15.dp, color = if (tieneHijos) C.apagado else C.borde)
        }
        IconoPagina(icono, 18.dp)
        Text(
            titulo.ifBlank { "Sin título" }, fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(start = 8.dp),
        )
        if (onMas != null) {
            Box(Modifier.size(32.dp).clip(RoundedCornerShape(6.dp)).clickable(onClick = onMas), contentAlignment = Alignment.Center) {
                Icono("plus", tam = 15.dp, color = C.apagado)
            }
        }
    }
}
