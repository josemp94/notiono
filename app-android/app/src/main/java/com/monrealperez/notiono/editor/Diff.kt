package com.monrealperez.notiono.editor

import com.monrealperez.notiono.red.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Las operaciones por bloque que llevan el documento del servidor (`base`, lo último
 * que se sabe de él) a como está en el móvil (`local`). Es lo que se manda a
 * `app.aplicar`: nunca el documento entero, para no pisar lo que otro escribe a la vez
 * en otros bloques.
 *
 * - Bloque nuevo → `upsert` con su sitio (madre y el de delante).
 * - Bloque con otro contenido/tipo/props → `upsert` sin sitio.
 * - Bloque en otro sitio → `move`.
 * - Bloque que ya no está → `delete` (solo el de más arriba: sus hijos se van con él;
 *   los que se sacaron de él antes se mueven primero, porque las operaciones van en
 *   orden: primero el recorrido del documento local, al final los borrados).
 */
object Diff {
    private data class Pos(val solo: JsonObject, val padre: String?, val antes: String?)

    private fun indexa(bloques: List<JsonObject>, padre: String?, out: LinkedHashMap<String, Pos>) {
        var antes: String? = null
        for (b in bloques) {
            val id = b.str("id") ?: continue
            out[id] = Pos(JsonObject(b - "children"), padre, antes)
            indexa((b["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList(), id, out)
            antes = id
        }
    }

    fun ops(base: List<JsonObject>, local: List<JsonObject>): List<JsonObject> {
        val b = LinkedHashMap<String, Pos>().also { indexa(base, null, it) }
        val l = LinkedHashMap<String, Pos>().also { indexa(local, null, it) }
        val ops = ArrayList<JsonObject>()
        for ((id, p) in l) {
            val antes = b[id]
            if (antes == null) {
                ops.add(op("upsert", "block" to p.solo, "parentId" to p.padre?.let(::JsonPrimitive), "afterId" to p.antes?.let(::JsonPrimitive)))
                continue
            }
            if (antes.solo != p.solo) ops.add(op("upsert", "block" to p.solo))
            if (antes.padre != p.padre || antes.antes != p.antes) {
                ops.add(op("move", "id" to JsonPrimitive(id), "parentId" to p.padre?.let(::JsonPrimitive), "afterId" to p.antes?.let(::JsonPrimitive)))
            }
        }
        for ((id, p) in b) {
            if (id in l) continue
            // Si su madre también desaparece, se va con ella.
            if (p.padre != null && p.padre !in l && p.padre in b) continue
            ops.add(op("delete", "id" to JsonPrimitive(id)))
        }
        return ops
    }

    private fun op(nombre: String, vararg pares: Pair<String, JsonElement?>): JsonObject {
        val m = LinkedHashMap<String, JsonElement>()
        m["op"] = JsonPrimitive(nombre)
        for ((k, v) in pares) if (v != null) m[k] = v
        return JsonObject(m)
    }

    /**
     * Aplica operaciones a un árbol JSON (lo mismo que hace el servidor con
     * `aplicarOpsJson`): sirve para enseñar al momento lo que se ha mandado y para
     * comprobar en las pruebas que las operaciones llevan de verdad de `base` a `local`.
     */
    fun aplica(bloques: List<JsonObject>, ops: List<JsonObject>): List<JsonObject> {
        data class N(var solo: JsonObject, val hijos: MutableList<N>)
        fun deJson(o: JsonObject): N = N(JsonObject(o - "children"), ((o["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()).map(::deJson).toMutableList())
        fun aJson(n: N): JsonObject = JsonObject(n.solo + ("children" to JsonArray(n.hijos.map(::aJson))))
        val raiz = bloques.map(::deJson).toMutableList()
        fun busca(lista: MutableList<N>, id: String): Pair<MutableList<N>, Int>? {
            for ((i, n) in lista.withIndex()) {
                if (n.solo.str("id") == id) return lista to i
                busca(n.hijos, id)?.let { return it }
            }
            return null
        }
        fun coloca(n: N, padre: String?, antes: String?) {
            val lista = padre?.let { p -> busca(raiz, p)?.let { (l, i) -> l[i].hijos } } ?: raiz
            val i = if (antes == null) 0 else lista.indexOfFirst { it.solo.str("id") == antes }.let { if (it < 0) lista.size else it + 1 }
            lista.add(i, n)
        }
        for (op in ops) {
            when (op.str("op")) {
                "delete" -> busca(raiz, op.str("id")!!)?.let { (l, i) -> l.removeAt(i) }
                "move" -> {
                    val (l, i) = busca(raiz, op.str("id")!!) ?: continue
                    val n = l.removeAt(i)
                    coloca(n, op.str("parentId"), op.str("afterId"))
                }
                "upsert" -> {
                    val bloque = op["block"] as JsonObject
                    val hit = busca(raiz, bloque.str("id")!!)
                    if (hit != null) hit.first[hit.second].solo = JsonObject(bloque - "children")
                    else coloca(deJson(bloque), op.str("parentId"), op.str("afterId"))
                }
            }
        }
        return raiz.map(::aJson)
    }
}
