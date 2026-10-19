package com.monrealperez.notiono.datos

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.errorTrpc
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.widgets.Arnes
import com.monrealperez.notiono.widgets.ConfigWidget
import com.monrealperez.notiono.widgets.ListaReceiver
import com.monrealperez.notiono.widgets.NotaReceiver
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
import java.util.concurrent.TimeUnit

/** El registro de diagnóstico: apunta cierres y fallos de widgets, y los manda al servidor sin contenido. */
@RunWith(RobolectricTestRunner::class)
class RegistroTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private var registroOk = true

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.url.encodedPath == "/api/app/registro" ->
                    MockResponse.Builder().code(if (registroOk) 200 else 503).body("""{"ok":true}""").build()
                request.url.encodedPath.endsWith("app.pagina") -> respuestaTrpc("""{"id":"p1","title":"Diario secreto"}""")
                request.url.encodedPath.endsWith("app.bloques") -> respuestaTrpc("""{"bloques":[]}""")
                else -> errorTrpc(500, "INTERNAL_SERVER_ERROR", "Se cayó")
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        Servicios.de(ctx).sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
    }

    private fun peticionDeRegistro(): RecordedRequest {
        while (true) {
            val r = servidor.takeRequest(5, TimeUnit.SECONDS)!!
            if (r.url.encodedPath == "/api/app/registro") return r
        }
    }

    @Test
    fun cierreYFalloDeWidgetLleganAlServidorSinContenido() = runBlocking {
        val s = Servicios.de(ctx)
        // Un cierre inesperado: queda apuntado y el cierre sigue su curso (el capturador anterior).
        var siguio = false
        val original = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { _, _ -> siguio = true }
        try {
            s.registro.capturaCierres()
            Thread.getDefaultUncaughtExceptionHandler()!!.uncaughtException(Thread.currentThread(), IllegalStateException("boom"))
        } finally {
            Thread.setDefaultUncaughtExceptionHandler(original)
        }
        assertTrue(siguio)
        // Un refresco bueno (con un título que no debe salir del móvil) y uno que falla.
        val nota = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1"))
        val lista = Arnes.pon(ctx, ListaReceiver::class.java, ConfigWidget(pagina = "bd1"))
        NotaReceiver().refresca(ctx, nota, "prueba")
        ListaReceiver().refresca(ctx, lista, "prueba")

        val ev = s.registro.pendientes()
        assertTrue("$ev", ev.any { it.tipo == "cierre" && "IllegalStateException: boom" in it.mensaje && "RegistroTest" in it.traza.orEmpty() })
        assertTrue("$ev", ev.any { it.tipo == "widget" && it.mensaje.startsWith("nota#$nota · prueba · ok") })
        assertTrue("$ev", ev.any { it.tipo == "widget" && it.mensaje.startsWith("lista#$lista · prueba · fallo") && "ErrorApi" in it.mensaje })
        // Cada pintado queda apuntado: qué se enseñó, cuántos elementos y cuánto ocupa.
        assertTrue("$ev", ev.any { it.tipo == "widget" && it.mensaje.startsWith("pinta · nota#$nota · vacio · 0 elem") && " kB" in it.mensaje })
        assertTrue("$ev", ev.any { it.tipo == "widget" && it.mensaje.startsWith("pinta · lista#$lista · aviso · 0 elem") })
        assertTrue("$ev", ev.any { it.tipo == "red" && "app.vista: 500" in it.mensaje })

        assertTrue(s.registro.envia(s.api, conSesion = true))
        val r = peticionDeRegistro()
        val cuerpo = r.body!!.utf8()
        assertEquals("POST", r.method)
        assertTrue(r.headers["Cookie"].orEmpty().contains("notiono_session=tok"))
        for (t in listOf("\"entradas\"", "\"cierre\"", "\"dispositivo\"", "\"modelo\"", "\"fabricante\"", "\"android\"", com.monrealperez.notiono.BuildConfig.VERSION_NAME)) assertTrue("$t en $cuerpo", t in cuerpo)
        assertFalse(cuerpo, "Diario secreto" in cuerpo)
        assertEquals(0, s.registro.pendientes().size)
    }

    @Test
    fun siFallaElEnvioSeQuedaParaLaProxima() = runBlocking {
        val s = Servicios.de(ctx)
        s.registro.anota("widget", "nota · prueba · fallo")
        registroOk = false
        assertFalse(s.registro.envia(s.api, conSesion = true))
        assertEquals(1, s.registro.pendientes().size)
        assertFalse(s.registro.envia(s.api, conSesion = false))
        registroOk = true
        assertTrue(s.registro.envia(s.api, conSesion = true))
        assertEquals(0, s.registro.pendientes().size)
    }

    @Test
    fun seQuedaConLasUltimas() {
        val r = Servicios.de(ctx).registro
        repeat(400) { r.anota("widget", "evento $it") }
        val ev = r.eventos()
        assertTrue("${ev.size}", ev.size in Registro.MAXIMO..Registro.MAXIMO + 50)
        assertEquals("evento 399", ev.last().mensaje)
    }
}
