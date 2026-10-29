package com.monrealperez.notiono.widgets

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Reciente
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.respuestaTrpc
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Los widgets «Favoritos» y «Recientes», como los de Notion: cada uno lo suyo, sin mezclar;
 * y la barrita del color de página en el título del widget Nota.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class FavoritosRecientesTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private val pintados = mutableMapOf<Int, RemoteViews>()

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.url.encodedPath.removePrefix("/api/trpc/")) {
                "favorites.list" -> respuestaTrpc("""[{"id":"f1","title":"Casa","icon":"🏠"},{"id":"f2","title":"Recetas","icon":null}]""")
                "app.pagina" -> respuestaTrpc("""{"id":"p1","title":"Compra","color":"blue"}""")
                "app.bloques" -> respuestaTrpc("""{"bloques":[]}""")
                else -> respuestaTrpc("{}")
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.sesion.espacio = "w1"
        // Abiertas en el móvil: una de ellas también es favorita.
        s.recientes.anota("w1", Reciente("f1", "Casa", "🏠", System.currentTimeMillis() - 60_000))
        s.recientes.anota("w1", Reciente("r1", "Viaje a Lisboa", "✈️", System.currentTimeMillis()))
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

    private fun textos(id: Int) = Arnes.textos(ctx, synchronized(pintados) { pintados.getValue(id) })

    @Test
    fun favoritosSoloPintaLasFavoritas() {
        val id = Arnes.pon(ctx, FavoritosReceiver::class.java)
        runBlocking { FavoritosReceiver().refresca(ctx, id, "prueba") }
        val t = textos(id)
        assertEquals("Favoritos", t.first())
        assertTrue("$t", t.containsAll(listOf("Casa", "Recetas")))
        assertFalse("$t", "Viaje a Lisboa" in t)
    }

    @Test
    fun favoritosVacioLoDice() {
        val v = Arnes.vista(ctx, FavoritosReceiver.favoritos(ctx, 1, emptyList(), null))
        assertTrue(Arnes.textos(v).contains("Marca páginas como favoritas y saldrán aquí."))
    }

    @Test
    fun recientesSoloLasVisitadasSinPedirFavoritos() {
        val id = Arnes.pon(ctx, RecientesReceiver::class.java)
        runBlocking { RecientesReceiver().refresca(ctx, id, "prueba") }
        val t = textos(id)
        assertEquals("Recientes", t.first())
        assertEquals(listOf("Viaje a Lisboa", "Casa"), t.filter { it == "Viaje a Lisboa" || it == "Casa" || it == "Recetas" })
        // Las visitadas no llevan estrella aunque sean favoritas: eso es del otro widget.
        val v = Arnes.vista(ctx, pintados.getValue(id))
        assertFalse(estrellaVisible(v))
        assertEquals(0, servidor.requestCount)
    }

    @Test
    fun laNotaLlevaLaBarritaDeSuColor() {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1", espacio = "w1"))
        runBlocking { NotaReceiver().refresca(ctx, id, "prueba") }
        val v = Arnes.vista(ctx, pintados.getValue(id))
        assertEquals(View.VISIBLE, v.findViewById<View>(R.id.widget_color).visibility)
        // Sin color, nada.
        val sin = Arnes.vista(ctx, NotaReceiver.nota(ctx, 2, "p", "Nota", emptyList(), null))
        assertEquals(View.GONE, sin.findViewById<View>(R.id.widget_color).visibility)
    }

    private fun estrellaVisible(v: View): Boolean = when {
        v.visibility != View.VISIBLE -> false
        v.id == R.id.fila_estrella -> true
        v is android.widget.AdapterView<*> -> (0 until (v.adapter?.count ?: 0)).any { estrellaVisible(v.adapter.getView(it, null, android.widget.FrameLayout(v.context))) }
        v is android.view.ViewGroup -> (0 until v.childCount).any { estrellaVisible(v.getChildAt(it)) }
        else -> false
    }
}
