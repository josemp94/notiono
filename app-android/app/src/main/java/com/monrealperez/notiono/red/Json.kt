package com.monrealperez.notiono.red

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

// Lectura cómoda de JSON sin tener que declarar una clase por cada respuesta: buena
// parte de lo que manda el servidor (configs de vistas y columnas, celdas…) es
// libre por diseño, y la app tiene que conservarlo tal cual aunque no lo entienda.

fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
fun JsonObject.strOr(k: String, d: String = ""): String = str(k) ?: d
fun JsonObject.bool(k: String): Boolean = (this[k] as? JsonPrimitive)?.booleanOrNull ?: false
fun JsonObject.boolOrNull(k: String): Boolean? = (this[k] as? JsonPrimitive)?.booleanOrNull
fun JsonObject.int(k: String): Int? = (this[k] as? JsonPrimitive)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() }
fun JsonObject.long(k: String): Long? = (this[k] as? JsonPrimitive)?.longOrNull
fun JsonObject.num(k: String): Double? = (this[k] as? JsonPrimitive)?.let { if (it.isString) it.content.toDoubleOrNull() else it.doubleOrNull }
fun JsonObject.obj(k: String): JsonObject? = this[k] as? JsonObject
fun JsonObject.arr(k: String): JsonArray? = this[k] as? JsonArray
fun JsonObject.objs(k: String): List<JsonObject> = arr(k)?.mapNotNull { it as? JsonObject } ?: emptyList()
fun JsonObject.strs(k: String): List<String> = arr(k)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content } ?: emptyList()

val JsonElement?.textoONulo: String? get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
val JsonElement?.esNulo: Boolean get() = this == null || this is JsonNull
val JsonElement.comoObjeto: JsonObject get() = this as? JsonObject ?: JsonObject(emptyMap())
val JsonElement.comoLista: JsonArray get() = this as? JsonArray ?: JsonArray(emptyList())

/** Copia del objeto con una clave cambiada (o quitada si el valor es null). */
fun JsonObject.con(k: String, v: JsonElement?): JsonObject =
    JsonObject(if (v == null) this - k else this + (k to v))

fun JsonObject.con(vararg pares: Pair<String, JsonElement?>): JsonObject {
    val m = toMutableMap()
    for ((k, v) in pares) if (v == null) m.remove(k) else m[k] = v
    return JsonObject(m)
}

fun jsonDe(v: Any?): JsonElement = when (v) {
    null -> JsonNull
    is JsonElement -> v
    is String -> JsonPrimitive(v)
    is Number -> JsonPrimitive(v)
    is Boolean -> JsonPrimitive(v)
    is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k.toString() to jsonDe(x) })
    is Iterable<*> -> JsonArray(v.map { jsonDe(it) })
    else -> JsonPrimitive(v.toString())
}

/** `jsonDe(mapOf(...))` en corto: `obj("id" to x, "title" to y)`. */
fun objeto(vararg pares: Pair<String, Any?>): JsonObject = JsonObject(pares.associate { (k, v) -> k to jsonDe(v) })
