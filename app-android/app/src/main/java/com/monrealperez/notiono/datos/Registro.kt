package com.monrealperez.notiono.datos

import android.content.SharedPreferences
import android.os.Build
import androidx.core.content.edit
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.json
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.util.UUID

@Serializable
data class Evento(val n: Long, val fecha: String, val tipo: String, val mensaje: String, val traza: String? = null)

/**
 * Registro de diagnóstico: refrescos de los widgets, cierres inesperados y fallos del
 * servidor, para ver desde fuera lo que pasa en los móviles (se manda en lote a
 * `/api/app/registro`). Nada del contenido: ni títulos ni textos de páginas; solo tipo,
 * clase de error, primera línea del mensaje técnico y las líneas de la traza.
 *
 * Un fichero de líneas JSON con las últimas [MAXIMO] entradas; `enviado` en las
 * preferencias dice hasta cuál llegó ya al servidor.
 */
class Registro(dir: File, private val prefs: SharedPreferences) {
    private val fichero = File(dir, "registro.jsonl")
    private val envio = Mutex()

    @Synchronized
    fun anota(tipo: String, mensaje: String, error: Throwable? = null) {
        runCatching {
            val n = prefs.getLong("n", 0) + 1
            // commit, no apply: el capturador de cierres escribe justo antes de que muera el proceso.
            prefs.edit(commit = true) { putLong("n", n) }
            val e = Evento(n, Instant.now().toString(), tipo, (mensaje + (error?.let { " · " + tecnico(it) } ?: "")).take(500), error?.let { traza(it) })
            fichero.appendText(json.encodeToString(Evento.serializer(), e) + "\n")
            val lineas = fichero.readLines()
            if (lineas.size > MAXIMO + 50) fichero.writeText(lineas.takeLast(MAXIMO).joinToString("\n", postfix = "\n"))
        }
    }

    @Synchronized
    fun eventos(): List<Evento> = runCatching {
        if (!fichero.exists()) emptyList()
        else fichero.readLines().mapNotNull { l -> runCatching { json.decodeFromString(Evento.serializer(), l) }.getOrNull() }
    }.getOrDefault(emptyList())

    fun pendientes(): List<Evento> = prefs.getLong("enviado", 0).let { hasta -> eventos().filter { it.n > hasta } }

    /** Apunta los cierres inesperados y deja que el cierre siga como siempre. */
    fun capturaCierres() {
        val previo = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { hilo, e ->
            anota("cierre", "Cierre inesperado (hilo ${hilo.name})", e)
            previo?.uncaughtException(hilo, e)
        }
    }

    /** Manda lo pendiente (si hay sesión). Si falla, se queda para la próxima. */
    suspend fun envia(api: Api, conSesion: Boolean): Boolean = envio.withLock {
        if (!conSesion) return false
        val lote = pendientes().take(MAXIMO)
        if (lote.isEmpty()) return true
        try {
            api.postJson("/api/app/registro", buildJsonObject {
                put("dispositivo", dispositivo())
                put("version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                put("modelo", Build.MODEL ?: "")
                put("fabricante", Build.MANUFACTURER ?: "")
                put("android", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
                put("entradas", json.encodeToJsonElement(ListSerializer(Evento.serializer()), lote))
            })
            prefs.edit { putLong("enviado", lote.last().n) }
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
    }

    /** Un identificador al azar de esta instalación (para distinguir dos móviles del mismo usuario). */
    private fun dispositivo(): String =
        prefs.getString("dispositivo", null) ?: UUID.randomUUID().toString().also { prefs.edit { putString("dispositivo", it) } }

    companion object {
        const val MAXIMO = 200

        /** Clase y primera línea del mensaje (las siguientes de un error de JSON traen el contenido). */
        fun tecnico(e: Throwable): String = e.javaClass.name + (e.message?.lineSequence()?.firstOrNull()?.take(200)?.let { ": $it" } ?: "")

        /** La traza sin mensajes: clases y líneas, también de las causas. */
        fun traza(e: Throwable): String = generateSequence(e) { it.cause.takeIf { c -> c !== it } }.take(4)
            .joinToString("\nCausado por: ") { t -> t.javaClass.name + "\n" + t.stackTrace.take(25).joinToString("\n") { "  at $it" } }
            .take(8000)
    }
}
