package com.monrealperez.notiono.datos

import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonElement
import java.io.File
import java.security.MessageDigest

/**
 * Caché para leer sin conexión: la última respuesta de cada consulta, como JSON en un
 * fichero por clave (ruta + entrada). Vive en `filesDir`, no en `cacheDir`: Android
 * vacía la segunda cuando le falta sitio, y justo entonces es cuando no hay red.
 */
class Cache(dir: File) {
    private val raiz = File(dir, "red").apply { mkdirs() }

    private fun fichero(clave: String): File {
        val h = MessageDigest.getInstance("SHA-1").digest(clave.toByteArray()).joinToString("") { "%02x".format(it) }
        return File(raiz, "$h.json")
    }

    fun clave(ruta: String, input: JsonElement?) = "$ruta|${input ?: ""}"

    fun lee(clave: String): JsonElement? = runCatching {
        val f = fichero(clave)
        if (f.exists()) json.parseToJsonElement(f.readText()) else null
    }.getOrNull()

    /** Cuándo se guardó (ms), o null si no hay nada guardado. */
    fun fecha(clave: String): Long? = fichero(clave).takeIf { it.exists() }?.lastModified()

    fun guarda(clave: String, valor: JsonElement) {
        runCatching {
            val f = fichero(clave)
            val tmp = File(f.path + ".tmp")
            tmp.writeText(valor.toString())
            tmp.renameTo(f)
        }
    }

    fun borra(clave: String) {
        fichero(clave).delete()
    }

    fun vacia() {
        raiz.listFiles()?.forEach { it.delete() }
    }
}
