package com.monrealperez.notiono.ui.comun

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.NodoArbol
import com.monrealperez.notiono.datos.Repo
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.ui.tema.C
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

/** El árbol de páginas tal como lo da `pages.tree`, con sus hijos ordenados. */
class Arbol(val nodos: List<NodoArbol>) {
    val porId = nodos.associateBy { it.id }
    val hijos: Map<String?, List<NodoArbol>> = nodos.groupBy { it.parentId }.mapValues { (_, v) -> v.sortedBy { it.order } }
    fun de(padre: String?) = hijos[padre] ?: emptyList()

    /** Camino desde la raíz hasta la página (la miga de pan). */
    fun camino(id: String): List<NodoArbol> {
        val out = ArrayList<NodoArbol>()
        var actual = porId[id]
        var vueltas = 0
        while (actual != null && vueltas++ < 100) {
            out.add(0, actual)
            actual = actual.parentId?.let { porId[it] }
        }
        return out
    }

    /** ¿`id` está dentro del subárbol de `raiz`? (no se puede mover una página dentro de sí misma) */
    fun dentroDe(id: String, raiz: String): Boolean {
        var actual = porId[id]
        var vueltas = 0
        while (actual != null && vueltas++ < 100) {
            if (actual.id == raiz) return true
            actual = actual.parentId?.let { porId[it] }
        }
        return false
    }

    companion object {
        fun de(e: kotlinx.serialization.json.JsonElement?): Arbol =
            Arbol(e?.let { runCatching { json.decodeFromJsonElement(ListSerializer(NodoArbol.serializer()), it) }.getOrNull() } ?: emptyList())
    }
}

/** Las acciones sobre una página que salen en el panel y en el menu «⋯» de la página. */
object AccionesPagina {
    private suspend fun intenta(texto: String?, bloque: suspend () -> Unit) {
        try {
            bloque()
            if (texto != null) Avisos.di(texto)
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo hacer")
        }
    }

    suspend fun renombrar(repo: Repo, id: String, titulo: String, icono: String? = null, conIcono: Boolean = false) = intenta(null) {
        val input = if (conIcono) objeto("id" to id, "title" to titulo, "icon" to icono) else objeto("id" to id, "title" to titulo)
        repo.mutacion("pages.rename", input, pagina = id, etiquetas = listOf("arbol", "pagina:$id"))
    }

    suspend fun favorito(repo: Repo, id: String) = intenta(null) {
        repo.mutacion("pages.toggleFavorite", objeto("pageId" to id), etiquetas = listOf("favoritos", "pagina:$id"))
    }

    suspend fun duplicar(repo: Repo, id: String): String? {
        var nueva: String? = null
        intenta("Página duplicada") {
            nueva = repo.mutacion("pages.duplicate", objeto("id" to id), encolable = false, etiquetas = listOf("arbol"))?.comoObjeto?.str("id")
        }
        return nueva
    }

    suspend fun archivar(repo: Repo, id: String, alDeshacer: () -> Unit = {}) {
        try {
            repo.mutacion("pages.archive", objeto("id" to id), etiquetas = listOf("arbol", "favoritos", "papelera"))
            Avisos.di("Enviada a la papelera", "Deshacer") { alDeshacer() }
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo borrar")
        }
    }

    suspend fun restaurar(repo: Repo, id: String) = intenta("Restaurada") {
        repo.mutacion("pages.restore", objeto("id" to id), etiquetas = listOf("arbol", "papelera"))
    }

    suspend fun mover(repo: Repo, id: String, padre: String?, antesDe: String? = null, despuesDe: String? = null) = intenta(null) {
        repo.mutacion(
            "pages.move",
            objeto("id" to id, "parentId" to padre, "beforeId" to antesDe, "afterId" to despuesDe).let { o ->
                kotlinx.serialization.json.JsonObject(o.filterValues { it !is kotlinx.serialization.json.JsonNull } + ("parentId" to o.getValue("parentId")))
            },
            etiquetas = listOf("arbol", "pagina:$id"),
        )
    }

    /** Sube o baja una página entre sus hermanas (reordenar sin arrastrar). */
    suspend fun desplazar(repo: Repo, arbol: Arbol, id: String, delta: Int) {
        val nodo = arbol.porId[id] ?: return
        val hermanas = arbol.de(nodo.parentId)
        val i = hermanas.indexOfFirst { it.id == id }
        val j = i + delta
        if (j !in hermanas.indices) return
        if (delta < 0) mover(repo, id, nodo.parentId, antesDe = hermanas[j].id) else mover(repo, id, nodo.parentId, despuesDe = hermanas[j].id)
    }
}

/** Elegir a dónde mover una página: el árbol entero (sin su propio subárbol) o la raíz. */
@Composable
fun HojaMover(id: String, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val arbol = Arbol.de(rememberConsulta("pages.tree").datos)
    val alcance = rememberCoroutineScope()
    var filtro by remember { mutableStateOf("") }
    HojaLista(onCerrar, "Mover a") {
        Box(Modifier.padding(horizontal = 16.dp)) { Campo(filtro, { filtro = it }, placeholder = "Buscar página…") }
        FilaMenu("Espacio de trabajo (raíz)", "house") {
            alcance.launch { AccionesPagina.mover(s.repo, id, null); Avisos.di("Movida a la raíz"); onCerrar() }
        }
        val candidatas = arbol.nodos.filter { !arbol.dentroDe(it.id, id) && (filtro.isBlank() || it.title.contains(filtro, true)) }
        for (n in candidatas.sortedBy { arbol.camino(it.id).joinToString("/") { c -> c.order } }) {
            val nivel = arbol.camino(n.id).size - 1
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).clickable {
                    alcance.launch { AccionesPagina.mover(s.repo, id, n.id); Avisos.di("Movida a «${n.title.ifBlank { "Sin título" }}»"); onCerrar() }
                }.padding(start = (16 + if (filtro.isBlank()) nivel * 16 else 0).dp, end = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconoPagina(n.icon, 18.dp)
                Box(Modifier.width(10.dp))
                Text(n.title.ifBlank { "Sin título" }, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = C.texto)
            }
        }
        Box(Modifier.size(8.dp))
    }
}
