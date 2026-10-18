package com.monrealperez.notiono.bd

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.datos.DatosVista
import com.monrealperez.notiono.datos.Fila
import com.monrealperez.notiono.datos.Vista
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Avisos
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Una opción de Selección/Multiselección/Estado. */
data class Opcion(val id: String, val label: String, val color: String?, val grupo: String?)

fun Campo.cfg(): JsonObject = config as? JsonObject ?: JsonObject(emptyMap())
fun Campo.opciones(): List<Opcion> = (cfg()["options"] as? JsonArray)?.mapNotNull { o ->
    (o as? JsonObject)?.let { Opcion(it.str("id") ?: return@let null, it.str("label").orEmpty(), it.str("color"), it.str("group")) }
} ?: emptyList()
fun Vista.cfg(): JsonObject = config as? JsonObject ?: JsonObject(emptyMap())

/** Los tipos de campo que la web sabe crear (FIELD_TYPES), con su nombre e icono. */
val TIPOS_CAMPO = listOf(
    "text" to "Texto", "number" to "Número", "select" to "Selección", "multiselect" to "Selección múltiple", "status" to "Estado",
    "person" to "Persona", "files" to "Archivos y multimedia", "checkbox" to "Casilla", "date" to "Fecha", "url" to "URL",
    "email" to "Correo", "phone" to "Teléfono", "location" to "Lugar", "created_time" to "Fecha de creación",
    "last_edited_time" to "Última edición", "created_by" to "Creado por", "last_edited_by" to "Editado por", "id" to "ID",
    "button" to "Botón", "relation" to "Relación", "rollup" to "Rollup", "formula" to "Fórmula",
)

fun iconoCampo(tipo: String) = when (tipo) {
    "number" -> "hash"; "select" -> "circle-chevron-down"; "multiselect" -> "list"; "status" -> "circle-dashed"
    "person" -> "users"; "files" -> "paperclip"; "checkbox" -> "square-check"; "date" -> "calendar"; "url" -> "link"
    "email" -> "at-sign"; "phone" -> "phone"; "location" -> "map-pin"; "created_time", "last_edited_time" -> "clock"
    "created_by", "last_edited_by" -> "circle-user"; "id" -> "key-round"; "button" -> "mouse-pointer-click"
    "relation" -> "arrow-up-right"; "rollup" -> "search"; "formula" -> "function-square"
    else -> "align-left"
}

val VISTAS = listOf(
    "table" to ("Tabla" to "table"), "kanban" to ("Kanban" to "columns-3"), "list" to ("Lista" to "list"),
    "gallery" to ("Galería" to "layout-grid"), "calendar" to ("Calendario" to "calendar"), "timeline" to ("Cronograma" to "chart-gantt"),
    "chart" to ("Gráfica" to "chart-column"), "form" to ("Formulario" to "clipboard-list"),
)

/** Campos que no se editan a mano (los rellena el servidor). */
val CAMPOS_AUTOMATICOS = setOf("created_time", "last_edited_time", "created_by", "last_edited_by", "id", "rollup", "formula")

/**
 * Una base de datos abierta: la vista que se ve (calculada en el servidor con el motor
 * de la web), los cambios optimistas de celdas mientras se guardan y todas las
 * mutaciones (filas, columnas y vistas). Tras cada cambio se recalcula la vista.
 */
class EstadoBD(val pageId: String, private val s: Servicios, private val alcance: CoroutineScope) {
    var vistaId by mutableStateOf<String?>(null)
    var q by mutableStateOf("")
    var datos by mutableStateOf<DatosVista?>(null)
        private set
    var error by mutableStateOf<ErrorApi?>(null)
        private set
    var cargando by mutableStateOf(false)
        private set

    /** Para la ficha: solo esta fila (app.fila), sin los filtros de ninguna vista. */
    var soloFila: String? = null
    var filaActual by mutableStateOf<Fila?>(null)
        private set
    var subtareas by mutableStateOf<List<Fila>>(emptyList())
        private set

    /** Celdas cambiadas en el móvil que aún no ha devuelto el servidor. */
    private val locales = mutableStateMapOf<String, JsonObject>()

