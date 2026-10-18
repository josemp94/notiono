package com.monrealperez.notiono.editor

import android.text.SpannableStringBuilder
import com.monrealperez.notiono.red.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.UUID

/** Tipos de bloque cuyo contenido es texto en línea (lo que se edita con el teclado). */
val TIPOS_TEXTO = setOf(
    "paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote", "callout", "codeBlock",
)

/** Tipos que la app sabe pintar (lo demás sale como marcador y se conserva intacto). */
val TIPOS_CONOCIDOS = TIPOS_TEXTO + setOf(
    "divider", "image", "video", "audio", "file", "table", "bookmark", "equation", "toc", "columnList", "column", "database",
)

/**
 * Un bloque del documento, editable. Guarda TODO lo que trae el JSON: props enteras
 * (aunque la app no las use), el contenido sin tocar de lo que no es texto (tablas,
 * tipos desconocidos) y cualquier otra clave. Lo que no se edita vuelve tal cual.
 */
class Bloque(
    val id: String,
    var tipo: String,
    var props: JsonObject,
    /** Texto con estilos, para los tipos de [TIPOS_TEXTO]. */
    var texto: SpannableStringBuilder?,
    /** El `content` tal cual para lo que no es texto (tabla, desconocido). */
    var crudo: JsonElement?,
    /** Otras claves del JSON que no son id/type/props/content/children. */
    val resto: JsonObject,
    val hijos: MutableList<Bloque> = mutableListOf(),
) {
    val esTexto get() = texto != null
    val conocido get() = tipo in TIPOS_CONOCIDOS

    fun prop(k: String): String? = props.str(k)
    fun propBool(k: String): Boolean = (props[k] as? JsonPrimitive)?.content == "true"
    fun conProp(k: String, v: JsonElement?) {
        props = if (v == null) JsonObject(props - k) else JsonObject(props + (k to v))
    }

    /** El JSON del bloque sin sus hijos (lo que se compara y se manda en las operaciones). */
    fun aJsonSolo(): JsonObject {
        val m = LinkedHashMap<String, JsonElement>()
        m.putAll(resto)
        m["id"] = JsonPrimitive(id)
        m["type"] = JsonPrimitive(tipo)
        m["props"] = props
        val t = texto
        if (t != null) m["content"] = Inline.aJson(t) else crudo?.let { m["content"] = it }
        return JsonObject(m)
    }

    fun aJson(): JsonObject = JsonObject(aJsonSolo() + ("children" to JsonArray(hijos.map { it.aJson() })))

    companion object {
        fun nuevoId(): String = UUID.randomUUID().toString()

        fun deJson(o: JsonObject, pal: Paleta): Bloque {
            val tipo = o.str("type") ?: "paragraph"
            val props = o["props"] as? JsonObject ?: JsonObject(emptyMap())
            val contenido = o["content"]
            val esTexto = tipo in TIPOS_TEXTO && (contenido == null || contenido is JsonArray || (contenido is JsonPrimitive && contenido.isString))
            val resto = JsonObject(o.filterKeys { it !in setOf("id", "type", "props", "content", "children") })
            val b = Bloque(
                id = o.str("id") ?: nuevoId(),
                tipo = tipo,
                props = props,
                texto = if (esTexto) Inline.aSpannable(contenido, pal) else null,
                crudo = if (esTexto) null else contenido,
                resto = resto,
            )
            (o["children"] as? JsonArray)?.forEach { h -> (h as? JsonObject)?.let { b.hijos.add(deJson(it, pal)) } }
            return b
        }

        /** Un bloque nuevo de texto vacío del tipo dado (con las props por defecto de BlockNote). */
        fun nuevo(tipo: String = "paragraph", props: Map<String, JsonElement> = emptyMap(), texto: CharSequence = ""): Bloque =
            Bloque(nuevoId(), tipo, JsonObject(propsPorDefecto(tipo) + props), if (tipo in TIPOS_TEXTO) SpannableStringBuilder(texto) else null, null, JsonObject(emptyMap()))

        fun propsPorDefecto(tipo: String): Map<String, JsonElement> {
            val base = mapOf(
                "backgroundColor" to JsonPrimitive("default"),
                "textColor" to JsonPrimitive("default"),
                "textAlignment" to JsonPrimitive("left"),
            )
            return when (tipo) {
                "paragraph", "bulletListItem", "toggleListItem" -> base
                "numberedListItem" -> base
                "checkListItem" -> base + ("checked" to JsonPrimitive(false))
                "heading" -> base + mapOf("level" to JsonPrimitive(1), "isToggleable" to JsonPrimitive(false))
                "quote" -> mapOf("backgroundColor" to JsonPrimitive("default"), "textColor" to JsonPrimitive("default"))
                "callout" -> mapOf("emoji" to JsonPrimitive("💡"), "color" to JsonPrimitive("naranja"))
                "codeBlock" -> mapOf("language" to JsonPrimitive("javascript"))
                "image", "video" -> mapOf(
                    "textAlignment" to JsonPrimitive("left"), "backgroundColor" to JsonPrimitive("default"), "name" to JsonPrimitive(""),
                    "url" to JsonPrimitive(""), "caption" to JsonPrimitive(""), "showPreview" to JsonPrimitive(true),
                )
                "audio" -> mapOf("backgroundColor" to JsonPrimitive("default"), "name" to JsonPrimitive(""), "url" to JsonPrimitive(""), "caption" to JsonPrimitive(""), "showPreview" to JsonPrimitive(true))
                "file" -> mapOf("backgroundColor" to JsonPrimitive("default"), "name" to JsonPrimitive(""), "url" to JsonPrimitive(""), "caption" to JsonPrimitive(""))
                "table" -> mapOf("textColor" to JsonPrimitive("default"))
                "bookmark" -> mapOf("url" to JsonPrimitive(""), "title" to JsonPrimitive(""), "description" to JsonPrimitive(""), "image" to JsonPrimitive(""), "siteName" to JsonPrimitive(""))
                "equation" -> mapOf("tex" to JsonPrimitive(""))
                "column" -> mapOf("ancho" to JsonPrimitive(1))
                "database" -> mapOf("collectionId" to JsonPrimitive(""), "pageId" to JsonPrimitive(""), "viewId" to JsonPrimitive(""))
                else -> emptyMap()
            }
        }
    }
}

