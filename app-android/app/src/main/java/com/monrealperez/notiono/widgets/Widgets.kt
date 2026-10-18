package com.monrealperez.notiono.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.CheckBox
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.material3.ColorProviders
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.ColorFilter
import androidx.glance.LocalSize
import androidx.glance.layout.fillMaxHeight
import androidx.glance.text.FontWeight
import androidx.glance.text.TextDecoration
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.MainActivity
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.editor.Inline
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.tema.ColoresClaros
import com.monrealperez.notiono.ui.tema.ColoresOscuros
import com.monrealperez.notiono.ui.comun.emojiDe
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Fechas
import java.time.Instant
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.concurrent.TimeUnit

/**
 * Los widgets de la pantalla de inicio (Glance): Nota, Lista de una base de datos,
 * Nota rápida, Acciones rápidas y Páginas recientes. Se refrescan solos cada ~30 min,
 * al momento cuando la app cambia algo que enseñan y con su botón de refrescar.
 */
object Widgets {
    val CLAVE_PAGINA = stringPreferencesKey("pagina")
    val CLAVE_VISTA = stringPreferencesKey("vista")
    val CLAVE_TITULO = stringPreferencesKey("titulo")

    fun programa(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<WidgetsWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("widgets", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    suspend fun actualizaTodo(ctx: Context) {
        runCatching { NotaWidget().updateAll(ctx) }
        runCatching { ListaWidget().updateAll(ctx) }
        runCatching { RapidaWidget().updateAll(ctx) }
        runCatching { AccionesWidget().updateAll(ctx) }
        runCatching { RecientesWidget().updateAll(ctx) }
    }

    /**
     * Android 15+: el selector de widgets pinta la vista previa con los propios widgets
     * (`providePreview`). El sistema limita las llamadas: una vez por versión de la app.
     */
    suspend fun publicaVistasPrevias(ctx: Context) {
        if (android.os.Build.VERSION.SDK_INT < 35) return
        val prefs = ctx.getSharedPreferences("widgets", Context.MODE_PRIVATE)
        if (prefs.getInt("vistasPrevias", 0) == BuildConfig.VERSION_CODE) return
        val m = GlanceAppWidgetManager(ctx)
        val ok = listOf(NotaReceiver::class, ListaReceiver::class, RapidaReceiver::class, AccionesReceiver::class, RecientesReceiver::class)
            .all { runCatching { m.setWidgetPreviews(it) }.getOrNull() == GlanceAppWidgetManager.SET_WIDGET_PREVIEWS_RESULT_SUCCESS }
        if (ok) prefs.edit().putInt("vistasPrevias", BuildConfig.VERSION_CODE).apply()
    }

    fun abre(ctx: Context, uri: String): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(uri), ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    fun configura(ctx: Context, id: GlanceId): Intent {
        val appWidgetId = GlanceAppWidgetManager(ctx).getAppWidgetId(id)
        return Intent(ctx, ConfigWidgetActivity::class.java)
            .putExtra(android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}

class WidgetsWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result {
        Widgets.actualizaTodo(applicationContext)
        return Result.success()
    }
}

/** Los colores de la app en el widget, claro y oscuro según el sistema. */
val coloresWidget = ColorProviders(
    light = lightColorScheme(
        primary = Marca, background = ColoresClaros.fondo, surface = ColoresClaros.fondo, onSurface = ColoresClaros.texto,
        onBackground = ColoresClaros.texto, onSurfaceVariant = ColoresClaros.apagado, surfaceVariant = ColoresClaros.superficie, outline = ColoresClaros.borde,
    ),
    dark = darkColorScheme(
        primary = Marca, background = ColoresOscuros.fondo, surface = ColoresOscuros.fondo, onSurface = ColoresOscuros.texto,
        onBackground = ColoresOscuros.texto, onSurfaceVariant = ColoresOscuros.apagado, surfaceVariant = ColoresOscuros.superficie, outline = ColoresOscuros.borde,
    ),
)

/** El «+» naranja de las cabeceras (fila nueva, página nueva). */
@Composable
fun BotonMas(abrir: Intent, descripcion: String) {
    Box(GlanceModifier.size(28.dp).cornerRadius(14.dp).background(GlanceTheme.colors.primary).clickable(actionStartActivity(abrir)),
        contentAlignment = Alignment.Center) {
        Image(ImageProvider(R.drawable.widget_mas), descripcion, modifier = GlanceModifier.size(18.dp))
    }
    Spacer(GlanceModifier.width(4.dp))
}

/** Cabecera común: título (abre la app) y refrescar. */
@Composable
fun CabeceraWidget(titulo: String, abrir: Intent, extra: (@Composable () -> Unit)? = null) {
    Row(GlanceModifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            titulo, maxLines = 1,
            style = TextStyle(fontWeight = FontWeight.Bold, fontSize = 15.sp, color = GlanceTheme.colors.onSurface),
            modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(abrir)),
        )
        extra?.invoke()
        Image(ImageProvider(R.drawable.widget_refrescar), "Refrescar", modifier = GlanceModifier.size(28.dp).padding(5.dp).clickable(actionRunCallback<Refrescar>()))
    }
}

class Refrescar : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        Widgets.actualizaTodo(context)
    }
}

