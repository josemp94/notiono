package com.monrealperez.notiono.widgets

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Parcel
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.MainActivity
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import java.io.File
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Los widgets de la pantalla de inicio: Nota, Lista de una base de datos, Nota rápida,
 * Acciones rápidas, Recientes, Favoritos y Calendario.
 *
 * Son RemoteViews clásicos (`AppWidgetProvider`), no Glance. Glance pinta SIEMPRE desde
 * un trabajo de WorkManager con la sesión solo en memoria: en HyperOS ese trabajo se
 * retrasa y el proceso muere antes, y al relanzarse `SessionWorker` falla sin pintar ni
 * dejar rastro (ver «Widgets en blanco (2.2.0)» en docs/app-nativa.md). Aquí:
 *
 *  - pintar es síncrono y sin red: en `onUpdate` (y en cada acción) se pinta al momento
 *    lo último bueno, que vive en disco por widget (`filesDir/widgets/<id>.json`);
 *  - la red solo refresca detrás (`goAsync`, o un trabajo con red si no la había) y al
 *    volver se pinta otra vez; si falla, se queda lo último con «Sin actualizar · hace 2 h»;
 *  - nunca queda vacío: o datos, o un texto que dice qué pasa;
 *  - cada pintado se apunta en el registro de diagnóstico (qué, cuántos elementos, tamaño).
 */
object Widgets {
    const val INICIA_SESION = "Inicia sesión en la app"

    const val ACCION_REFRESCAR = "com.monrealperez.notiono.widget.REFRESCAR"
    const val ACCION_CASILLA = "com.monrealperez.notiono.widget.CASILLA"
    const val ACCION_FILA = "com.monrealperez.notiono.widget.FILA"
    const val ACCION_DIA = "com.monrealperez.notiono.widget.DIA"
    const val ACCION_MES = "com.monrealperez.notiono.widget.MES"
    const val ACCION_ANTERIOR = "com.monrealperez.notiono.widget.ANTERIOR"
    const val ACCION_SIGUIENTE = "com.monrealperez.notiono.widget.SIGUIENTE"

    /** Todos los receptores, en el orden en que se repintan. */
    val receptores: List<Class<out ProveedorWidget>> = listOf(
        NotaReceiver::class.java, ListaReceiver::class.java, CalendarioReceiver::class.java,
        RecientesReceiver::class.java, FavoritosReceiver::class.java, RapidaReceiver::class.java, AccionesReceiver::class.java,
    )

    fun programa(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<WidgetsWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("widgets", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Si un refresco no tuvo red, otro en cuanto la haya (WorkManager con red). */
    fun reintentaConRed(ctx: Context) {
        runCatching {
            val req = OneTimeWorkRequestBuilder<WidgetsWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInitialDelay(30, TimeUnit.SECONDS)
                .addTag("red")
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("widgets-red", ExistingWorkPolicy.KEEP, req)
        }
    }

    fun ids(ctx: Context, clase: Class<out ProveedorWidget>): IntArray =
        runCatching { AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, clase)) }.getOrNull() ?: IntArray(0)

    /** ¿Hay algún widget de Notiono en la pantalla de inicio? */
    fun hay(ctx: Context): Boolean = receptores.any { ids(ctx, it).isNotEmpty() }

    fun proveedor(clase: Class<out ProveedorWidget>): ProveedorWidget = clase.getDeclaredConstructor().newInstance()

    /** El proveedor de un widget puesto (por la clase que le dio el sistema). */
    fun proveedorDe(ctx: Context, id: Int): ProveedorWidget? {
        val clase = AppWidgetManager.getInstance(ctx).getAppWidgetInfo(id)?.provider?.className ?: return null
        return receptores.firstOrNull { it.name == clase }?.let(::proveedor)
    }

    /** Pinta ya (desde disco) todos los widgets puestos y luego los refresca de la red. */
    suspend fun actualizaTodo(ctx: Context, motivo: String) {
        val app = ctx.applicationContext
        val puestos = receptores.flatMap { c -> ids(app, c).map { proveedor(c) to it } }
        puestos.forEach { (p, id) -> p.pinta(app, id) }
        puestos.forEach { (p, id) -> p.refresca(app, id, motivo) }
    }

