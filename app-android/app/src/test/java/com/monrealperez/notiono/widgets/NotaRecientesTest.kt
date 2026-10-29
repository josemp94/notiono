package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Looper
import android.view.View
import android.widget.RemoteViews
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Reciente
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.respuestaTrpc
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File
import java.time.Duration

/**
 * Widget «Nota» en modo «Mis notas recientes»: ‹ › pasan por las últimas páginas abiertas en
 * el móvil, pintando al momento lo guardado (sin esperar a la red), con sus casillas.
 */
@RunWith(RobolectricTestRunner::class)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class NotaRecientesTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private val pintados = mutableMapOf<Int, RemoteViews>()
    /** El servidor tarda 8 s: lo que se pinta al pulsar no puede venir de él. */
    @Volatile private var lento = true

    private fun bloques(texto: String) = """{"huella":"h","bloques":[{"id":"c-$texto","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"$texto","styles":{}}],"children":[]}]}"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (lento) Thread.sleep(8_000)
                val id = Regex("\"id\":\"(\\w+)\"").find(java.net.URLDecoder.decode(request.url.toString(), "UTF-8"))?.groupValues?.get(1) ?: ""
                return when {
                    request.url.encodedPath.endsWith("app.pagina") -> respuestaTrpc("""{"id":"$id","title":"Página $id"}""")
                    request.url.encodedPath.endsWith("app.bloques") -> respuestaTrpc(bloques("tarea de $id"))
                    else -> respuestaTrpc("{}")
                }
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.sesion.espacio = "w1"
        // Abiertas en el móvil, de la última a la primera; p2 y p3 ya están en la caché (se abrieron).
        for ((i, p) in listOf("p3", "p2", "p1").withIndex()) s.recientes.anota("w1", Reciente(p, "Página $p", null, 1000L - i))
        for (p in listOf("p1", "p2")) {
            s.cache.guarda(s.repo.clave("app.pagina", objeto("id" to p), "w1"), json.parseToJsonElement("""{"id":"$p","title":"Página $p"}"""))
            s.cache.guarda(s.repo.clave("app.bloques", objeto("id" to p), "w1"), json.parseToJsonElement(bloques("tarea de $p")))
        }
        Widgets.alPintar = { id, rv -> synchronized(pintados) { pintados[id] = rv } }
    }

    @After
    fun cierra() {
        Widgets.alPintar = null
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.de(ctx).cache.vacia()
        File(ctx.filesDir, "widgets").deleteRecursively()
        Servicios.baseDePrueba = null
    }

    private fun pulsa(id: Int, accion: String): List<String> {
        val t0 = System.currentTimeMillis()
        NotaReceiver().onReceive(ctx, Intent(ctx, NotaReceiver::class.java).setAction(accion).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        assertTrue("la flecha no puede esperar a la red", System.currentTimeMillis() - t0 < 1_500)
        return Arnes.textos(ctx, synchronized(pintados) { pintados[id] }!!)
    }

    @Test
    fun lasFlechasPasanPorLasRecientesSinEsperarALaRed() {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1", titulo = "Página p1", espacio = "w1", recientes = true))
        NotaReceiver().onUpdate(ctx, AppWidgetManager.getInstance(ctx), intArrayOf(id))
        val v = Arnes.vista(ctx, synchronized(pintados) { pintados[id] }!!)
        assertEquals(View.VISIBLE, v.findViewById<View>(R.id.widget_anterior).visibility)
        assertEquals(View.VISIBLE, v.findViewById<View>(R.id.widget_siguiente).visibility)
        // ‹ › a la derecha del título, como las del mes del widget Calendario (2.5.1).
        val cabecera = v.findViewById<View>(R.id.widget_titulo).parent as android.view.ViewGroup
        val orden = listOf(R.id.widget_titulo, R.id.widget_anterior, R.id.widget_siguiente).map { cabecera.indexOfChild(v.findViewById(it)) }
        assertEquals(orden.sorted(), orden)
        assertTrue(Arnes.textos(v).toString(), Arnes.textos(v).containsAll(listOf("Página p1", "tarea de p1")))
        // ‹: la anterior en la lista (p1 es la primera: da la vuelta hasta p3, que no está guardada).
        assertTrue(pulsa(id, Widgets.ACCION_ANTERIOR).contains("Página p3"))
        // ›: de p3 vuelve a p1 y luego a p2, ya con su nota y su casilla, sin red.
        assertTrue(pulsa(id, Widgets.ACCION_SIGUIENTE).contains("tarea de p1"))
        val p2 = pulsa(id, Widgets.ACCION_SIGUIENTE)
        assertTrue(p2.toString(), p2.containsAll(listOf("Página p2", "tarea de p2")))
        assertEquals("p2", Configs.lee(ctx, id).pagina)
        // Y por detrás pide la nota nueva al servidor (cuando contesta, la vuelve a pintar).
        lento = false
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500))
    }

    /** Capturas del widget en modo recientes (con -Proborazzi.test.record=true), claro y oscuro. */
    @Test
    fun capturas() {
        for (oscuro in listOf(false, true)) {
            org.robolectric.RuntimeEnvironment.setQualifiers(if (oscuro) "+night" else "+notnight")
            val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p2", titulo = "Página p2", espacio = "w1", recientes = true))
            NotaReceiver().onUpdate(ctx, AppWidgetManager.getInstance(ctx), intArrayOf(id))
            val v = Arnes.vista(ctx, synchronized(pintados) { pintados[id] }!!, 320, 220)
            v.measure(View.MeasureSpec.makeMeasureSpec(v.layoutParams.width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(v.layoutParams.height, View.MeasureSpec.EXACTLY))
            v.layout(0, 0, v.measuredWidth, v.measuredHeight)
            // Sin Activity (Roborazzi la pide para una View suelta): se pinta en un Bitmap a mano.
            val b = android.graphics.Bitmap.createBitmap(v.measuredWidth, v.measuredHeight, android.graphics.Bitmap.Config.ARGB_8888)
            v.draw(android.graphics.Canvas(b))
            File("build/capturas/pablo").apply { mkdirs() }.resolve("widget-nota-recientes-${if (oscuro) "oscuro" else "claro"}.png")
                .outputStream().use { b.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    @Test
    fun laVecinaDaLaVuelta() {
        val l = listOf("a" to "A", "b" to "B", "c" to "C")
        assertEquals("b", NotaReceiver.vecina(l, "a", 1)?.first)
        assertEquals("c", NotaReceiver.vecina(l, "a", -1)?.first)
        assertEquals("a", NotaReceiver.vecina(l, "c", 1)?.first)
        assertEquals("a", NotaReceiver.vecina(l, "borrada", 1)?.first)
        assertEquals(null, NotaReceiver.vecina(emptyList(), "a", 1))
    }
}
