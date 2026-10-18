package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetHostView
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.LayoutInflater
import android.view.View
import android.os.Looper
import androidx.activity.ComponentActivity
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews
import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.R
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.roundToInt

/**
 * Las vistas previas del selector de widgets (`android:previewImage`), sacadas de los
 * composables reales con el contenido de [Muestras], en claro y en oscuro.
 *
 * Siempre se pintan en `app/build/vistas-previas/<modo>/` (junto con el layout estático
 * de `android:previewLayout`, para compararlos). Para regenerar los PNG del APK:
 * `./gradlew :app:testDebugUnitTest --tests '*VistasPreviasTest' -Pnotiono.vistasPrevias=1`
 * (escribe en `res/drawable-nodpi` y `res/drawable-night-nodpi`).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "xhdpi")
class VistasPreviasTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()

    @Test fun claro() = saca("drawable-nodpi", "claro")

    @Config(qualifiers = "+night")
    @Test fun oscuro() = saca("drawable-night-nodpi", "oscuro")

    private class Previa(val nombre: String, val ancho: Int, val alto: Int, val layout: Int, val contenido: @Composable () -> Unit)

    private fun saca(carpeta: String, modo: String) {
        val previas = listOf(
            Previa("nota", 250, 250, R.layout.widget_previa_nota) { ContenidoNota(ctx, "muestra", Muestras.TITULO_NOTA, Muestras.nota, null) { error("") } },
            Previa("lista", 320, 250, R.layout.widget_previa_lista) {
                ContenidoLista(ctx, "muestra", Muestras.TITULO_LISTA, Muestras.campos, Muestras.filas, null) { error("") }
            },
            Previa("rapida", 170, 60, R.layout.widget_previa_rapida) { ContenidoRapida(ctx, "notiono://nueva", null) },
            Previa("acciones", 320, 80, R.layout.widget_previa_acciones) { ContenidoAcciones(ctx, "muestra") },
            Previa("recientes", 320, 250, R.layout.widget_previa_recientes) { ContenidoRecientes(ctx, Muestras.recientes) },
        )
        val enRes = System.getProperty("notiono.vistasPrevias") == "1"
        for (p in previas) {
            val png = pinta(glance(p), p.ancho, p.alto)
            guarda(png, File("build/vistas-previas/$modo/widget_previa_${p.nombre}.png"))
            // Las esquinas quedan transparentes y el centro, pintado.
            assertTrue(p.nombre, png.getPixel(0, 0) ushr 24 == 0 && png.getPixel(png.width / 2, png.height / 2) ushr 24 == 0xFF)
            if (enRes) guarda(png, File("src/main/res/$carpeta/widget_previa_${p.nombre}.png"))
            val estatico = LayoutInflater.from(ctx).inflate(p.layout, FrameLayout(ctx), false)
            guarda(pinta(estatico, p.ancho, p.alto), File("build/vistas-previas/$modo/layout_${p.nombre}.png"))
        }
    }

    /** El widget como lo pinta el escritorio: el RemoteViews de Glance dentro de un AppWidgetHostView. */
    @OptIn(ExperimentalGlanceRemoteViewsApi::class)
    private fun glance(p: Previa): View = runBlocking {
        val anfitrion = AppWidgetHostView(ctx)
        val v = GlanceRemoteViews().compose(ctx, DpSize(p.ancho.dp, p.alto.dp)) { p.contenido() }.remoteViews.apply(ctx, anfitrion)
        anfitrion.addView(v, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        anfitrion
    }

    /** Dentro de una ventana de verdad (sin ella no se pintan fondos ni casillas) y solo la vista, sin la ventana: esquinas transparentes. */
    private fun pinta(v: View, ancho: Int, alto: Int): Bitmap {
        val d = ctx.resources.displayMetrics.density
        val w = (ancho * d).roundToInt()
        val h = (alto * d).roundToInt()
        val actividad = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
        actividad.setContentView(FrameLayout(actividad).apply { addView(v, FrameLayout.LayoutParams(w, h)) })
        shadowOf(Looper.getMainLooper()).idle()
        sinBarras(v)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        v.draw(Canvas(bmp))
        return bmp
    }

    /** Las barras de desplazamiento de las listas asoman al pintarlas recién puestas. */
    private fun sinBarras(v: View) {
        v.isVerticalScrollBarEnabled = false
        if (v is android.view.ViewGroup) for (i in 0 until v.childCount) sinBarras(v.getChildAt(i))
    }

    private fun guarda(bmp: Bitmap, f: File) {
        f.parentFile!!.mkdirs()
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
