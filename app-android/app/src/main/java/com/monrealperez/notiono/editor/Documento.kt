package com.monrealperez.notiono.editor

import android.text.SpannableStringBuilder
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Dónde poner el cursor cuando un bloque se pinte (tras partir, unir, crear…). */
data class PeticionFoco(val id: String, val pos: Int, val n: Long = System.nanoTime())

/** Un menú abierto mientras se escribe: «/» (bloques) o «@» (menciones). */
data class MenuEscritura(val tipo: Char, val bloqueId: String, val inicio: Int, val consulta: String)

/** Una fila de lo que se ve: el bloque, su sangría y lo que necesita para pintarse. */
data class FilaVisible(
    val b: Bloque,
    val sangria: Int,
    /** Número de la lista numerada (o null). */
    val numero: Int?,
    /** El bloque es la primera fila de una columna que no es la primera (separador). */
    val inicioColumna: Int?,
)

private val LISTAS = setOf("bulletListItem", "numberedListItem", "checkListItem", "toggleListItem")

/**
 * El documento que se está editando y todo lo que el teclado le hace. Es Android puro
 * (sin red): la sincronía va aparte ([Sincro]) y lo único que hace este estado es
 * avisar con [alCambiar] de que hay algo nuevo que guardar.
 */
class EstadoEditor(var pal: Paleta, val editable: Boolean) {
    val raiz: MutableList<Bloque> = mutableListOf()

    /** Sube con cada cambio de estructura: Compose vuelve a calcular lo visible. */
    var version by mutableIntStateOf(0)
        private set
    var foco by mutableStateOf<PeticionFoco?>(null)
    var menu by mutableStateOf<MenuEscritura?>(null)
    var enfocado by mutableStateOf<String?>(null)
    var seleccion by mutableStateOf(0 to 0)

    /** Desplegables abiertos (los toggles nacen cerrados, como en la web). */
    val abiertos = mutableSetOf<String>()

    /** Bloques tocados desde el último envío. */
    val sucios = mutableSetOf<String>()

    /** Estilos que se aplicarán a lo próximo que se escriba (B sin selección). */
    var pendientes by mutableStateOf<Map<String, JsonElement>>(emptyMap())

    var alCambiar: () -> Unit = {}

    fun carga(bloques: List<JsonObject>) {
        raiz.clear()
        bloques.forEach { raiz.add(Bloque.deJson(it, pal)) }
        if (raiz.isEmpty() && editable) raiz.add(Bloque.nuevo())
        version++
    }

    fun json(): List<JsonObject> = raiz.map { it.aJson() }

    fun busca(id: String) = Bloques.busca(raiz, id)

    /** El texto de un bloque cambió (no hace falta repintar la lista). */
    fun texto(b: Bloque) {
        sucios += b.id
        alCambiar()
    }

    /** Algo cambió de forma (bloques nuevos, movidos, convertidos…). */
    fun estructura(vararg tocados: Bloque) {
        tocados.forEach { sucios += it.id }
        version++
        alCambiar()
    }

    /** Repintar tras adoptar lo del servidor (no hay nada que mandar). */
    fun estructuraSinAviso() {
        version++
    }

    // ---------- lo que se ve ----------

    fun esPlegable(b: Bloque) = b.tipo == "toggleListItem" || (b.tipo == "heading" && b.propBool("isToggleable"))