// ---------------- Nota ----------------

/** Widget «Nota»: una página (texto, títulos, listas) y sus casillas, marcables desde aquí. */
class NotaWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)
        val pagina = prefs[Widgets.CLAVE_PAGINA]
        val s = Servicios.de(context)
        var titulo = prefs[Widgets.CLAVE_TITULO] ?: "Nota"
        var bloques: List<JsonObject> = emptyList()
        var error: String? = null
        if (pagina != null) {
            try {
                titulo = s.repo.consulta("app.pagina", objeto("id" to pagina)).comoObjeto.str("title")?.ifBlank { null } ?: titulo
                bloques = (s.repo.consulta("app.bloques", objeto("id" to pagina)).comoObjeto["bloques"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
            } catch (e: ErrorApi) {
                error = if (e.sinConexion) "Sin conexión" else e.message
            }
        }
        provideContent { ContenidoNota(context, pagina, titulo, bloques, error) { Widgets.configura(context, id) } }
    }

    override suspend fun providePreview(context: Context, widgetCategory: Int) =
        provideContent { ContenidoNota(context, "muestra", Muestras.TITULO_NOTA, Muestras.nota, null) { Intent() } }
}

/** Lo que pinta el widget «Nota» (aparte, para poder fotografiarlo en las pruebas). */
@Composable
fun ContenidoNota(context: Context, pagina: String?, titulo: String, bloques: List<JsonObject>, error: String?, configurar: () -> Intent) {
    GlanceTheme(colors = coloresWidget) {
        Column(GlanceModifier.fillMaxSize().background(GlanceTheme.colors.background).cornerRadius(16.dp).padding(12.dp)) {
            if (pagina == null) {
                Text("Toca para elegir una página", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant),
                    modifier = GlanceModifier.fillMaxSize().clickable(actionStartActivity(configurar())))
                return@Column
            }
            val abrir = Widgets.abre(context, "notiono://pagina/$pagina")
            CabeceraWidget(titulo, abrir)
            if (error != null && bloques.isEmpty()) Text(error, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp))
            LazyColumn(GlanceModifier.fillMaxSize()) {
                items(planos(bloques).take(60), itemId = { it.first.str("id").hashCode().toLong() }) { (b, nivel, numero) -> FilaNota(pagina, b, nivel, numero, abrir) }
            }
        }
    }
}