    /** Cambios de celda que aún viajan: mientras haya alguno, lo local manda sobre lo recibido. */
    private var enVuelo = 0
    private var recargaJob: Job? = null

    val repo get() = s.repo

    /**
     * Para lo que se pide desde una hoja que se cierra en el mismo gesto (nueva propiedad,
     * nueva vista, exportar): en el alcance de la pantalla de la BD, no en el de la hoja, que
     * se cancela al cerrarse y dejaba la columna o la vista sin aparecer.
     */
    fun lanza(bloque: suspend () -> Unit) = alcance.launch { bloque() }

    private fun ruta() = if (soloFila != null) "app.fila" else "app.vista"

    private fun input() = if (soloFila != null) JsonObject(mapOf("pageId" to JsonPrimitive(pageId), "recordId" to JsonPrimitive(soloFila!!))) else JsonObject(
        mapOf("pageId" to JsonPrimitive(pageId)) +
            (vistaId?.let { mapOf("viewId" to JsonPrimitive(it)) } ?: emptyMap()) +
            (q.takeIf { it.isNotBlank() }?.let { mapOf("q" to JsonPrimitive(it)) } ?: emptyMap()),
    )

    fun cacheada() {
        if (datos == null) s.repo.cacheada(ruta(), input())?.let { lee(it) }
    }

    private fun lee(e: JsonElement) {
        runCatching { json.decodeFromJsonElement(DatosVista.serializer(), e) }.onSuccess {
            datos = sinRepetidos(it)
            if (vistaId == null && soloFila == null) vistaId = it.view?.id
        }
        if (soloFila != null) {
            val o = e as? JsonObject ?: return
            filaActual = (o["fila"] as? JsonObject)?.let { runCatching { json.decodeFromJsonElement(Fila.serializer(), it) }.getOrNull() }
            subtareas = (o["subtareas"] as? JsonArray)?.mapNotNull { runCatching { json.decodeFromJsonElement(Fila.serializer(), it) }.getOrNull() } ?: emptyList()
        }
    }

    /** Filas y grupos sin ids repetidos: son las claves de las listas, y una repetida las cierra. */
    private fun sinRepetidos(d: DatosVista) = d.copy(
        filas = d.filas.distinctBy { it.id },
        grupos = d.grupos?.distinctBy { it.clave }?.map { g ->
            g.copy(ids = g.ids.distinct(), subgrupos = g.subgrupos?.distinctBy { it.clave }?.map { it.copy(ids = it.ids.distinct()) })
        },
    )

    suspend fun carga() {
        cargando = true
        val pedido = input()
        try {
            val r = s.repo.consulta(ruta(), pedido)
            // Mientras viajaba se eligió otra vista o se buscó otra cosa: esta respuesta ya
            // no es la de lo que se ve (la siguiente carga trae la buena).
            if (pedido != input()) return
            lee(r)
            error = null
            // Un refresco que salió antes que el cambio de una celda la devolvería a su valor
            // viejo: lo local se queda hasta que no quede ningún cambio en camino. Sin red, lo
            // recibido es la copia guardada (sin los cambios que esperan en la cola): también.
            if (enVuelo == 0 && !s.repo.sinConexion.value) locales.clear()
        } catch (e: ErrorApi) {
            error = e
        } finally {
            cargando = false
        }
    }

    /** Recalcular pronto (agrupa varios cambios seguidos en una sola consulta). */
    fun recarga(retraso: Long = 350) {
        recargaJob?.cancel()
        recargaJob = alcance.launch {
            delay(retraso)
            carga()
        }
    }

    val vista get() = datos?.view
    val campos get() = datos?.fields ?: emptyList()
    val editable get() = datos?.puedeEditar == true

    fun campo(id: String?) = campos.firstOrNull { it.id == id }

    /** El campo título: el primero de texto (como la web). */
    val titulo get() = campos.firstOrNull { it.type == "text" } ?: campos.firstOrNull()

    fun visibles(): List<Campo> {
        val ocultos = (vista?.cfg()?.arr("hiddenFields"))?.mapNotNull { (it as? JsonPrimitive)?.content }?.toSet() ?: emptySet()
        return campos.filter { it.id !in ocultos }
    }

