package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetHostView
import android.content.Context
import android.view.View
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Los widgets pintados como los pinta el escritorio (el RemoteViews de Glance
 * aplicado dentro de un AppWidgetHostView), en claro y en oscuro, con datos de verdad:
 * la nota es el documento real del editor web y la lista, filas como las da `app.vista`
 * (las de [Muestras], las mismas de las vistas previas).
 * Salen en `app/build/capturas/<modo>/widgets.png`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h1100dp-xxhdpi")
class WidgetsTest {
    @get:Rule val compose = createComposeRule()
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()

    @Test fun claro() = pinta("claro")

    @Config(qualifiers = "+night")
    @Test fun oscuro() = pinta("oscuro")

    /** Lo que se ve cuando no hay datos frescos: nunca un hueco (ver «Widgets en blanco» en docs/app-nativa.md). */
    @Test fun estados() {
        val nota = json.parseToJsonElement(javaClass.getResource("/bloques-todos.json")!!.readText()).jsonArray.map { it.comoObjeto }.take(3)
        val inicial = android.view.LayoutInflater.from(ctx).inflate(com.monrealperez.notiono.R.layout.widget_cargando, null)
        val vistas = listOf(
            Triple(300, 200, widget(300, 200) { ContenidoNota(ctx, "p", "Lista de la compra", nota, "Sin actualizar · hace 2 h · Inicia sesión en la app") { error("") } }),
            Triple(300, 120, widget(300, 120) { ContenidoLista(ctx, "bd", Muestras.TITULO_LISTA, emptyList(), emptyList(), "Cargando…") { error("") } }),
            Triple(300, 120, widget(300, 120) { ContenidoLista(ctx, "bd", Muestras.TITULO_LISTA, emptyList(), emptyList(), "Sin conexión. Toca para reintentar.") { error("") } }),
            Triple(300, 120, widget(300, 120) { MensajeWidget("Inicia sesión en la app para ver esta nota.", android.content.Intent()) }),
            Triple(300, 120, inicial),
        )
        compose.setContent {
            Column(Modifier.fillMaxSize().background(Color(0xFF7A8B99)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                for ((w, h, v) in vistas) Box(Modifier.size(w.dp, h.dp)) { AndroidView({ v }, Modifier.fillMaxSize()) }
            }
        }
        compose.onRoot().captureRoboImage("build/capturas/estados-widgets.png")
    }

    /** El widget tal cual: `setRemoteAdapter` (las listas) solo se aplica dentro de un AppWidgetHostView. */
    @OptIn(ExperimentalGlanceRemoteViewsApi::class)
    private fun widget(ancho: Int, alto: Int, contenido: @Composable () -> Unit): View = runBlocking {
        val anfitrion = AppWidgetHostView(ctx)
        anfitrion.addView(GlanceRemoteViews().compose(ctx, DpSize(ancho.dp, alto.dp)) { contenido() }.remoteViews.apply(ctx, anfitrion))
        anfitrion
    }

    private fun pinta(modo: String) {
        val nota = json.parseToJsonElement(javaClass.getResource("/bloques-todos.json")!!.readText()).jsonArray.map { it.comoObjeto }
        val vistas = listOf(
            Triple(300, 300, widget(300, 300) { ContenidoNota(ctx, "p", "Lista de la compra", nota, null) { error("") } }),
            Triple(300, 240, widget(300, 240) { ContenidoLista(ctx, "bd", Muestras.TITULO_LISTA, Muestras.campos, Muestras.filas, null) { error("") } }),
            Triple(180, 56, widget(180, 56) { ContenidoRapida(ctx, "notiono://nueva", null) }),
            Triple(340, 76, widget(340, 76) { ContenidoAcciones(ctx, "bd") }),
            Triple(300, 240, widget(300, 240) { ContenidoRecientes(ctx, Muestras.recientes) }),
        )
        // El ListView de cada widget tiene sus filas (sin esto, la foto saldría con la lista vacía).
        assertTrue(listOf(0, 1, 4).all { i -> listas(vistas[i].third).let { it.isNotEmpty() && it.all { n -> n > 0 } } })
        compose.setContent {
            // Un «fondo de pantalla» neutro para ver los bordes del widget en los dos modos.
            Column(Modifier.fillMaxSize().background(Color(0xFF7A8B99)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Todo el tamaño para el widget, como se lo da el launcher (si no, las filas se encogen a su contenido).
                for ((w, h, v) in vistas) Box(Modifier.size(w.dp, h.dp)) { AndroidView({ v }, Modifier.fillMaxSize()) }
            }
        }
        compose.onRoot().captureRoboImage("build/capturas/$modo/widgets.png")
    }

    private fun listas(v: View): List<Int> = when (v) {
        is android.widget.AdapterView<*> -> listOf(v.adapter?.count ?: 0)
        is android.view.ViewGroup -> (0 until v.childCount).flatMap { listas(v.getChildAt(it)) }
        else -> emptyList()
    }
}