/** Funciones sobre el árbol de bloques (JSON o modelo). */
object Bloques {
    /** Texto plano de un documento (vista previa de versiones, widget). */
    fun textoPlano(bloques: List<JsonObject>, sangria: String = ""): String = buildString {
        for (b in bloques) {
            val t = Inline.textoPlano(b["content"])
            val pre = when (b.str("type")) {
                "bulletListItem" -> "• "
                "numberedListItem" -> "1. "
                "checkListItem" -> if ((b["props"] as? JsonObject)?.get("checked")?.toString() == "true") "☑ " else "☐ "
                "heading" -> ""
                else -> ""
            }
            if (t.isNotEmpty() || pre.isNotEmpty()) appendLine(sangria + pre + t)
            val hijos = (b["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
            if (hijos.isNotEmpty()) append(textoPlano(hijos, "$sangria  "))
        }
    }

    /** Operaciones que dejan el documento como `nuevo` (restaurar una versión). */
    fun reemplazaTodo(actual: List<JsonObject>, nuevo: List<JsonObject>): JsonArray {
        val ops = ArrayList<JsonElement>()
        for (b in actual) ops.add(JsonObject(mapOf("op" to JsonPrimitive("delete"), "id" to JsonPrimitive(b.str("id").orEmpty()))))
        var antes: String? = null
        for (b in nuevo) {
            val m = LinkedHashMap<String, JsonElement>()
            m["op"] = JsonPrimitive("upsert")
            m["block"] = b
            if (antes != null) m["afterId"] = JsonPrimitive(antes)
            ops.add(JsonObject(m))
            antes = b.str("id")
        }
        return JsonArray(ops)
    }

    /** Recorre el árbol en orden (padre antes que hijos). */
    fun enOrden(bloques: List<Bloque>, f: (Bloque, Bloque?) -> Unit, padre: Bloque? = null) {
        for (b in bloques) {
            f(b, padre)
            enOrden(b.hijos, f, b)
        }
    }

    fun busca(bloques: List<Bloque>, id: String): Bloque? {
        for (b in bloques) {
            if (b.id == id) return b
            busca(b.hijos, id)?.let { return it }
        }
        return null
    }

    /** Lista de hermanos que contiene el bloque y su posición; null si no está. */
    fun sitio(bloques: MutableList<Bloque>, id: String): Pair<MutableList<Bloque>, Int>? {
        val i = bloques.indexOfFirst { it.id == id }
        if (i >= 0) return bloques to i
        for (b in bloques) sitio(b.hijos, id)?.let { return it }
        return null
    }

    fun padreDe(bloques: List<Bloque>, id: String): Bloque? {
        for (b in bloques) {
            if (b.hijos.any { it.id == id }) return b
            padreDe(b.hijos, id)?.let { return it }
        }
        return null
    }
}
