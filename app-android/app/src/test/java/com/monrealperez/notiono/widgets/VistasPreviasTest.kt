package com.monrealperez.notiono.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.R
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
 * RemoteViews reales (`muestra()`, con el contenido de [Muestras]) en claro y en oscuro.
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

    private class Previa(val nombre: String, val ancho: Int, val alto: Int, val layout: Int, val proveedor: ProveedorWidget)

    private fun saca(carpeta: String, modo: String) {
        val previas = listOf(
            Previa("nota", 250, 250, R.layout.widget_previa_nota, NotaReceiver()),
            Previa("lista", 320, 250, R.layout.widget_previa_lista, ListaReceiver()),
            Previa("rapida", 170, 60, R.layout.widget_previa_rapida, RapidaReceiver()),
            Previa("acciones", 320, 80, R.layout.widget_previa_acciones, AccionesReceiver()),
            Previa("recientes", 320, 250, R.layout.widget_previa_recientes, RecientesReceiver()),
            Previa("calendario", 320, 400, R.layout.widget_previa_calendario, CalendarioReceiver()),
        )
        val enRes = System.getProperty("notiono.vistasPrevias") == "1"
        for (p in previas) {
            val png = pinta(ctx, Arnes.vista(ctx, p.proveedor.muestra(ctx), p.ancho, p.alto).parent as View, p.ancho, p.alto)
            guarda(png, File("build/vistas-previas/$modo/widget_previa_${p.nombre}.png"))
            // Las esquinas quedan transparentes y el centro, pintado.
            assertTrue(p.nombre, png.getPixel(0, 0) ushr 24 == 0 && png.getPixel(png.width / 2, png.height / 2) ushr 24 == 0xFF)
            if (enRes) guarda(png, File("src/main/res/$carpeta/widget_previa_${p.nombre}.png"))
            val estatico = LayoutInflater.from(ctx).inflate(p.layout, FrameLayout(ctx), false)
            guarda(pinta(ctx, estatico, p.ancho, p.alto), File("build/vistas-previas/$modo/layout_${p.nombre}.png"))
        }
    }

    companion object {
        /** Dentro de una ventana de verdad (sin ella no se pintan fondos) y solo la vista, sin la ventana: esquinas transparentes. */
        fun pinta(ctx: Context, v: View, ancho: Int, alto: Int): Bitmap {
            val d = ctx.resources.displayMetrics.density
            val w = (ancho * d).roundToInt()
            val h = (alto * d).roundToInt()
            (v.parent as? android.view.ViewGroup)?.removeView(v)
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

        fun guarda(bmp: Bitmap, f: File) {
            f.parentFile!!.mkdirs()
            f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }
}
