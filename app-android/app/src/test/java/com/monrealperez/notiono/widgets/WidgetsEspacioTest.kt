package com.monrealperez.notiono.widgets

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.errorTrpc
import com.monrealperez.notiono.red.respuestaTrpc
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Un widget puesto en un espacio sigue enseñando lo suyo aunque en la app se cambie de
 * espacio (2.4.0); los puestos antes averiguan su espacio solos.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class WidgetsEspacioTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private val pedidas = CopyOnWriteArrayList<Pair<String, String>>()

    private fun espacioDe(r: RecordedRequest) = Regex("notiono_ws=([\\w-]+)").find(r.headers["Cookie"].orEmpty())?.groupValues?.get(1) ?: "-"

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            // La nota «p1» vive en el espacio w2: desde otro espacio, no existe (como el servidor).
            override fun dispatch(request: RecordedRequest): MockResponse {
                val ruta = request.url.encodedPath.removePrefix("/api/trpc/")
                val ws = espacioDe(request)
                pedidas.add(ruta to ws)
                return when {
                    ruta == "workspace.dePagina" -> respuestaTrpc(if (ws == "w2") "null" else """{"workspaceId":"w2"}""")
                    ruta.startsWith("app.") && ws != "w2" -> errorTrpc(404, "NOT_FOUND", "No existe")
                    ruta == "app.pagina" -> respuestaTrpc("""{"id":"p1","title":"Compra"}""")
                    ruta == "app.bloques" -> respuestaTrpc("""{"bloques":[{"id":"b1","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Pan","styles":{}}],"children":[]}]}""")
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
        // La app está en otro espacio que el de la nota.
        s.sesion.espacio = "w1"
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.de(ctx).cache.vacia()
        File(ctx.filesDir, "widgets").deleteRecursively()
        Servicios.baseDePrueba = null
    }

    @Test
    fun conSuEspacioPideASuEspacio() {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1", espacio = "w2"))
        runBlocking { NotaReceiver().refresca(ctx, id, "prueba") }
        val i = Instantaneas.lee(ctx, id)
        assertNotNull(i?.datos)
        assertEquals(null, i?.fallo)
        assertTrue("$pedidas", pedidas.filter { it.first.startsWith("app.") }.all { it.second == "w2" })
        assertEquals("w1", Servicios.de(ctx).sesion.espacio)
    }

    @Test
    fun unWidgetDeAntesAveriguaSuEspacio() {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1"))
        runBlocking { NotaReceiver().refresca(ctx, id, "prueba") }
        assertEquals("w2", Configs.lee(ctx, id).espacio)
        assertNotNull(Instantaneas.lee(ctx, id)?.datos)
        // La siguiente vez ya no pregunta.
        pedidas.clear()
        runBlocking { NotaReceiver().refresca(ctx, id, "otra") }
        assertTrue("$pedidas", pedidas.none { it.first == "workspace.dePagina" })
    }

    @Test
    fun marcarDesdeElWidgetVaASuEspacio() {
        runBlocking { Widgets.marcaCasilla(ctx, "p1", "b1", "w2") }
        assertEquals(listOf("app.bloques" to "w2", "app.aplicar" to "w2"), pedidas.toList())
    }
}
