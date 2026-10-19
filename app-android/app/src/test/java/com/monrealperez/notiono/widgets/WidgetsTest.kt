package com.monrealperez.notiono.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.R
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate
import java.time.YearMonth

/**
 * Los widgets pintados como los pinta el escritorio (sus RemoteViews dentro de un
 * AppWidgetHostView), en claro y en oscuro: con datos de verdad (la nota es el documento real
 * del editor web) y en los estados sin datos frescos, que nunca pueden ser un hueco.
 * Salen en `app/build/capturas/<modo>/widgets.png`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h1100dp-xhdpi")
class WidgetsTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()

    @Test fun claro() = pinta("claro")

    @Config(qualifiers = "+night")
    @Test fun oscuro() = pinta("oscuro")

    private fun pinta(modo: String) {
        val bloques = json.parseToJsonElement(javaClass.getResource("/bloques-todos.json")!!.readText()).jsonArray.map { it.comoObjeto }
        val hoy = Muestras.HOY_CALENDARIO
        val vistas = listOf(
            Triple(300, 300, NotaReceiver.nota(ctx, 1, "p", "Lista de la compra", NotaReceiver.planos(bloques), null)),
            Triple(300, 200, NotaReceiver.nota(ctx, 2, "p", "Lista de la compra", NotaReceiver.planos(bloques).take(3), "Sin actualizar · hace 2 h · Inicia sesión en la app")),
            Triple(320, 240, ListaReceiver().muestra(ctx)),
            Triple(320, 110, ListaReceiver.lista(ctx, 3, "bd", Muestras.TITULO_LISTA, null, emptyList(), "Cargando…")),
            Triple(320, 110, ListaReceiver.lista(ctx, 4, "bd", Muestras.TITULO_LISTA, null, emptyList(), "Sin conexión. Toca para reintentar.")),
            Triple(320, 400, CalendarioReceiver.grande(ctx, 5, YearMonth.from(hoy), hoy.plusDays(2), hoy, Muestras.tareas, null, JsonObject(emptyMap()))),
            Triple(320, 200, CalendarioReceiver.pequeño(ctx, 6, "Tareas", hoy, Muestras.tareas, null, JsonObject(emptyMap()))),
            Triple(320, 240, RecientesReceiver().muestra(ctx)),
            Triple(180, 56, RapidaReceiver().muestra(ctx)),
            Triple(340, 76, AccionesReceiver().muestra(ctx)),
            Triple(320, 110, ProveedorWidget.fallo(ctx, "Inicia sesión en la app para ver esta nota.")),
        )
        val d = ctx.resources.displayMetrics.density
        val margen = (12 * d).toInt()
        val pngs = vistas.map { (w, h, rv) ->
            val v = Arnes.vista(ctx, rv, w, h)
            // Ninguno vacío: siempre hay texto que leer.
            assertTrue(Arnes.textos(v).isNotEmpty())
            VistasPreviasTest.pinta(ctx, v.parent as View, w, h)
        }
        val ancho = pngs.maxOf { it.width } + 2 * margen
        val alto = pngs.sumOf { it.height + margen } + margen
        val lienzo = Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888)
        val c = Canvas(lienzo)
        // Un «fondo de pantalla» neutro para ver los bordes del widget en los dos modos.
        c.drawColor(Color.rgb(0x7A, 0x8B, 0x99))
        var y = margen.toFloat()
        for (p in pngs) {
            c.drawBitmap(p, margen.toFloat(), y, null)
            y += p.height + margen
        }
        VistasPreviasTest.guarda(lienzo, File("build/capturas/$modo/widgets.png"))
        // Y el que pone el escritorio antes de que la app pinte nada (initialLayout).
        val inicial = android.view.LayoutInflater.from(ctx).inflate(R.layout.widget_cargando, null)
        assertTrue(Arnes.textos(inicial).contains("Cargando…"))
        assertTrue(LocalDate.now().year > 2000)
    }
}