/** Bloques con su sangría y, en las listas numeradas, su número; en el orden en que se leen. */
private fun planos(bs: List<JsonObject>, nivel: Int = 0): List<Triple<JsonObject, Int, Int>> {
    var n = 0
    return bs.flatMap { b ->
        n = if (b.str("type") != "numberedListItem") 0
        else if (n > 0) n + 1
        else ((b["props"] as? JsonObject)?.get("start") as? JsonPrimitive)?.content?.toIntOrNull() ?: 1
        listOf(Triple(b, nivel, n)) + planos((b["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList(), nivel + 1)
    }
}

@Composable
private fun FilaNota(pagina: String, b: JsonObject, nivel: Int, numero: Int, abrir: Intent) {
    val texto = Inline.textoPlano(b["content"])
    val props = b["props"] as? JsonObject
    val sangria = GlanceModifier.padding(start = (nivel * 12).dp, top = 1.dp, bottom = 1.dp)
    val estilo = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp)
    when (b.str("type")) {
        "heading" -> Text(texto, style = TextStyle(color = GlanceTheme.colors.onSurface, fontWeight = FontWeight.Bold,
            fontSize = when ((props?.get("level") as? JsonPrimitive)?.content) { "1" -> 17.sp; "2" -> 15.sp; else -> 14.sp }), modifier = sangria.clickable(actionStartActivity(abrir)))
        "checkListItem" -> CheckBox(
            checked = (props?.get("checked") as? JsonPrimitive)?.content == "true",
            onCheckedChange = actionRunCallback<MarcaCasilla>(actionParametersOf(MarcaCasilla.PAGINA to pagina, MarcaCasilla.BLOQUE to (b.str("id") ?: ""))),
            text = texto, style = estilo, modifier = sangria,
        )
        "bulletListItem" -> Text("•  $texto", style = estilo, modifier = sangria.clickable(actionStartActivity(abrir)))
        "numberedListItem" -> Text("$numero.  $texto", style = estilo, modifier = sangria.clickable(actionStartActivity(abrir)))
        "toggleListItem" -> Text("▸  $texto", style = estilo, modifier = sangria.clickable(actionStartActivity(abrir)))
        "quote", "callout" -> Text(texto, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp), modifier = sangria.clickable(actionStartActivity(abrir)))
        "divider" -> Box(GlanceModifier.fillMaxWidth().height(1.dp).background(GlanceTheme.colors.outline)) {}
        "paragraph", "codeBlock" -> if (texto.isNotBlank()) Text(texto, style = estilo, modifier = sangria.clickable(actionStartActivity(abrir))) else Spacer(GlanceModifier.height(4.dp))
        else -> {}
    }
}

/** Marcar una casilla de la nota desde el widget: una operación de bloque, como la app. */
class MarcaCasilla : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val pagina = parameters[PAGINA] ?: return
        val id = parameters[BLOQUE] ?: return
        val s = Servicios.de(context)
        runCatching {
            val bloques = (s.repo.consulta("app.bloques", objeto("id" to pagina), cachear = false).comoObjeto["bloques"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: return
            fun busca(bs: List<JsonObject>): JsonObject? = bs.firstNotNullOfOrNull { b -> if (b.str("id") == id) b else busca((b["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()) }
            val b = busca(bloques) ?: return
            val props = b["props"] as? JsonObject ?: JsonObject(emptyMap())
            val hecho = (props["checked"] as? JsonPrimitive)?.content == "true"
            val nuevo = JsonObject(b - "children" + ("props" to JsonObject(props + ("checked" to JsonPrimitive(!hecho)))))
            s.repo.mutacion("app.aplicar", objeto("id" to pagina, "ops" to listOf(objeto("op" to "upsert", "block" to nuevo))), pagina = pagina, etiquetas = listOf("bloques:$pagina"))
        }
        NotaWidget().update(context, glanceId)
    }

    companion object {
        val PAGINA = ActionParameters.Key<String>("pagina")
        val BLOQUE = ActionParameters.Key<String>("bloque")
    }
}

class NotaReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NotaWidget()
}

// ---------------- Lista de una BD ----------------

/** Widget «Lista»: las filas de una vista (p. ej. Tareas pendientes), con casilla y «+». */
class ListaWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)
        val pagina = prefs[Widgets.CLAVE_PAGINA]
        val vista = prefs[Widgets.CLAVE_VISTA]
        val s = Servicios.de(context)
        var datos: JsonObject? = null
        var error: String? = null
        if (pagina != null) {
            try {
                datos = s.repo.consulta("app.vista", JsonObject(objeto("pageId" to pagina) + (vista?.let { mapOf("viewId" to JsonPrimitive(it)) } ?: emptyMap()))).comoObjeto
            } catch (e: ErrorApi) {
                error = if (e.sinConexion) "Sin conexión" else e.message
            }
        }
        val campos = (datos?.get("fields") as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
        val filas = (datos?.get("filas") as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
        val nombre = prefs[Widgets.CLAVE_TITULO] ?: (datos?.get("collection") as? JsonObject)?.str("name") ?: "Base de datos"
        provideContent { ContenidoLista(context, pagina, nombre, campos, filas, error) { Widgets.configura(context, id) } }
    }

    override suspend fun providePreview(context: Context, widgetCategory: Int) =
        provideContent { ContenidoLista(context, "muestra", Muestras.TITULO_LISTA, Muestras.campos, Muestras.filas, null) { Intent() } }
}

/** Lo que pinta el widget «Lista». */
@Composable
fun ContenidoLista(context: Context, pagina: String?, nombre: String, campos: List<JsonObject>, filas: List<JsonObject>, error: String?, configurar: () -> Intent) {
    val titulo = campos.firstOrNull { it.str("type") == "text" } ?: campos.firstOrNull()
    val casilla = campos.firstOrNull { it.str("type") == "checkbox" }
    val clave = campos.firstOrNull { it.str("type") == "date" } ?: campos.firstOrNull { it.str("type") == "status" } ?: campos.firstOrNull { it.str("type") == "select" }
    GlanceTheme(colors = coloresWidget) {
        Column(GlanceModifier.fillMaxSize().background(GlanceTheme.colors.background).cornerRadius(16.dp).padding(12.dp)) {
            if (pagina == null) {
                Text("Toca para elegir una base de datos", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant),
                    modifier = GlanceModifier.fillMaxSize().clickable(actionStartActivity(configurar())))
                return@Column
            }
            CabeceraWidget(nombre, Widgets.abre(context, "notiono://pagina/$pagina")) {
                BotonMas(Widgets.abre(context, "notiono://nuevafila/$pagina"), "Nueva fila")
            }
            if (error != null && filas.isEmpty()) Text(error, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp))
            if (filas.isEmpty() && error == null) Text("Nada por aquí.", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp))
            LazyColumn(GlanceModifier.fillMaxSize()) {
                items(filas.take(50), itemId = { it.str("id").hashCode().toLong() }) { f ->
                    val celdas = f["cells"] as? JsonObject ?: JsonObject(emptyMap())
                    val textos = f["textos"] as? JsonObject ?: JsonObject(emptyMap())
                    val tit = titulo?.let { (celdas[it.str("id")] as? JsonPrimitive)?.content }?.ifBlank { null } ?: "Sin título"
                    val abrirFila = actionStartActivity(Widgets.abre(context, "notiono://fila/$pagina/${f.str("id")}"))
                    val hecha = casilla != null && (celdas[casilla.str("id")] as? JsonPrimitive)?.content == "true"
                    Row(GlanceModifier.fillMaxWidth().padding(top = if (casilla != null) 0.dp else 6.dp, bottom = if (casilla != null) 0.dp else 6.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        // La casilla es un círculo grande: se completa tocándolo (como en las apps de tareas).
                        if (casilla != null) Box(
                            GlanceModifier.size(36.dp).clickable(actionRunCallback<MarcaFila>(actionParametersOf(
                                MarcaFila.PAGINA to pagina, MarcaFila.FILA to (f.str("id") ?: ""), MarcaFila.CAMPO to (casilla.str("id") ?: ""),
                                MarcaFila.VALOR to (!hecha).toString(),
                            ))),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(
                                ImageProvider(if (hecha) R.drawable.widget_hecho else R.drawable.widget_circulo), if (hecha) "Hecha: desmarcar" else "Marcar como hecha",
                                colorFilter = if (hecha) null else ColorFilter.tint(GlanceTheme.colors.onSurfaceVariant), modifier = GlanceModifier.size(22.dp),
                            )
                        }
                        Text(tit, maxLines = 1, modifier = GlanceModifier.defaultWeight().clickable(abrirFila), style = TextStyle(
                            color = if (hecha) GlanceTheme.colors.onSurfaceVariant else GlanceTheme.colors.onSurface, fontSize = 13.sp,
                            textDecoration = if (hecha) TextDecoration.LineThrough else TextDecoration.None,
                        ))
                        val detalle = clave?.let { (textos[it.str("id")] as? JsonPrimitive)?.content }.orEmpty()
                        if (detalle.isNotBlank()) Text(detalle, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp), modifier = GlanceModifier.clickable(abrirFila))
                    }
                }
            }
        }
    }
}

