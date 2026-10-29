package com.monrealperez.notiono.ui.inicio

import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import java.net.URI
import java.time.LocalDate
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * Inicio personalizable, el mismo de la web (src/lib/inicio.ts): qué bloques se ven y en
 * qué orden, los enlaces fijados y qué se abre al arrancar. Lo guarda el servidor
 * (`inicio.get` / `inicio.guardar`), así que vale igual en la web y en la app.
 */
val BLOQUES = listOf("recientes", "tareas", "hoy", "proximas", "favoritos", "enlaces", "acciones", "bloc", "nota", "recordatorios")
private val VISIBLES_POR_DEFECTO = setOf("recientes", "tareas")
const val MAX_ENLACES = 30
const val MAX_BLOC = 20_000

data class Bloque(val id: String, val visible: Boolean)

/** Un enlace fijado: a una página (`pageId`) o a una web (`url`). */
data class Enlace(val id: String, val pageId: String? = null, val url: String? = null, val titulo: String? = null) {
    val esWeb get() = url != null
}

/** «Abrir al iniciar»: "inicio", "ultima" o "pagina" (con `pageId`). */
data class Abrir(val tipo: String = "inicio", val pageId: String? = null)

/**
 * `nota`: la página del bloque «Nota fijada»; `tareas`: la BD de las tareas rápidas; `bloc`:
 * el texto del «Bloc de notas» (se guarda aparte, con `inicio.guardarBloc`).
 */
