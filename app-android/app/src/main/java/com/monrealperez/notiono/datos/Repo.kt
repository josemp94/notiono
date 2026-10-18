package com.monrealperez.notiono.datos

import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.ErrorApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement

/**
 * Acceso a los datos: red primero, caché si no hay red, y los cambios sin red a la
 * cola. Avisa por [cambios] de qué ha cambiado (etiquetas como «arbol» o
 * «pagina:<id>») para que las pantallas que lo enseñan se refresquen solas.
 */
class Repo(val api: Api, val cache: Cache, val cola: Cola, private val alEncolar: () -> Unit) {
    private val _sinConexion = MutableStateFlow(false)
    val sinConexion: StateFlow<Boolean> = _sinConexion

    private val _noAutorizado = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val noAutorizado: SharedFlow<Unit> = _noAutorizado

    private val _cambios = MutableSharedFlow<String>(extraBufferCapacity = 64)
    val cambios: SharedFlow<String> = _cambios

    private val envio = Mutex()

    fun avisa(vararg etiquetas: String) {
        etiquetas.forEach { _cambios.tryEmit(it) }
    }

    private fun anota(e: Throwable) {
        if (e is ErrorApi) {
            if (e.sinConexion) _sinConexion.value = true
            if (e.tipo == ErrorApi.Tipo.NoAutorizado) _noAutorizado.tryEmit(Unit)
        }
    }

    /** Lo último que se guardó de esta consulta (para pintar al instante). */
    fun cacheada(ruta: String, input: JsonElement? = null): JsonElement? = cache.lee(cache.clave(ruta, input))

    /**
     * Consulta al servidor y guarda la respuesta. Sin red, devuelve lo guardado; si no
     * hay nada guardado, lanza el error de conexión.
     */
    suspend fun consulta(ruta: String, input: JsonElement? = null, cachear: Boolean = true): JsonElement {
        val clave = cache.clave(ruta, input)
        return try {
            val r = api.query(ruta, input)
            _sinConexion.value = false
            if (cachear) cache.guarda(clave, r)
            r
        } catch (e: ErrorApi) {
            anota(e)
            if (e.sinConexion) cache.lee(clave) ?: throw e else throw e
        }
    }

    /**
     * Cambia algo en el servidor. Sin red (o con cambios anteriores aún en cola) y
     * si `encolable`, se apunta en la cola y devuelve null: la interfaz ya lo enseña
     * hecho y se enviará al volver la red. `etiquetas`: qué refrescar al terminar.
     */
    suspend fun mutacion(
        ruta: String,
        input: JsonElement? = null,
        encolable: Boolean = true,
        pagina: String? = null,
        vararg etiquetas: String,
    ): JsonElement? {
        if (encolable && !cola.estaVacia()) {
            cola.añade(Pendiente(ruta = ruta, input = input, pagina = pagina))
            alEncolar()
            return null
        }
        return try {
            val r = envio.withLock { api.mutation(ruta, input) }
            _sinConexion.value = false
            avisa(*etiquetas)
            r
        } catch (e: ErrorApi) {
            anota(e)
            if (e.sinConexion && encolable) {
                cola.añade(Pendiente(ruta = ruta, input = input, pagina = pagina))
                alEncolar()
                avisa(*etiquetas)
                null
            } else throw e
        }
    }

    /**
     * Envía la cola en orden. Para en el primer fallo de red (se reintentará); lo que
     * el servidor rechaza (ya no existe, sin permiso) se descarta: reintentarlo daría
     * lo mismo. Devuelve true si la cola quedó vacía.
     */
    suspend fun vaciaCola(): Boolean {
        for (p in cola.pendientes()) {
            try {
                envio.withLock { api.mutation(p.ruta, p.input) }
                cola.quita(p.id)
                _sinConexion.value = false
                p.pagina?.let { avisa("pagina:$it") }
            } catch (e: ErrorApi) {
                anota(e)
                if (e.sinConexion || e.tipo == ErrorApi.Tipo.NoAutorizado || e.tipo == ErrorApi.Tipo.Servidor) return false
                cola.quita(p.id)
            }
        }
        avisa("arbol", "cola")
        return true
    }
}