class MarcaFila : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val s = Servicios.de(context)
        runCatching {
            s.repo.mutacion("db.updateCell", objeto(
                "recordId" to parameters[FILA], "fieldId" to parameters[CAMPO], "value" to (parameters[VALOR] == "true"),
            ), pagina = parameters[PAGINA], etiquetas = listOf("vista:${parameters[PAGINA]}"))
        }
        ListaWidget().update(context, glanceId)
    }

    companion object {
        val PAGINA = ActionParameters.Key<String>("pagina")
        val FILA = ActionParameters.Key<String>("fila")
        val CAMPO = ActionParameters.Key<String>("campo")
        val VALOR = ActionParameters.Key<String>("valor")
    }
}

class ListaReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ListaWidget()
}

// ---------------- Nota rápida ----------------

/** Widget «Nota rápida»: un botón que abre una nota nueva (o el final de la página elegida). */
class RapidaWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)
        val destino = prefs[Widgets.CLAVE_PAGINA]
        val titulo = prefs[Widgets.CLAVE_TITULO]
        val uri = if (destino != null) "notiono://rapida?en=$destino" else "notiono://nueva"
        provideContent { ContenidoRapida(context, uri, titulo) }
    }

    override suspend fun providePreview(context: Context, widgetCategory: Int) =
        provideContent { ContenidoRapida(context, "notiono://nueva", null) }
}