data class ConfigInicio(
    val bloques: List<Bloque>,
    val enlaces: List<Enlace> = emptyList(),
    val abrir: Abrir = Abrir(),
    val nota: String? = null,
    val tareas: String? = null,
    val bloc: String = "",
) {
    fun visible(id: String) = bloques.any { it.id == id && it.visible }

    fun aJson(): JsonObject = objeto(
        "bloques" to bloques.map { objeto("id" to it.id, "visible" to it.visible) },
        "enlaces" to enlaces.map { e ->
            val base = if (e.esWeb) objeto("id" to e.id, "tipo" to "web", "url" to e.url) else objeto("id" to e.id, "tipo" to "pagina", "pageId" to e.pageId)
            if (e.titulo.isNullOrBlank()) base else JsonObject(base + ("titulo" to JsonPrimitive(e.titulo)))
        },
        "abrir" to if (abrir.tipo == "pagina") objeto("tipo" to "pagina", "pageId" to abrir.pageId) else objeto("tipo" to abrir.tipo),
        "nota" to nota,
        "tareas" to tareas,
    )

    companion object {
        fun porDefecto() = ConfigInicio(BLOQUES.map { Bloque(it, it in VISIBLES_POR_DEFECTO) })

        /**
         * Lo que llega del servidor (ya normalizado) o de la caché, con la misma tolerancia
         * que `normalizaInicio`: un bloque que esta versión de la app no conoce se ignora y
         * los que falten se añaden ocultos al final.
         */
        fun de(e: JsonElement?): ConfigInicio {
            val o = e as? JsonObject ?: return porDefecto()
            val vistos = LinkedHashMap<String, Bloque>()
            for (b in o.arr("bloques").orEmpty()) {
                val id = (b as? JsonObject)?.str("id") ?: continue
                if (id !in BLOQUES || id in vistos) continue
                vistos[id] = Bloque(id, (b["visible"] as? JsonPrimitive)?.booleanOrNull != false)
            }
            val bloques = if (vistos.isEmpty()) porDefecto().bloques else vistos.values + BLOQUES.filter { it !in vistos }.map { Bloque(it, false) }
            val ids = HashSet<String>()
            val enlaces = o.arr("enlaces").orEmpty().mapNotNull { x ->
                val en = x as? JsonObject ?: return@mapNotNull null
                val id = en.str("id")?.takeIf { it.isNotBlank() && ids.add(it) } ?: return@mapNotNull null
                val titulo = en.str("titulo")?.trim()?.takeIf { it.isNotEmpty() }
                when (en.str("tipo")) {
                    "pagina" -> en.str("pageId")?.takeIf { it.isNotBlank() }?.let { Enlace(id, pageId = it, titulo = titulo) }
                    "web" -> urlValida(en.str("url"))?.let { Enlace(id, url = it, titulo = titulo) }
                    else -> null
                }
            }.take(MAX_ENLACES)
            val a = o.obj("abrir")
            val abrir = when (a?.str("tipo")) {
                "ultima" -> Abrir("ultima")
                "pagina" -> a.str("pageId")?.takeIf { it.isNotBlank() }?.let { Abrir("pagina", it) } ?: Abrir()
                else -> Abrir()
            }
            val texto = { k: String -> o.str(k)?.trim()?.takeIf { it.isNotEmpty() }?.take(64) }
            return ConfigInicio(bloques, enlaces, abrir, texto("nota"), texto("tareas"), (o["bloc"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.take(MAX_BLOC) ?: "")
        }
    }
}

/** Solo http/https (como la web): «ejemplo.es» a secas se entiende como https://ejemplo.es. */
fun urlValida(u: String?): String? {
    val t = u?.trim()?.takeIf { it.isNotEmpty() && it.length <= 2000 } ?: return null
    val conEsquema = if (Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(t)) t else "https://$t"
    val uri = runCatching { URI(conEsquema) }.getOrNull() ?: return null
    return conEsquema.takeIf { uri.scheme?.lowercase() in setOf("http", "https") && !uri.host.isNullOrBlank() }
}

/** Sube (-1) o baja (+1) un elemento; fuera de rango, la lista tal cual. */
fun <T> List<T>.mueve(i: Int, paso: Int): List<T> {
    val j = i + paso
    if (i !in indices || j !in indices) return this
    return toMutableList().also { it[i] = this[j]; it[j] = this[i] }
}

/** La página que se abre al arrancar, o null para quedarse en el Inicio (también si ya no existe). */
fun destinoAlIniciar(abrir: Abrir, existe: (String) -> Boolean, ultima: String?): String? {
    val id = when (abrir.tipo) { "pagina" -> abrir.pageId; "ultima" -> ultima; else -> null }
    return id?.takeIf(existe)
}

private fun diaDe(t: JsonObject, k: String) = t.str(k)?.take(10)?.takeIf { Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(it) }

/** Tareas para hoy: de `db.myTasks` (ya sin lo hecho), las de hoy y las vencidas, lo vencido primero. */
fun tareasDeHoy(tareas: List<JsonObject>, hoy: LocalDate): List<Pair<JsonObject, Boolean>> {
    val h = hoy.toString()
    return tareas.mapNotNull { t -> diaDe(t, "date")?.takeIf { it <= h }?.let { t to (it < h) } }.sortedBy { diaDe(it.first, "date") }
}

data class Proxima(val key: String, val titulo: String, val inicio: String, val pageId: String, val recordId: String?, val recordatorio: Boolean)

/**
 * Próximas fechas (como `proximasFechas` de la web): mis tareas desde mañana y mis
 * recordatorios (`inicio.recordatorios`) desde hoy, hasta dentro de `dias`; los
 * recordatorios de mis tareas no se repiten.
 */
fun proximasFechas(tareas: List<JsonObject>, recordatorios: List<JsonObject>, hoy: LocalDate, dias: Long = 7): List<Proxima> {
    val h = hoy.toString()
    val manana = hoy.plusDays(1).toString()
    val hasta = hoy.plusDays(dias).toString()
    val out = ArrayList<Proxima>()
    for (t in tareas) {
        val d = diaDe(t, "date") ?: continue
        val rid = t.str("recordId") ?: continue
        if (d in manana..hasta) out += Proxima("t:$rid", t.str("title").orEmpty(), t.str("date")!!, t.str("pageId").orEmpty(), rid, false)
    }
    val mias = tareas.mapNotNull { it.str("recordId") }.toSet()
    val vistos = HashSet<String>()
    for (r in recordatorios) {
        val d = diaDe(r, "inicio") ?: continue
        val rid = r.str("recordId")
        if (d !in h..hasta || (rid != null && rid in mias)) continue
        if (!vistos.add("${rid ?: r.str("pageId")}|${r.str("inicio")}")) continue
        out += Proxima("r:${r.str("key")}", r.str("titulo").orEmpty(), r.str("inicio")!!, r.str("pageId").orEmpty(), rid, true)
    }
    return out.sortedWith(compareBy<Proxima> { it.inicio.take(10) }.thenBy { it.titulo })
}

/** El Inicio y los títulos e iconos actuales de las páginas que nombra (`inicio.get`). */
data class DatosInicio(val config: ConfigInicio, val paginas: Map<String, Pair<String, String?>>) {
    companion object {
        fun de(e: JsonElement?): DatosInicio {
            val o = e?.comoObjeto
            val paginas = o?.obj("paginas")?.mapValues { (_, v) -> v.comoObjeto.let { (it.str("title") ?: "") to it.str("icon") } }.orEmpty()
            return DatosInicio(ConfigInicio.de(o?.get("config")), paginas)
        }
    }
}

/** «Buenos días» … según la hora (como `saludoInicio` de la web). */
fun saludo(hora: Int): String = when {
    hora < 7 -> "Buenas noches"
    hora < 13 -> "Buenos días"
    hora < 21 -> "Buenas tardes"
    else -> "Buenas noches"
}

/** «jueves 29 de octubre». */
fun fechaLarga(d: LocalDate): String =
    d.format(java.time.format.DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", com.monrealperez.notiono.util.Fechas.es))

// ── Mis tareas por secciones (como `agrupaTareas` de src/lib/tareas.ts) ──────

val SECCIONES_TAREAS = listOf("vencidas" to "Vencidas", "hoy" to "Hoy", "manana" to "Mañana", "proximas" to "Próximas", "sinFecha" to "Sin fecha", "completadas" to "Completadas")

fun seccionDe(t: JsonObject, hoy: LocalDate): String {
    if ((t["hecha"] as? JsonPrimitive)?.booleanOrNull == true) return "completadas"
    val d = diaDe(t, "date") ?: return "sinFecha"
    val h = hoy.toString()
    return when {
        d < h -> "vencidas"
        d == h -> "hoy"
        d == hoy.plusDays(1).toString() -> "manana"
        else -> "proximas"
    }
}

/** Las secciones con algo, en orden; `soloHoy`: lo vencido y lo de hoy. */
fun agrupaTareas(tareas: List<JsonObject>, hoy: LocalDate, soloHoy: Boolean = false): List<Triple<String, String, List<JsonObject>>> =
    SECCIONES_TAREAS.filter { !soloHoy || it.first == "vencidas" || it.first == "hoy" }.mapNotNull { (id, titulo) ->
        val lista = tareas.filter { seccionDe(it, hoy) == id }
            .let { l -> if (id == "completadas") l else l.sortedWith(compareBy<JsonObject>({ it.str("date").orEmpty() }, { it.str("title").orEmpty() })) }
        if (lista.isEmpty()) null else Triple(id, titulo, lista)
    }
