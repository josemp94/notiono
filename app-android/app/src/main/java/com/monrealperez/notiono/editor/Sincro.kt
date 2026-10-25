package com.monrealperez.notiono.editor

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.monrealperez.notiono.datos.Repo
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** De dónde salen los bloques: una página (documento Yjs) o el cuerpo de una fila. */
data class Fuente(val id: String, val esFila: Boolean) {
    val rutaLeer get() = if (esFila) "app.bloquesFila" else "app.bloques"
    val rutaAplicar get() = if (esFila) "app.aplicarFila" else "app.aplicar"
    private val clave get() = if (esFila) "recordId" else "id"
    fun leer(huella: String?): JsonObject =
        JsonObject(mapOf(clave to JsonPrimitive(id)) + (huella?.let { mapOf("huella" to JsonPrimitive(it)) } ?: emptyMap()))
    fun aplicar(ops: List<JsonObject>): JsonObject = JsonObject(mapOf(clave to JsonPrimitive(id), "ops" to JsonArray(ops)))
}

enum class EstadoGuardado { Guardado, Guardando, Pendiente, Error }

/**
 * La sincronía del editor con el servidor:
 *
 * - Al cambiar algo, a los ~1 s se calculan las operaciones contra la última versión
 *   conocida del servidor ([base]) y se mandan (`app.aplicar`). Sin red se quedan en la
 *   cola de la app y salen al volver.
 * - Mientras la página está abierta se pregunta cada pocos segundos si cambió (con la
 *   huella: si no, el servidor no reenvía nada). Lo de fuera se adopta solo cuando no
 *   hay nada local sin mandar; el bloque que se está editando manda hasta guardarse.
 * - El documento local y la base se guardan en el móvil mientras haya algo pendiente:
 *   si Android cierra la app sin red, al volver se sigue donde se dejó.
 */
class Sincro(private val fuente: Fuente, private val estado: EstadoEditor, private val repo: Repo, private val alcance: CoroutineScope) {
    var base: List<JsonObject> = emptyList()
        private set
    private var huella: String? = null
    var guardado by mutableStateOf(EstadoGuardado.Guardado)
        private set
    var cargado by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    private val mutex = Mutex()
    private var temporizador: Job? = null
    private val claveLocal = "doc:${fuente.rutaLeer}:${fuente.id}"
    private val claveBase = "base:${fuente.rutaLeer}:${fuente.id}"

    init {
        estado.alCambiar = { programa() }
    }

    /** Primera carga: lo local pendiente si lo hay, si no lo guardado y luego lo fresco. */
    suspend fun abre() {
        val local = repo.cache.lee(claveLocal)?.let { (it as? JsonArray)?.mapNotNull { e -> e as? JsonObject } }
        val baseGuardada = repo.cache.lee(claveBase)?.let { (it as? JsonArray)?.mapNotNull { e -> e as? JsonObject } }
        if (local != null && baseGuardada != null) {
            base = baseGuardada
            estado.carga(local)
            cargado = true
            guardado = EstadoGuardado.Pendiente
            programa(0)
            return
        }
        repo.cacheada(fuente.rutaLeer, fuente.leer(null))?.comoObjeto?.let { c ->
            (c["bloques"] as? JsonArray)?.let { b ->
                base = b.mapNotNull { it as? JsonObject }
                huella = c.str("huella")
                estado.carga(base)
                cargado = true
            }
        }
        refresca(primera = true)
    }

    fun programa(retraso: Long = 1000) {
        guardado = EstadoGuardado.Guardando
        temporizador?.cancel()
        temporizador = alcance.launch {
            delay(retraso)
            envia()
        }
    }

    /**
     * Al cerrarse el editor (salir de la página, girar el móvil, cambiar el tema o el tamaño
     * de letra): lo que falte por mandar se guarda ya en el móvil y se manda en el alcance
     * de la app. El editor que se abre justo después (el de la pantalla girada) lo encuentra
     * al abrir y sigue desde ahí; antes empezaba con lo del servidor y, si se seguía
     * escribiendo en el mismo bloque, su envío deshacía lo último del anterior.
     */
    fun alCerrar(alcanceApp: CoroutineScope) {
        if (cargado) {
            val local = estado.json()
            if (Diff.ops(base, local).isNotEmpty()) guardaLocal(local)
        }
        alcanceApp.launch { envia() }
    }

    /** Manda lo que haya. */
    suspend fun envia() {
        if (enviaBloqueado()) refresca(primera = true)
    }