    fun visibles(): List<FilaVisible> {
        val out = ArrayList<FilaVisible>()
        fun baja(lista: List<Bloque>, sangria: Int) {
            var numero = 0
            for (b in lista) {
                numero = if (b.tipo == "numberedListItem") {
                    val inicio = (b.props["start"] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()
                    if (numero == 0 || inicio != null) inicio ?: 1 else numero + 1
                } else 0
                when (b.tipo) {
                    // Columnas apiladas, como en la app de Notion: sin sangría, una tras otra.
                    "columnList" -> {
                        b.hijos.forEachIndexed { i, col ->
                            val antes = out.size
                            baja(col.hijos, sangria)
                            if (i > 0 && out.size > antes) out[antes] = out[antes].copy(inicioColumna = i + 1)
                        }
                    }
                    "column" -> baja(b.hijos, sangria)
                    else -> {
                        out.add(FilaVisible(b, sangria, if (b.tipo == "numberedListItem") numero else null, null))
                        val oculto = esPlegable(b) && b.id !in abiertos
                        if (!oculto) baja(b.hijos, sangria + 1)
                    }
                }
            }
        }
        baja(raiz, 0)
        return out
    }

    fun alternaPlegado(b: Bloque) {
        if (!abiertos.add(b.id)) abiertos.remove(b.id)
        version++
    }

    // ---------- edición ----------

    private fun sitio(b: Bloque) = Bloques.sitio(raiz, b.id)

    /** Bloque de texto anterior en el orden en que se lee (para unir con Retroceso). */
    fun anteriorVisible(b: Bloque): Bloque? {
        val v = visibles().map { it.b }
        val i = v.indexOfFirst { it.id == b.id }
        return if (i > 0) v[i - 1] else null
    }

    fun siguienteVisible(b: Bloque): Bloque? {
        val v = visibles().map { it.b }
        val i = v.indexOfFirst { it.id == b.id }
        return v.getOrNull(i + 1)
    }

    fun insertaDespues(ref: Bloque?, nuevo: Bloque, enfocar: Boolean = true) {
        if (ref == null) raiz.add(nuevo)
        else {
            val (lista, i) = sitio(ref) ?: (raiz to raiz.size - 1)
            lista.add(i + 1, nuevo)
        }
        if (enfocar && nuevo.esTexto) foco = PeticionFoco(nuevo.id, 0)
        estructura(nuevo)
    }

    fun insertaAlFinal(nuevo: Bloque) {
        raiz.add(nuevo)
        if (nuevo.esTexto) foco = PeticionFoco(nuevo.id, 0)
        estructura(nuevo)
    }

    /** Enter: parte el bloque por el cursor (en listas, elemento nuevo; en uno vacío, sale de la lista). */
    fun enter(b: Bloque, pos: Int) {
        val t = b.texto ?: return
        if (b.tipo in LISTAS && t.isEmpty()) {
            if (Bloques.padreDe(raiz, b.id)?.tipo in LISTAS) desangra(b) else convierte(b, "paragraph")
            foco = PeticionFoco(b.id, 0)
            return
        }
        val tipoNuevo = when (b.tipo) {
            "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem" -> b.tipo
            else -> "paragraph"
        }
        if (pos == 0 && t.isNotEmpty()) {
            // Al principio: línea vacía encima, el bloque (y su id) siguen con su texto.
            val nuevo = Bloque.nuevo(if (b.tipo in LISTAS) b.tipo else "paragraph")
            val (lista, i) = sitio(b) ?: return
            lista.add(i, nuevo)
            foco = PeticionFoco(b.id, 0)
            estructura(nuevo)
            return
        }
        val cola = SpannableStringBuilder(t, pos.coerceIn(0, t.length), t.length)
        t.delete(pos.coerceIn(0, t.length), t.length)
        val nuevo = Bloque(Bloque.nuevoId(), tipoNuevo, JsonObject(Bloque.propsPorDefecto(tipoNuevo)), cola, null, JsonObject(emptyMap()))
        // Un desplegable abierto: lo nuevo va dentro, como primer hijo.
        if (esPlegable(b) && b.id in abiertos && b.tipo != "heading") {
            b.hijos.add(0, nuevo)
            foco = PeticionFoco(nuevo.id, 0)
            estructura(b, nuevo)
            return
        }
        val (lista, i) = sitio(b) ?: return
        lista.add(i + 1, nuevo)
        foco = PeticionFoco(nuevo.id, 0)
        estructura(b, nuevo)
    }

    /** Retroceso al principio: convierte en párrafo, saca de la sangría o une con el anterior. */
    fun retrocesoAlInicio(b: Bloque) {
        val t = b.texto ?: return
        if (b.tipo != "paragraph" && b.tipo != "codeBlock") {
            convierte(b, "paragraph")
            foco = PeticionFoco(b.id, 0)
            return
        }
        val padre = Bloques.padreDe(raiz, b.id)
        if (padre != null && padre.tipo != "column" && padre.tipo != "columnList") {
            desangra(b)
            foco = PeticionFoco(b.id, 0)
            return
        }
        val prev = anteriorVisible(b) ?: return
        val pt = prev.texto
        if (pt == null) {
            // Detrás de una imagen o un separador: un bloque vacío simplemente se va.
            if (t.isEmpty()) borra(b)
            return
        }
        val unir = pt.length
        pt.append(t)
        val (lista, i) = sitio(b) ?: return
        lista.removeAt(i)
        prev.hijos.addAll(b.hijos)
        foco = PeticionFoco(prev.id, unir)
        estructura(prev)
    }

    fun convierte(b: Bloque, tipo: String, props: Map<String, JsonElement> = emptyMap()) {
        if (b.tipo == tipo && props.isEmpty()) return
        // Se conservan los colores; lo propio del tipo viejo (nivel, casilla…) se va.
        val comunes = setOf("backgroundColor", "textColor", "textAlignment")
        val nuevas = Bloque.propsPorDefecto(tipo).toMutableMap()
        for ((k, v) in b.props) if (k in comunes && k in nuevas) nuevas[k] = v
        nuevas.putAll(props)
        b.tipo = tipo
        b.props = JsonObject(nuevas)
        if (tipo in TIPOS_TEXTO && b.texto == null) {
            b.texto = SpannableStringBuilder()
            b.crudo = null
        }
        if (tipo == "codeBlock") b.texto?.let { Inline.limpia(it, 0, it.length, pal) }
        estructura(b)
    }

    fun sangra(b: Bloque) {
        val (lista, i) = sitio(b) ?: return
        if (i == 0) return
        val madre = lista[i - 1]
        if (madre.texto == null && madre.tipo != "column") return
        lista.removeAt(i)
        madre.hijos.add(b)
        abiertos += madre.id
        foco = PeticionFoco(b.id, seleccion.first)
        estructura(b)
    }

    fun desangra(b: Bloque) {
        val padre = Bloques.padreDe(raiz, b.id) ?: return
        if (padre.tipo == "column") return
        val (lista, i) = sitio(b) ?: return
        lista.removeAt(i)
        val (listaPadre, j) = sitio(padre) ?: return
        listaPadre.add(j + 1, b)
        foco = PeticionFoco(b.id, seleccion.first)
        estructura(b)
    }

    fun mueve(b: Bloque, delta: Int) {
        val (lista, i) = sitio(b) ?: return
        val j = i + delta
        if (j !in lista.indices) return
        lista.removeAt(i)
        lista.add(j, b)
        foco = PeticionFoco(b.id, seleccion.first)
        estructura(b)
    }

    /** Lleva `b` delante o detrás de `destino` (arrastrar con el asa). */
    fun recoloca(b: Bloque, destino: Bloque, despues: Boolean) {
        if (b.id == destino.id || Bloques.busca(b.hijos, destino.id) != null) return
        val (lista, i) = sitio(b) ?: return
        lista.removeAt(i)
        val (listaD, j) = sitio(destino) ?: run { lista.add(i, b); return }
        listaD.add(if (despues) j + 1 else j, b)
        estructura(b)
    }

    fun duplica(b: Bloque): Bloque {
        fun copia(x: Bloque): Bloque = Bloque.deJson(x.aJson(), pal).let { c ->
            Bloque(Bloque.nuevoId(), c.tipo, c.props, c.texto, c.crudo, c.resto, c.hijos.map(::copia).toMutableList())
        }
        val c = copia(b)
        val (lista, i) = sitio(b) ?: return c
        lista.add(i + 1, c)
        estructura(c)
        return c
    }

    fun borra(b: Bloque) {
        val prev = anteriorVisible(b)
        val (lista, i) = sitio(b) ?: return
        lista.removeAt(i)
        if (raiz.isEmpty()) raiz.add(Bloque.nuevo())
        prev?.texto?.let { foco = PeticionFoco(prev.id, it.length) }
        estructura()
    }

    fun props(b: Bloque, vararg cambios: Pair<String, JsonElement?>) {
        for ((k, v) in cambios) b.conProp(k, v)
        estructura(b)
    }

    fun contenido(b: Bloque, crudo: JsonElement) {
        b.crudo = crudo
        estructura(b)
    }

    // ---------- atajos Markdown al escribir ----------

    /**
     * Al escribir un espacio tras `# `, `- `, `1. `, `[] `, `> `… al principio del bloque,
     * se convierte y el atajo desaparece (como en Notion y en la web). También ``` y ---.
     * Devuelve true si convirtió.
     */
    fun atajoMarkdown(b: Bloque): Boolean {
        val t = b.texto ?: return false
        if (b.tipo == "codeBlock") return false
        val s = t.toString()
        val reglas: List<Pair<String, () -> Unit>> = listOf(
            "# " to { convierte(b, "heading", mapOf("level" to JsonPrimitive(1))) },
            "## " to { convierte(b, "heading", mapOf("level" to JsonPrimitive(2))) },
            "### " to { convierte(b, "heading", mapOf("level" to JsonPrimitive(3))) },
            "- " to { convierte(b, "bulletListItem") },
            "* " to { convierte(b, "bulletListItem") },
            "+ " to { convierte(b, "bulletListItem") },
            "[] " to { convierte(b, "checkListItem") },
            "[ ] " to { convierte(b, "checkListItem") },
            "[x] " to { convierte(b, "checkListItem", mapOf("checked" to JsonPrimitive(true))) },
            // Como en la web (BlockNote): «> » es cita.
            "> " to { convierte(b, "quote") },
        )
        for ((pre, accion) in reglas) {
            if (s.startsWith(pre) && b.tipo == "paragraph") {
                t.delete(0, pre.length)
                accion()
                foco = PeticionFoco(b.id, 0)
                return true
            }
        }
        Regex("^(\\d+)[.)] ").find(s)?.let { m ->
            if (b.tipo == "paragraph") {
                t.delete(0, m.value.length)
                val n = m.groupValues[1].toInt()
                convierte(b, "numberedListItem", if (n != 1) mapOf("start" to JsonPrimitive(n)) else emptyMap())
                foco = PeticionFoco(b.id, 0)
                return true
            }
        }
        if (b.tipo == "paragraph" && s == "```") {
            t.clear()
            convierte(b, "codeBlock")
            foco = PeticionFoco(b.id, 0)
            return true
        }
        if (b.tipo == "paragraph" && s == "---") {
            t.clear()
            b.tipo = "divider"
            b.texto = null
            b.props = JsonObject(emptyMap())
            val nuevo = Bloque.nuevo()
            insertaDespues(b, nuevo)
            return true
        }
        return false
    }

    /** Pega texto con saltos de línea: cada línea, un bloque (lo que hace Notion). */
    fun parteLineas(b: Bloque) {
        val t = b.texto ?: return
        if (b.tipo == "codeBlock") return
        val i = t.indexOf('\n')
        if (i < 0) return
        val cola = SpannableStringBuilder(t, i + 1, t.length)
        t.delete(i, t.length)
        val tipo = if (b.tipo in LISTAS) b.tipo else "paragraph"
        val nuevo = Bloque(Bloque.nuevoId(), tipo, JsonObject(Bloque.propsPorDefecto(tipo)), cola, null, JsonObject(emptyMap()))
        val (lista, j) = sitio(b) ?: return
        lista.add(j + 1, nuevo)
        foco = PeticionFoco(nuevo.id, 0)
        estructura(b, nuevo)
        parteLineas(nuevo)
    }

    /** Títulos del documento (para el bloque Índice). */
    fun titulos(): List<Pair<Bloque, Int>> {
        val out = ArrayList<Pair<Bloque, Int>>()
        Bloques.enOrden(raiz, { b, _ ->
            if (b.tipo == "heading" && !b.texto.isNullOrBlank()) out.add(b to ((b.props["level"] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt() ?: 1))
        })
        return out
    }
}
