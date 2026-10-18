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
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.monrealperez.notiono.MainActivity
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.editor.Inline
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.tema.ColoresClaros
import com.monrealperez.notiono.ui.tema.ColoresOscuros
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.concurrent.TimeUnit

/**
 * Los widgets de la pantalla de inicio (Glance): Nota, Lista de una base de datos y
 * Nota rápida. Se refrescan solos cada ~30 min, al momento cuando la app cambia algo
 * que enseñan y con su botón de refrescar.
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
        provideContent {
            GlanceTheme(colors = coloresWidget) {
                Column(GlanceModifier.fillMaxSize().background(GlanceTheme.colors.background).cornerRadius(16.dp).padding(12.dp)) {
                    if (pagina == null) {
                        Text("Toca para elegir una página", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant),
                            modifier = GlanceModifier.fillMaxSize().clickable(actionStartActivity(Widgets.configura(context, id))))
                        return@Column
                    }
                    val abrir = Widgets.abre(context, "notiono://pagina/$pagina")
                    CabeceraWidget(titulo, abrir)
                    if (error != null && bloques.isEmpty()) Text(error!!, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp))
                    LazyColumn(GlanceModifier.fillMaxSize()) {
                        items(planos(bloques).take(60), itemId = { it.first.str("id").hashCode().toLong() }) { (b, nivel) -> FilaNota(context, pagina, b, nivel, abrir) }
                    }
                }
            }
        }
    }

    /** Bloques con su sangría, en el orden en que se leen. */
    private fun planos(bs: List<JsonObject>, nivel: Int = 0): List<Pair<JsonObject, Int>> = bs.flatMap { b ->
        listOf(b to nivel) + planos((b["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList(), nivel + 1)
    }

    @Composable
    private fun FilaNota(ctx: Context, pagina: String, b: JsonObject, nivel: Int, abrir: Intent) {
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
            "numberedListItem" -> Text("–  $texto", style = estilo, modifier = sangria.clickable(actionStartActivity(abrir)))
            "toggleListItem" -> Text("▸  $texto", style = estilo, modifier = sangria.clickable(actionStartActivity(abrir)))
            "quote", "callout" -> Text(texto, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp), modifier = sangria.clickable(actionStartActivity(abrir)))
            "divider" -> Box(GlanceModifier.fillMaxWidth().height(1.dp).background(GlanceTheme.colors.outline)) {}
            "paragraph", "codeBlock" -> if (texto.isNotBlank()) Text(texto, style = estilo, modifier = sangria.clickable(actionStartActivity(abrir))) else Spacer(GlanceModifier.height(4.dp))
            else -> {}
        }
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
        val titulo = campos.firstOrNull { it.str("type") == "text" } ?: campos.firstOrNull()
        val casilla = campos.firstOrNull { it.str("type") == "checkbox" }
        val clave = campos.firstOrNull { it.str("type") == "date" } ?: campos.firstOrNull { it.str("type") == "status" } ?: campos.firstOrNull { it.str("type") == "select" }
        val filas = (datos?.get("filas") as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
        val nombre = prefs[Widgets.CLAVE_TITULO] ?: (datos?.get("collection") as? JsonObject)?.str("name") ?: "Base de datos"
        provideContent {
            GlanceTheme(colors = coloresWidget) {
                Column(GlanceModifier.fillMaxSize().background(GlanceTheme.colors.background).cornerRadius(16.dp).padding(12.dp)) {
                    if (pagina == null) {
                        Text("Toca para elegir una base de datos", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant),
                            modifier = GlanceModifier.fillMaxSize().clickable(actionStartActivity(Widgets.configura(context, id))))
                        return@Column
                    }
                    CabeceraWidget(nombre, Widgets.abre(context, "notiono://pagina/$pagina")) {
                        Box(GlanceModifier.size(28.dp).cornerRadius(14.dp).background(GlanceTheme.colors.primary).clickable(actionStartActivity(Widgets.abre(context, "notiono://nuevafila/$pagina"))),
                            contentAlignment = Alignment.Center) {
                            Text("+", style = TextStyle(color = androidx.glance.unit.ColorProvider(Color.White), fontWeight = FontWeight.Bold, fontSize = 16.sp))
                        }
                        Spacer(GlanceModifier.width(4.dp))
                    }
                    if (error != null && filas.isEmpty()) Text(error!!, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp))
                    if (filas.isEmpty() && error == null) Text("Nada por aquí.", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp))
                    LazyColumn(GlanceModifier.fillMaxSize()) {
                        items(filas.take(50), itemId = { it.str("id").hashCode().toLong() }) { f ->
                            val celdas = f["cells"] as? JsonObject ?: JsonObject(emptyMap())
                            val textos = f["textos"] as? JsonObject ?: JsonObject(emptyMap())
                            val tit = titulo?.let { (celdas[it.str("id")] as? JsonPrimitive)?.content }?.ifBlank { null } ?: "Sin título"
                            val abrirFila = actionStartActivity(Widgets.abre(context, "notiono://fila/$pagina/${f.str("id")}"))
                            Row(GlanceModifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (casilla != null) CheckBox(
                                    checked = (celdas[casilla.str("id")] as? JsonPrimitive)?.content == "true",
                                    onCheckedChange = actionRunCallback<MarcaFila>(actionParametersOf(
                                        MarcaFila.PAGINA to pagina, MarcaFila.FILA to (f.str("id") ?: ""), MarcaFila.CAMPO to (casilla.str("id") ?: ""),
                                        MarcaFila.VALOR to ((celdas[casilla.str("id")] as? JsonPrimitive)?.content != "true").toString(),
                                    )),
                                )
                                Text(tit, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp), modifier = GlanceModifier.defaultWeight().clickable(abrirFila))
                                val detalle = clave?.let { (textos[it.str("id")] as? JsonPrimitive)?.content }.orEmpty()
                                if (detalle.isNotBlank()) Text(detalle, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp), modifier = GlanceModifier.clickable(abrirFila))
                            }
                        }
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
        provideContent {
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
