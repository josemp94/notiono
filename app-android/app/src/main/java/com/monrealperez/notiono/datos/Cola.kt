package com.monrealperez.notiono.datos

import com.monrealperez.notiono.red.json
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import java.io.File
import java.util.UUID

/** Un cambio que no pudo enviarse (sin red) y espera su turno. */
@Serializable
data class Pendiente(
    val id: String = UUID.randomUUID().toString(),
    val ruta: String,
    val input: JsonElement? = null,
    /** Página a la que afecta (para enseñar «pendiente de enviar» y no pisarlo al leer). */
    val pagina: String? = null,
    val creada: Long = System.currentTimeMillis(),
)

/**
 * Cola de cambios hechos sin conexión, en orden, en un fichero (sobrevive a que Android
 * cierre la app). Se vacía al volver la red (ver [ColaWorker]). Mientras haya algo en
 * la cola, los cambios nuevos se ponen detrás aunque haya red: si no, llegarían antes
 * que los viejos y el resultado no sería el que vio quien los hizo.
 */
class Cola(dir: File) {
    private val f = File(dir, "cola.jsonl")
    private val mutex = Mutex()

    suspend fun añade(p: Pendiente) = mutex.withLock {
        f.appendText(json.encodeToString(Pendiente.serializer(), p) + "\n")
    }

    suspend fun pendientes(): List<Pendiente> = mutex.withLock { leer() }

    private fun leer(): List<Pendiente> =
        if (!f.exists()) emptyList()
        else f.readLines().filter { it.isNotBlank() }.mapNotNull {
            runCatching { json.decodeFromString(Pendiente.serializer(), it) }.getOrNull()
        }

    suspend fun quita(id: String) = mutex.withLock {
        val resto = leer().filter { it.id != id }
        f.writeText(resto.joinToString("") { json.encodeToString(Pendiente.serializer(), it) + "\n" })
    }

    suspend fun vacia() = mutex.withLock { f.delete() }

    suspend fun estaVacia() = pendientes().isEmpty()

    suspend fun tienePagina(pageId: String) = pendientes().any { it.pagina == pageId }
}