/** Lo que pinta el widget «Nota rápida». */
@Composable
fun ContenidoRapida(context: Context, uri: String, titulo: String?) {
    GlanceTheme(colors = coloresWidget) {
        Row(
            GlanceModifier.fillMaxSize().background(GlanceTheme.colors.primary).cornerRadius(18.dp).padding(10.dp)
                .clickable(actionStartActivity(Widgets.abre(context, uri))),
            verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(ImageProvider(R.drawable.widget_nota), "Nota rápida", modifier = GlanceModifier.size(22.dp))
            Spacer(GlanceModifier.width(8.dp))
            Text(titulo?.let { "Añadir a $it" } ?: "Nota rápida", maxLines = 1,
                style = TextStyle(color = androidx.glance.unit.ColorProvider(Color.White), fontWeight = FontWeight.Medium, fontSize = 14.sp))
        }
    }
}

class RapidaReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RapidaWidget()
}

/** Guarda la configuración de un widget y lo pinta. */
suspend fun configuraWidget(ctx: Context, appWidgetId: Int, pagina: String?, vista: String?, titulo: String?) {
    val id = GlanceAppWidgetManager(ctx).getGlanceIdBy(appWidgetId)
    updateAppWidgetState(ctx, id) { p ->
        if (pagina != null) p[Widgets.CLAVE_PAGINA] = pagina else p.remove(Widgets.CLAVE_PAGINA)
        if (vista != null) p[Widgets.CLAVE_VISTA] = vista else p.remove(Widgets.CLAVE_VISTA)
        if (titulo != null) p[Widgets.CLAVE_TITULO] = titulo else p.remove(Widgets.CLAVE_TITULO)
    }
    Widgets.actualizaTodo(ctx)
}

// ---------------- Acciones rápidas ----------------

/** Widget «Acciones rápidas»: barra de botones (página nueva, tarea nueva, foto, buscar). */
class AccionesWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // La BD de «Nueva tarea» (si no se eligió ninguna, no sale ese botón).
        val bd = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)[Widgets.CLAVE_PAGINA]
        provideContent { ContenidoAcciones(context, bd) }
    }

    override suspend fun providePreview(context: Context, widgetCategory: Int) =
        provideContent { ContenidoAcciones(context, "muestra") }
}

/** Lo que pinta el widget «Acciones rápidas». */
@Composable
fun ContenidoAcciones(context: Context, bdTareas: String?) {
    val botones = listOfNotNull(
        Triple("Página", R.drawable.widget_nueva, "notiono://nueva"),
        bdTareas?.let { Triple("Tarea", R.drawable.widget_tarea, "notiono://nuevafila/$it") },
        Triple("Foto", R.drawable.widget_foto, "notiono://foto"),
        Triple("Buscar", R.drawable.widget_buscar, "notiono://buscar"),
    )
    // Los nombres solo caben si el widget tiene algo de alto.
    val conNombre = LocalSize.current.height >= 64.dp
    GlanceTheme(colors = coloresWidget) {
        Row(GlanceModifier.fillMaxSize().background(GlanceTheme.colors.background).cornerRadius(18.dp).padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
            botones.forEachIndexed { i, (nombre, icono, uri) ->
                if (i > 0) Spacer(GlanceModifier.width(6.dp))
                Column(
                    GlanceModifier.defaultWeight().fillMaxHeight().background(GlanceTheme.colors.surfaceVariant).cornerRadius(12.dp)
                        .clickable(actionStartActivity(Widgets.abre(context, uri))),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Image(ImageProvider(icono), if (nombre == "Página" || nombre == "Tarea") "Nueva ${nombre.lowercase()}" else nombre, colorFilter = ColorFilter.tint(GlanceTheme.colors.primary), modifier = GlanceModifier.size(22.dp))
                    if (conNombre) Text(nombre, maxLines = 1, modifier = GlanceModifier.padding(top = 4.dp, start = 2.dp, end = 2.dp),
                        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp))
                }
            }
        }
    }
}

class AccionesReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AccionesWidget()
}

// ---------------- Páginas recientes ----------------

/** Una fila del widget «Páginas recientes». `detalle`: «hace 5 min» (vacío en las favoritas). */
data class PaginaWidget(val id: String, val titulo: String, val icono: String?, val detalle: String, val favorita: Boolean = false)

/** Widget «Páginas recientes»: las favoritas arriba y luego las últimas abiertas en el móvil. */
class RecientesWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val s = Servicios.de(context)
        val favoritas = if (s.sesion.token == null) emptyList() else runCatching {
            s.repo.consulta("favorites.list").comoLista.map { it.comoObjeto }
                .map { PaginaWidget(it.str("id").orEmpty(), it.str("title").orEmpty(), it.str("icon"), "", favorita = true) }
        }.getOrDefault(emptyList())
        val ids = favoritas.map { it.id }.toSet()
        val vistas = s.recientes.lista(s.espacioActivo()).filter { it.pageId !in ids }
            .map { PaginaWidget(it.pageId, it.title, it.icon, Fechas.haceCuanto(Instant.ofEpochMilli(it.visto).toString())) }
        provideContent { ContenidoRecientes(context, (favoritas + vistas).take(30)) }
    }

    override suspend fun providePreview(context: Context, widgetCategory: Int) =
        provideContent { ContenidoRecientes(context, Muestras.recientes) }
}

/** Lo que pinta el widget «Páginas recientes». */
@Composable
fun ContenidoRecientes(context: Context, paginas: List<PaginaWidget>) {
    GlanceTheme(colors = coloresWidget) {
        Column(GlanceModifier.fillMaxSize().background(GlanceTheme.colors.background).cornerRadius(16.dp).padding(12.dp)) {
            CabeceraWidget("Páginas recientes", Widgets.abre(context, "notiono://inicio")) {
                BotonMas(Widgets.abre(context, "notiono://nueva"), "Nueva página")
            }
            if (paginas.isEmpty()) Text("Las páginas que abras en la app saldrán aquí.", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp))
            LazyColumn(GlanceModifier.fillMaxSize()) {
                items(paginas, itemId = { it.id.hashCode().toLong() }) { p ->
                    Row(
                        GlanceModifier.fillMaxWidth().padding(top = 5.dp, bottom = 5.dp, end = 8.dp).clickable(actionStartActivity(Widgets.abre(context, "notiono://pagina/${p.id}"))),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val emoji = emojiDe(p.icono)
                        Box(GlanceModifier.size(22.dp), contentAlignment = Alignment.Center) {
                            if (emoji.isNotBlank()) Text(emoji, style = TextStyle(fontSize = 15.sp))
                            else Image(ImageProvider(R.drawable.widget_pagina), null, colorFilter = ColorFilter.tint(GlanceTheme.colors.onSurfaceVariant), modifier = GlanceModifier.size(18.dp))
                        }
                        Text(p.titulo.ifBlank { "Sin título" }, maxLines = 1, modifier = GlanceModifier.defaultWeight().padding(start = 8.dp, end = 6.dp),
                            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp))
                        if (p.favorita) Image(ImageProvider(R.drawable.widget_estrella), "Favorita", colorFilter = ColorFilter.tint(GlanceTheme.colors.primary), modifier = GlanceModifier.size(14.dp))
                        else Text(p.detalle, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp))
                    }
                }
            }
        }
    }
}

class RecientesReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RecientesWidget()
}