    fun celdas(f: Fila): JsonObject = locales[f.id]?.let { JsonObject(f.cells + it) } ?: f.cells

    fun tituloDe(f: Fila): String {
        val t = titulo ?: return "Sin título"
        return (celdas(f)[t.id] as? JsonPrimitive)?.takeIf { it.isString }?.content?.ifBlank { null } ?: "Sin título"
    }

    private suspend fun muta(ruta: String, input: JsonObject, encolable: Boolean = true, aviso: String? = null): JsonElement? = try {
        val r = s.repo.mutacion(ruta, input, encolable = encolable, pagina = pageId, etiquetas = listOf("vista:$pageId", "tareas"))
        aviso?.let { Avisos.di(it) }
        r
    } catch (e: ErrorApi) {
        Avisos.di(e.message ?: "No se pudo guardar")
        null
    }

    // ---------- filas ----------

    fun ponCelda(recordId: String, fieldId: String, valor: JsonElement?) {
        val v = valor ?: JsonNull
        locales[recordId] = JsonObject((locales[recordId] ?: JsonObject(emptyMap())) + (fieldId to v))
        enVuelo++
        alcance.launch {
            try {
                muta("db.updateCell", objeto("recordId" to recordId, "fieldId" to fieldId, "value" to v))
            } finally {
                enVuelo--
            }
            recarga()
        }
    }

    /** Fila nueva (con celdas iniciales: plantilla, fecha del día del calendario…). Devuelve su id. */
    suspend fun nuevaFila(celdas: JsonObject? = null): String? {
        val plantilla = celdas ?: plantillaPorDefecto()
        val input = if (plantilla != null) objeto("collectionId" to datos?.collection?.id, "cells" to plantilla) else objeto("collectionId" to datos?.collection?.id)
        val r = muta("db.addRecord", input, encolable = false)
        carga()
        return r?.comoObjeto?.str("id")
    }