    /** Solo repintar desde disco (otro día en el calendario, un cambio de modo): sin red. */
    fun repintaTodo(ctx: Context) {
        for (c in receptores) ids(ctx, c).forEach { proveedor(c).pinta(ctx, it) }
    }

    /**
     * Espera (como mucho `maxMs`) a que haya red utilizable. Recién arrancado el proceso en
     * segundo plano, Android tarda un momento en dejarle salir a la red (antes la primera
     * petición fallaba en 50 ms y la segunda iba): `activeNetwork` es null mientras está
     * bloqueada.
     */
    suspend fun esperaRed(ctx: Context, maxMs: Long = 4_000): Boolean {
        val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return true
        fun lista(n: Network? = cm.activeNetwork): Boolean {
            if (n == null) return false
            val c = cm.getNetworkCapabilities(n) ?: return true
            return c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        }
        if (lista()) return true
        return withTimeoutOrNull(maxMs) {
            callbackFlow {
                val cb = object : ConnectivityManager.NetworkCallback() {
                    override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                        if (lista()) trySend(true)
                    }
                    override fun onBlockedStatusChanged(network: Network, blocked: Boolean) {
                        if (!blocked && lista()) trySend(true)
                    }
                }
                runCatching { cm.registerDefaultNetworkCallback(cb) }.onFailure { trySend(true) }
                if (lista()) trySend(true)
                awaitClose { runCatching { cm.unregisterNetworkCallback(cb) } }
            }.first()
        } ?: false
    }

    /**
     * Android 15+: el selector de widgets enseña la vista previa generada (RemoteViews con
     * el contenido de [Muestras]). El sistema limita las llamadas: una vez por versión.
     */
    fun publicaVistasPrevias(ctx: Context) {
        if (Build.VERSION.SDK_INT < 35) return
        val prefs = ctx.getSharedPreferences("widgets", Context.MODE_PRIVATE)
        if (prefs.getInt("vistasPrevias", 0) == BuildConfig.VERSION_CODE) return
        val m = AppWidgetManager.getInstance(ctx) ?: return
        val ok = receptores.all { c ->
            runCatching { m.setWidgetPreview(ComponentName(ctx, c), android.appwidget.AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN, proveedor(c).muestra(ctx)) }.getOrDefault(false)
        }
        if (ok) prefs.edit().putInt("vistasPrevias", BuildConfig.VERSION_CODE).apply()
    }

    /** Glance dejaba trabajos suyos en WorkManager (uno con 10 años de retraso): fuera. */
    fun limpiaRestosDeGlance(ctx: Context) {
        runCatching {
            val wm = WorkManager.getInstance(ctx)
            wm.cancelUniqueWork("sessionWorkerKeepEnabled")
            wm.cancelUniqueWork("updateRequestWorkerKeepEnabled")
        }
    }

    fun abre(ctx: Context, uri: String): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(uri), ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    fun configura(ctx: Context, id: Int): Intent =
        Intent(ctx, ConfigWidgetActivity::class.java)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .setData(Uri.parse("notiono-widget://configurar/$id"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Un toque que abre algo de la app (cada `uri` distinta es otro PendingIntent). */
    fun piAbre(ctx: Context, uri: String): PendingIntent =
        PendingIntent.getActivity(ctx, 0, abre(ctx, uri), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    fun piConfigura(ctx: Context, id: Int): PendingIntent =
        PendingIntent.getActivity(ctx, 0, configura(ctx, id), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Un toque que se atiende en el propio receptor (refrescar, cambiar de mes, elegir día). */
    fun piAccion(ctx: Context, clase: Class<out ProveedorWidget>, accion: String, id: Int, valor: String = ""): PendingIntent {
        val i = Intent(ctx, clase).setAction(accion)
            // El dato distingue un PendingIntent de otro (los extras no cuentan).
            .setData(Uri.parse("notiono-widget://$id/${accion.substringAfterLast('.')}/${Uri.encode(valor)}"))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .putExtra(EXTRA_VALOR, valor)
        return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /**
     * La plantilla de los toques de las listas (una por lista): cada fila pone su dato
     * (`notiono://…` abre; `notiono-widget://…` marca una casilla) y [AccionWidgetActivity]
     * lo reparte. Tiene que ser mutable para que la fila rellene el dato.
     */
    fun piPlantilla(ctx: Context, id: Int): PendingIntent {
        val i = Intent(ctx, AccionWidgetActivity::class.java).setData(Uri.parse("notiono-widget://plantilla/$id"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val mutable = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        return PendingIntent.getActivity(ctx, id, i, mutable or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Lo que rellena una fila de lista en la plantilla. */
    fun relleno(uri: String): Intent = Intent().setData(Uri.parse(uri))

    const val EXTRA_VALOR = "valor"

    /** Las pruebas leen aquí los RemoteViews que se mandan de verdad al escritorio. */
    @androidx.annotation.VisibleForTesting
    var alPintar: ((Int, RemoteViews) -> Unit)? = null

    /** Marcar una casilla de la nota desde el widget: una operación de bloque, como la app. */
    suspend fun marcaCasilla(ctx: Context, pagina: String, bloque: String, espacio: String? = null) {
        val s = Servicios.de(ctx)
        val bloques = (s.repo.consulta("app.bloques", objeto("id" to pagina), cachear = false, espacio = espacio) as? kotlinx.serialization.json.JsonObject)
            ?.get("bloques") as? kotlinx.serialization.json.JsonArray ?: return
        fun busca(bs: List<JsonElement>): kotlinx.serialization.json.JsonObject? = bs.firstNotNullOfOrNull { e ->
            val b = e as? kotlinx.serialization.json.JsonObject ?: return@firstNotNullOfOrNull null
            if ((b["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content == bloque) b
            else busca((b["children"] as? kotlinx.serialization.json.JsonArray) ?: emptyList())
        }
        val b = busca(bloques) ?: return
        val props = b["props"] as? kotlinx.serialization.json.JsonObject ?: kotlinx.serialization.json.JsonObject(emptyMap())
        val hecho = (props["checked"] as? kotlinx.serialization.json.JsonPrimitive)?.content == "true"
        val nuevo = kotlinx.serialization.json.JsonObject(b - "children" + ("props" to kotlinx.serialization.json.JsonObject(props + ("checked" to kotlinx.serialization.json.JsonPrimitive(!hecho)))))
        s.repo.mutacion("app.aplicar", objeto("id" to pagina, "ops" to listOf(objeto("op" to "upsert", "block" to nuevo))), pagina = pagina, etiquetas = listOf("bloques:$pagina"), espacio = espacio)
    }

    /** Marcar (o desmarcar) la casilla de una fila desde la Lista de BD. */
    suspend fun marcaFila(ctx: Context, pagina: String, fila: String, campo: String, valor: Boolean, espacio: String? = null) {
        Servicios.de(ctx).repo.mutacion(
            "db.updateCell", objeto("recordId" to fila, "fieldId" to campo, "value" to valor),
            pagina = pagina, etiquetas = listOf("vista:$pagina"), espacio = espacio,
        )
    }
}

// ---------------- Configuración y lo último bueno, por widget ----------------

/** Una base de datos del widget Calendario: su campo de fecha y si solo lo mío. */
@Serializable
data class FuenteCal(val pageId: String, val fieldId: String? = null, val mios: Boolean = false, val nombre: String? = null)

/**
 * Lo que se eligió al poner el widget. `pagina`: la página (Nota, Nota rápida) o la BD
 * (Lista, Acciones); `vista`: la vista de la Lista; `fuentes`, `mes` y `dia`: el Calendario.
 */
@Serializable
data class ConfigWidget(
    val pagina: String? = null,
    val vista: String? = null,
    val titulo: String? = null,
    val fuentes: List<FuenteCal> = emptyList(),
    val mes: String? = null,
    val dia: String? = null,
    /**
     * El espacio en el que se puso (desde la 2.4.0): sigue enseñando lo suyo aunque luego
     * se cambie de espacio en la app. Los de antes lo averiguan al refrescar.
     */
    val espacio: String? = null,
    /**
     * Nota en modo «Mis notas recientes» (2.5.0): `pagina` es la que se ve ahora y ‹ › pasan
     * por las últimas abiertas en el móvil (hasta 20, `Recientes`).
     */
    val recientes: Boolean = false,
)

object Configs {
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("widgets_config", Context.MODE_PRIVATE)

    @Synchronized
    fun lee(ctx: Context, id: Int): ConfigWidget {
        prefs(ctx).getString("$id", null)?.let { t -> runCatching { return json.decodeFromString(ConfigWidget.serializer(), t) } }
        val migrada = deGlance(ctx, id) ?: return ConfigWidget()
        guarda(ctx, id, migrada)
        return migrada
    }

    @Synchronized
    fun guarda(ctx: Context, id: Int, c: ConfigWidget) {
        prefs(ctx).edit().putString("$id", json.encodeToString(ConfigWidget.serializer(), c)).commit()
    }

    @Synchronized
    fun borra(ctx: Context, id: Int) {
        prefs(ctx).edit().remove("$id").commit()
        Instantaneas.borra(ctx, id)
        ctx.preferencesDataStoreFile("appWidget-$id").delete()
    }

    /**
     * Hasta la 2.1.0 la configuración la guardaba Glance en un DataStore por widget
     * (`datastore/appWidget-<id>.preferences_pb`, claves «pagina», «vista», «titulo»): se
     * lee una vez y pasa aquí, para que los widgets ya puestos sigan como estaban.
     */
    private fun deGlance(ctx: Context, id: Int): ConfigWidget? {
        val f = ctx.preferencesDataStoreFile("appWidget-$id")
        if (!f.exists()) return null
        val alcance = CoroutineScope(Dispatchers.IO + Job())
        return try {
            val p = runBlocking(Dispatchers.IO) {
                withTimeoutOrNull(3_000) { PreferenceDataStoreFactory.create(scope = alcance, produceFile = { f }).data.first() }
            } ?: return null
            val m = p.asMap().mapKeys { it.key.name }
            ConfigWidget(pagina = m["pagina"] as? String, vista = m["vista"] as? String, titulo = m["titulo"] as? String)
        } catch (e: Exception) {
            Servicios.de(ctx).registro.anota("widget", "migrar configuración de Glance: fallo", e)
            null
        } finally {
            alcance.cancel()
        }
    }
}

/** Lo último bueno de un widget: lo que se pinta sin red. `clave`: de qué configuración salió. */
@Serializable
data class Instantanea(val clave: String = "", val datos: JsonElement? = null, val fecha: Long = 0, val fallo: String? = null)

object Instantaneas {
    private fun fichero(ctx: Context, id: Int) = File(File(ctx.filesDir, "widgets").apply { mkdirs() }, "$id.json")

    @Synchronized
    fun lee(ctx: Context, id: Int): Instantanea? = runCatching {
        fichero(ctx, id).takeIf { it.exists() }?.let { json.decodeFromString(Instantanea.serializer(), it.readText()) }
    }.getOrNull()

    @Synchronized
    fun guarda(ctx: Context, id: Int, i: Instantanea) {
        runCatching {
            val f = fichero(ctx, id)
            val tmp = File(f.path + ".tmp")
            tmp.writeText(json.encodeToString(Instantanea.serializer(), i))
            tmp.renameTo(f)
        }
    }

    @Synchronized
    fun borra(ctx: Context, id: Int) {
        fichero(ctx, id).delete()
    }
}

/** Una consulta de la que vive un widget (la misma clave de caché que usa la app). */
data class Consulta(val ruta: String, val input: JsonElement?)

/** Lo que enseña un widget de datos: lo último bueno, de cuándo es y cómo fue el último refresco. */
data class EstadoWidget(val datos: JsonElement?, val fecha: Long?, val fallo: String?, val conSesion: Boolean = true) {
    /** La línea de estado: «Cargando…», el fallo si no hay nada que enseñar, o la marca de viejo. */
    fun aviso(ahora: Instant = Instant.now()): String? = when {
        datos == null && fallo == null -> "Cargando…"
        datos == null -> "$fallo. Toca para reintentar."
        fallo != null -> "Sin actualizar" + (fecha?.takeIf { it > 0 }?.let { " · " + Fechas.haceCuanto(Instant.ofEpochMilli(it).toString(), ahora) } ?: "") +
            (if (fallo == Widgets.INICIA_SESION) " · $fallo" else "")
        else -> null
    }
}

/** Lo que se pintó: las vistas y, para el registro, qué eran y cuántos elementos. */
class Pintado(val rv: RemoteViews, val que: String, val elementos: Int = 0)

/**
 * Lo común de todos los widgets. Cada uno dice de qué consultas vive ([consultas]), qué
 * guarda de sus respuestas ([resume]) y cómo se pinta ([vista]); esto hace el resto.
 */
abstract class ProveedorWidget : AppWidgetProvider() {
    /** Nombre en el registro: «nota», «lista»… */
    abstract val tipo: String

    /** ¿Vive de datos del servidor? (Nota rápida y Acciones no.) */
    open val conDatos: Boolean = true

    /** De qué consultas vive (vacío: aún sin configurar). */
    open fun consultas(c: ConfigWidget): List<Consulta> = emptyList()

    /** Qué configuración produjo los datos guardados (si cambia, lo guardado ya no vale). */
    open fun clave(c: ConfigWidget): String = consultas(c).joinToString("|") { "${it.ruta}${it.input}" }

    /** De las respuestas, lo que se guarda para pintar (lanza si no tienen la forma esperada). */
    open fun resume(c: ConfigWidget, respuestas: List<JsonElement>): JsonElement = error("sin datos")

    abstract fun vista(ctx: Context, id: Int, c: ConfigWidget, e: EstadoWidget, opciones: Bundle?): Pintado

    /** La vista previa del selector (Android 15) y de los PNG. */
    abstract fun muestra(ctx: Context): RemoteViews

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { pinta(ctx, it, mgr) }
        refrescaDetras(ctx, ids, "sistema")
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opciones: Bundle?) {
        pinta(ctx, id, mgr)
    }

    override fun onDeleted(ctx: Context, ids: IntArray) {
        ids.forEach { Configs.borra(ctx, it) }
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        val valor = intent.getStringExtra(Widgets.EXTRA_VALOR).orEmpty()
        when (intent.action) {
            Widgets.ACCION_REFRESCAR -> {
                pinta(ctx, id)
                refrescaDetras(ctx, intArrayOf(id), "boton")
            }
            Widgets.ACCION_FILA, Widgets.ACCION_CASILLA -> {
                // Se ve hecho al momento (en lo guardado) y el cambio va al servidor detrás.
                val q = Uri.parse(valor)
                val pagina = q.getQueryParameter("pagina")
                val elemento = q.getQueryParameter("id")
                if (pagina != null && elemento != null) {
                    alternaLocal(ctx, id, elemento)
                    pinta(ctx, id)
                    enSegundoPlano(ctx, "marcar") {
                        val ws = Configs.lee(ctx, id).espacio
                        if (intent.action == Widgets.ACCION_CASILLA) Widgets.marcaCasilla(ctx, pagina, elemento, ws)
                        else Widgets.marcaFila(ctx, pagina, elemento, q.getQueryParameter("campo") ?: return@enSegundoPlano, q.getQueryParameter("valor") == "true", ws)
                        refresca(ctx, id, "casilla")
                    }
                }
            }
            else -> {
                if (!accion(ctx, id, intent.action, valor)) super.onReceive(ctx, intent)
            }
        }
    }

    /** Acciones propias de un widget (el Calendario: día y mes). true si se atendió. */
    open fun accion(ctx: Context, id: Int, accion: String?, valor: String): Boolean = false

    /** Marca/desmarca un elemento en lo guardado, para verlo cambiado sin esperar al servidor. */
    open fun alternaLocal(ctx: Context, id: Int, elemento: String) {}

    /**
     * Lo de detrás de un receptor: `goAsync` y como mucho 25 s (Android da algo más). Fuera
     * de un receptor (pruebas, la app) `goAsync` no existe y se sigue igual.
     */
    protected fun enSegundoPlano(ctx: Context, que: String, bloque: suspend () -> Unit) {
        val app = ctx.applicationContext
        val pendiente = runCatching { goAsync() }.getOrNull()
        Servicios.de(app).alcance.launch {
            try {
                withTimeoutOrNull(25_000) { bloque() }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                Servicios.de(app).registro.anota("widget", "$tipo · $que: fallo", e)
            } finally {
                runCatching { pendiente?.finish() }
            }
        }
    }

    protected fun refrescaDetras(ctx: Context, ids: IntArray, motivo: String) {
        if (ids.isEmpty() || !conDatos) return
        enSegundoPlano(ctx, "refrescar") { ids.forEach { refresca(ctx.applicationContext, it, motivo) } }
    }

    /**
     * Un widget puesto antes de la 2.4.0 no sabe en qué espacio está su página: se pregunta
     * (`workspace.dePagina` da el espacio si no es el activo) y se guarda. Sin página (Recientes,
     * Acciones) sigue al espacio activo. Sin red, la próxima vez.
     */
    private suspend fun averiguaEspacio(ctx: Context, id: Int, c: ConfigWidget): String? {
        val s = Servicios.de(ctx)
        val pagina = c.pagina ?: c.fuentes.firstOrNull()?.pageId ?: return null
        val r = try {
            s.api.query("workspace.dePagina", com.monrealperez.notiono.red.objeto("pageId" to pagina))
        } catch (e: ErrorApi) {
            return null
        }
        val ws = (r as? kotlinx.serialization.json.JsonObject)?.let { (it["workspaceId"] as? kotlinx.serialization.json.JsonPrimitive)?.content }
            ?: s.espacioActivo() ?: return null
        Configs.guarda(ctx, id, c.copy(espacio = ws))
        s.registro.anota("widget", "$tipo#$id · espacio averiguado")
        return ws
    }

    /** Lo que hay que pintar ahora mismo, sin red. */
    fun estado(ctx: Context, id: Int, c: ConfigWidget): EstadoWidget {
        val s = Servicios.de(ctx)
        val i = Instantaneas.lee(ctx, id)?.takeIf { it.clave == clave(c) } ?: deCacheVieja(ctx, id, c)
        return EstadoWidget(i?.datos, i?.fecha, i?.fallo, s.sesion.token != null)
    }

    /**
     * Sin nada guardado aún (recién actualizada la app desde la 2.1.0): lo que la app tenía
     * en su caché de red para esas mismas consultas.
     */
    private fun deCacheVieja(ctx: Context, id: Int, c: ConfigWidget): Instantanea? {
        val s = Servicios.de(ctx)
        val q = consultas(c).ifEmpty { return null }
        val r = q.map { s.repo.cacheada(it.ruta, it.input, c.espacio) ?: return null }
        val datos = runCatching { resume(c, r) }.getOrNull() ?: return null
        val fecha = q.mapNotNull { s.cache.fecha(s.repo.clave(it.ruta, it.input, c.espacio)) }.minOrNull() ?: 0
        return Instantanea(clave(c), datos, fecha, null).also { Instantaneas.guarda(ctx, id, it) }
    }

    /**
     * Pinta ya, desde disco. Nunca lanza: si algo revienta, sale el aviso de fallo (que abre
     * la app) en vez de un hueco. Lo apunta en el registro.
     */
    fun pinta(ctx: Context, id: Int, mgr: AppWidgetManager? = AppWidgetManager.getInstance(ctx)) {
        if (mgr == null || id == AppWidgetManager.INVALID_APPWIDGET_ID) return
        val s = Servicios.de(ctx)
        val opciones = runCatching { mgr.getAppWidgetOptions(id) }.getOrNull()
        val p = try {
            vista(ctx, id, Configs.lee(ctx, id), estado(ctx, id, Configs.lee(ctx, id)), opciones)
        } catch (e: Throwable) {
            s.registro.anota("widget", "$tipo#$id: error al pintar", e)
            Pintado(fallo(ctx, "No se pudo pintar. Toca para abrir Notiono."), "fallo")
        }
        try {
            mgr.updateAppWidget(id, p.rv)
            Widgets.alPintar?.invoke(id, p.rv)
        } catch (e: Throwable) {
            s.registro.anota("widget", "$tipo#$id: el sistema no aceptó el widget", e)
            runCatching { mgr.updateAppWidget(id, fallo(ctx, "No se pudo pintar. Toca para abrir Notiono.")) }
        }
        val tam = opciones?.let { "${it.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)}x${it.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)}dp" } ?: "?"
        s.registro.anota("widget", "pinta · $tipo#$id · ${p.que} · ${p.elementos} elem · $tam · ${kb(p.rv)} kB")
    }

    private fun kb(rv: RemoteViews): String = runCatching {
        val parcel = Parcel.obtain()
        try {
            rv.writeToParcel(parcel, 0)
            "%.1f".format(java.util.Locale.ROOT, parcel.dataSize() / 1024.0)
        } finally {
            parcel.recycle()
        }
    }.getOrDefault("?")

    /**
     * Pide los datos al servidor y pinta otra vez. Espera a que haya red (unos segundos) y
     * reintenta si la petición no llega; solo apunta fallo si el último intento falla.
     */
    suspend fun refresca(ctx: Context, id: Int, motivo: String) {
        cerrojo(id).withLock {
            val s = Servicios.de(ctx)
            val c = Configs.lee(ctx, id)
            val q = consultas(c)
            if (q.isEmpty() || s.sesion.token == null) return pinta(ctx, id)
            val ws = c.espacio ?: averiguaEspacio(ctx, id, c)
            val t0 = SystemClock.elapsedRealtime()
            val antes = Instantaneas.lee(ctx, id)?.takeIf { it.clave == clave(c) }
            var intentos = 0
            val conRed = Widgets.esperaRed(ctx)
            try {
                var r: List<JsonElement>? = null
                while (r == null) {
                    intentos++
                    try {
                        r = q.map { s.repo.fresca(it.ruta, it.input, cachear = false, espacio = ws) }
                    } catch (e: ErrorApi) {
                        if (!e.sinConexion || intentos >= 3) throw e
                        delay(if (intentos == 1) 1_500 else 4_000)
                        Widgets.esperaRed(ctx, 2_000)
                    }
                }
                val datos = withContext(Dispatchers.Default) { resume(c, r) }
                q.zip(r).forEach { (cq, rr) -> s.cache.guarda(s.repo.clave(cq.ruta, cq.input, ws), rr) }
                Instantaneas.guarda(ctx, id, Instantanea(clave(c), datos, System.currentTimeMillis(), null))
                s.registro.anota("widget", "$tipo#$id · $motivo · ok · ${SystemClock.elapsedRealtime() - t0} ms" + (if (intentos > 1) " · $intentos intentos" else "") + (if (!conRed) " · sin red al empezar" else ""))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                val fallo = when {
                    e is ErrorApi && e.sinConexion -> "Sin conexión"
                    e is ErrorApi && e.tipo == ErrorApi.Tipo.NoAutorizado -> Widgets.INICIA_SESION
                    else -> "No se pudo actualizar"
                }
                Instantaneas.guarda(ctx, id, (antes ?: Instantanea(clave(c))).copy(fallo = fallo))
                s.registro.anota("widget", "$tipo#$id · $motivo · fallo · ${SystemClock.elapsedRealtime() - t0} ms · $intentos intentos" + (if (!conRed) " · sin red" else ""), e)
                if (e is ErrorApi && e.sinConexion) Widgets.reintentaConRed(ctx)
            }
            pinta(ctx, id)
        }
    }

    companion object {
        private val cerrojos = ConcurrentHashMap<Int, Mutex>()
        private fun cerrojo(id: Int) = cerrojos.getOrPut(id) { Mutex() }

        /** El aviso a pantalla completa (sin sesión, sin configurar, fallo): nunca un hueco. */
        fun fallo(ctx: Context, texto: String, abrir: PendingIntent? = null): RemoteViews =
            RemoteViews(ctx.packageName, R.layout.widget_cargando).apply {
                setTextViewText(R.id.widget_cargando_texto, texto)
                setOnClickPendingIntent(R.id.widget_cargando_raiz, abrir ?: Widgets.piAbre(ctx, "notiono://inicio"))
            }
    }
}

class WidgetsWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result {
        Widgets.actualizaTodo(applicationContext, if ("red" in tags) "red" else "periodico")
        val s = Servicios.de(applicationContext)
        s.registro.envia(s.api, s.sesion.token != null)
        return Result.success()
    }
}

/**
 * El toque en una fila de lista de un widget (las listas solo admiten una plantilla de
 * toque): abre la app en lo que diga la fila, o marca su casilla y se cierra sin verse.
 */
class AccionWidgetActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri = intent?.data
        try {
            when (uri?.scheme) {
                "notiono" -> startActivity(Widgets.abre(this, uri.toString()))
                "notiono-widget" -> {
                    val id = uri.getQueryParameter("widget")?.toIntOrNull() ?: AppWidgetManager.INVALID_APPWIDGET_ID
                    val clase = Widgets.proveedorDe(this, id)?.javaClass
                    if (clase != null) sendBroadcast(
                        Intent(this, clase).setAction(if (uri.host == "casilla") Widgets.ACCION_CASILLA else Widgets.ACCION_FILA)
                            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                            .putExtra(Widgets.EXTRA_VALOR, uri.toString()),
                    )
                }
            }
        } catch (e: Exception) {
            Servicios.de(this).registro.anota("widget", "toque en una lista: fallo", e)
        }
        finish()
    }
}