    /** Devuelve true si el servidor rechazó las operaciones y hay que recargar. */
    private suspend fun enviaBloqueado(): Boolean = mutex.withLock {
        val local = estado.json()
        val ops = Diff.ops(base, local)
        if (ops.isEmpty()) {
            estado.sucios.clear()
            guardado = EstadoGuardado.Guardado
            limpiaLocal()
            return@withLock false
        }
        val enviados = estado.sucios.toSet()
        estado.sucios.clear()
        guardaLocal(local)
        try {
            val r = repo.mutacion(fuente.rutaAplicar, fuente.aplicar(ops), pagina = fuente.id, etiquetas = listOf("bloques:${fuente.id}"))
            if (r == null) {
                // A la cola (sin red): para la próxima, lo mandado ya cuenta como hecho.
                base = local
                repo.cache.guarda(claveBase, JsonArray(base))
                guardado = EstadoGuardado.Pendiente
                return@withLock false
            }
            val o = r.comoObjeto
            val remoto = (o["bloques"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: local
            base = remoto
            huella = o.str("huella")
            repo.cache.guarda(repo.clave(fuente.rutaLeer, fuente.leer(null)), JsonObject(mapOf("huella" to JsonPrimitive(huella ?: ""), "bloques" to JsonArray(remoto))))
            error = null
            if (estado.sucios.isEmpty()) {
                // Nada nuevo mientras viajaba: se adopta lo del servidor (trae lo de otros).
                adopta(remoto)
                guardado = EstadoGuardado.Guardado
                limpiaLocal()
            } else programa()
            false
        } catch (e: ErrorApi) {
            estado.sucios.addAll(enviados)
            if (e.tipo == ErrorApi.Tipo.Peticion || e.tipo == ErrorApi.Tipo.NoEncontrado || e.tipo == ErrorApi.Tipo.Prohibido) {
                // El servidor no acepta estas operaciones (algo cambió debajo): se recarga.
                error = e.message
                guardado = EstadoGuardado.Error
                estado.sucios.clear()
                true
            } else {
                guardado = EstadoGuardado.Error
                error = e.message
                false
            }
        }
    }

    /** Pregunta al servidor si el documento cambió; si no hay nada local pendiente, lo adopta. */
    suspend fun refresca(primera: Boolean = false) {
        if (!primera && (temporizador?.isActive == true || estado.sucios.isNotEmpty() || mutex.isLocked)) return
        try {
            val r = repo.consulta(fuente.rutaLeer, fuente.leer(if (primera) null else huella), cachear = primera).comoObjeto
            val bloques = (r["bloques"] as? JsonArray)?.mapNotNull { it as? JsonObject }
            huella = r.str("huella") ?: huella
            if (bloques != null) {
                if (!primera) repo.cache.guarda(repo.clave(fuente.rutaLeer, fuente.leer(null)), JsonObject(mapOf("huella" to JsonPrimitive(huella ?: ""), "bloques" to JsonArray(bloques))))
                mutex.withLock {
                    base = bloques
                    // Lo escrito antes de que llegara: se queda, y el próximo envío manda la diferencia.
                    if (estado.sucios.isNotEmpty() && cargado) return@withLock
                    if (!cargado) estado.carga(bloques) else adopta(bloques)
                    cargado = true
                }
            }
            error = null
            if (guardado == EstadoGuardado.Error) guardado = EstadoGuardado.Guardado
        } catch (e: ErrorApi) {
            // Sin red se sigue con lo que hay; la barra de abajo ya dice que no hay conexión.
            if (!cargado) error = e.message
        }
    }

    /**
     * Pone el documento como el del servidor sin rehacer lo que no cambió: los bloques
     * iguales conservan su objeto (y con él el cursor si se está escribiendo en uno).
     */
    private fun adopta(remoto: List<JsonObject>) {
        val actuales = HashMap<String, Bloque>()
        Bloques.enOrden(estado.raiz, { b, _ -> actuales[b.id] = b })
        var cambio = false
        fun rehace(js: List<JsonObject>): MutableList<Bloque> = js.map { o ->
            val id = o.str("id").orEmpty()
            val viejo = actuales[id]
            val solo = JsonObject(o - "children")
            val hijos = rehace((o["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList())
            val b = if (viejo != null && viejo.aJsonSolo() == solo) viejo else { cambio = true; Bloque.deJson(JsonObject(solo + ("children" to JsonArray(emptyList()))), estado.pal) }
            if (b.hijos.map { it.id } != hijos.map { it.id } || b.hijos.zip(hijos).any { (x, y) -> x !== y }) {
                b.hijos.clear()
                b.hijos.addAll(hijos)
                cambio = true
            }
            b
        }.toMutableList()
        val nueva = rehace(remoto)
        if (nueva.map { it.id } != estado.raiz.map { it.id } || nueva.zip(estado.raiz).any { (x, y) -> x !== y }) cambio = true
        if (!cambio) return
        // Lo de otros entra en el documento: deshacer ya no puede volver a una foto entera.
        estado.olvidaHistorial()
        estado.raiz.clear()
        estado.raiz.addAll(nueva)
        if (estado.raiz.isEmpty() && estado.editable) estado.raiz.add(Bloque.nuevo())
        estado.estructuraSinAviso()
    }

    private fun guardaLocal(local: List<JsonObject>) {
        repo.cache.guarda(claveLocal, JsonArray(local))
        repo.cache.guarda(claveBase, JsonArray(base))
    }

    private fun limpiaLocal() {
        repo.cache.borra(claveLocal)
        repo.cache.borra(claveBase)
    }
}