    fun plantillas(): List<JsonObject> = (datos?.collection?.templates as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
    private fun plantillaPorDefecto(): JsonObject? = plantillas().firstOrNull { (it["porDefecto"] as? JsonPrimitive)?.content == "true" }?.get("cells") as? JsonObject

    suspend fun subtarea(padre: String): String? {
        val r = muta("db.addSubRecord", objeto("parentRecordId" to padre), encolable = false)
        carga()
        return r?.comoObjeto?.str("id")
    }

    fun borraFila(id: String) = alcance.launch {
        try {
            s.repo.mutacion("db.deleteRecord", objeto("id" to id), pagina = pageId, etiquetas = listOf("vista:$pageId", "tareas"))
            carga()
            Avisos.di("Fila borrada", "Deshacer") {
                alcance.launch { muta("db.restoreRecord", objeto("id" to id)); carga() }
            }
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo borrar")
        }
    }

    fun duplicaFila(id: String) = alcance.launch { muta("db.duplicateRecord", objeto("id" to id), encolable = false, aviso = "Fila duplicada"); carga() }
    fun mueveFila(id: String, antesDe: String? = null, despuesDe: String? = null) = alcance.launch {
        val input = if (antesDe != null) objeto("id" to id, "beforeId" to antesDe) else objeto("id" to id, "afterId" to despuesDe)
        muta("db.moveRecord", input); carga()
    }
    fun guardaPlantilla(recordId: String, nombre: String) = alcance.launch { muta("db.saveTemplate", objeto("recordId" to recordId, "name" to nombre), aviso = "Plantilla guardada"); carga() }

    // ---------- vista ----------

    /** Guarda la config entera de la vista (filtros, orden, grupos…), como la web. */
    fun ponConfig(cambios: Map<String, JsonElement?>) {
        val v = vista ?: return
        val nueva = JsonObject(v.cfg().toMutableMap().apply { for ((k, x) in cambios) if (x == null) remove(k) else put(k, x) })
        datos = datos?.copy(view = v.copy(config = nueva), views = datos!!.views.map { if (it.id == v.id) it.copy(config = nueva) else it })
        alcance.launch { muta("db.updateView", objeto("id" to v.id, "config" to nueva)); recarga(0) }
    }

    fun cfgStr(k: String) = (vista?.cfg()?.get(k) as? JsonPrimitive)?.takeIf { it.isString }?.content

    suspend fun nuevaVista(tipo: String) {
        val r = muta("db.addView", objeto("collectionId" to datos?.collection?.id, "type" to tipo), encolable = false)
        r?.comoObjeto?.str("id")?.let { vistaId = it }
        carga()
    }

    fun renombraVista(id: String, nombre: String) = alcance.launch { muta("db.renameView", objeto("id" to id, "name" to nombre)); carga() }
    fun duplicaVista(id: String) = alcance.launch { val r = muta("db.duplicateView", objeto("id" to id), encolable = false); r?.comoObjeto?.str("id")?.let { vistaId = it }; carga() }
    fun borraVista(id: String) = alcance.launch {
        muta("db.deleteView", objeto("id" to id), encolable = false)
        if (vistaId == id) vistaId = datos?.views?.firstOrNull { it.id != id }?.id
        carga()
    }
    fun tipoVista(id: String, tipo: String) = alcance.launch { muta("db.setViewType", objeto("id" to id, "type" to tipo)); carga() }
    fun mueveVista(id: String, antesDe: String?) = alcance.launch {
        muta("db.moveView", if (antesDe != null) objeto("id" to id, "beforeId" to antesDe) else objeto("id" to id)); carga()
    }

    // ---------- columnas ----------

    suspend fun nuevoCampo(tipo: String, nombre: String, despuesDe: String? = null): String? {
        val input = JsonObject(objeto("collectionId" to datos?.collection?.id, "name" to nombre, "type" to tipo) +
            (despuesDe?.let { mapOf("afterFieldId" to JsonPrimitive(it)) } ?: emptyMap()))
        val r = muta("db.addField", input, encolable = false)
        carga()
        return r?.comoObjeto?.str("id")
    }

    fun renombraCampo(id: String, nombre: String) = alcance.launch { muta("db.updateField", objeto("id" to id, "name" to nombre)); carga() }
    fun configCampo(id: String, config: JsonObject) = alcance.launch { muta("db.updateField", objeto("id" to id, "config" to config)); carga() }
    fun tipoCampo(id: String, tipo: String) = alcance.launch { muta("db.setFieldType", objeto("id" to id, "type" to tipo), encolable = false, aviso = "Tipo cambiado"); carga() }
    fun borraCampo(id: String) = alcance.launch { muta("db.deleteField", objeto("id" to id), encolable = false); carga() }
    fun duplicaCampo(id: String) = alcance.launch { muta("db.duplicateField", objeto("id" to id), encolable = false); carga() }
    fun mueveCampo(id: String, antesDe: String? = null, despuesDe: String? = null) = alcance.launch {
        muta("db.moveField", if (antesDe != null) objeto("id" to id, "beforeId" to antesDe) else objeto("id" to id, "afterId" to despuesDe)); carga()
    }

    suspend fun nuevaRelacion(nombre: String, destino: String, espejo: Boolean) {
        muta("db.addRelation", objeto("collectionId" to datos?.collection?.id, "name" to nombre, "targetCollectionId" to destino, "mirror" to espejo), encolable = false)
        carga()
    }

    suspend fun nuevoRollup(nombre: String, relacion: String, destino: String?, agg: String) {
        val input = JsonObject(objeto("collectionId" to datos?.collection?.id, "name" to nombre, "relationFieldId" to relacion, "agg" to agg) +
            (destino?.let { mapOf("targetFieldId" to JsonPrimitive(it)) } ?: emptyMap()))
        muta("db.addRollup", input, encolable = false)
        carga()
    }

    suspend fun nuevaFormula(nombre: String, expresion: String) {
        muta("db.addFormula", objeto("collectionId" to datos?.collection?.id, "name" to nombre, "expression" to expresion), encolable = false)
        carga()
    }

    fun ponDescripcion(texto: String) = alcance.launch {
        muta("db.setCollectionDescription", objeto("collectionId" to datos?.collection?.id, "description" to texto)); carga()
    }

    fun nombrePersona(id: String?) = datos?.personas?.firstOrNull { it.id == id }?.nombre
}
