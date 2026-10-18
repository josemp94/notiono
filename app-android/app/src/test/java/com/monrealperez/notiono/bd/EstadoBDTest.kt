package com.monrealperez.notiono.bd

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.respuestaTrpc
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Una BD con respuestas que llegan tarde: lo que se ve es siempre lo último que se pidió. */
@RunWith(RobolectricTestRunner::class)
class EstadoBDTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    @Volatile private var lentoVista1 = 0L
    @Volatile private var lentoCelda = 0L

    private fun datos(vista: String) = """{
        "collection":{"id":"c1"},
        "fields":[{"id":"t","name":"Nombre","type":"text"},
          {"id":"e","name":"Estado","type":"select","config":{"options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}}],
        "views":[{"id":"v1","name":"Uno","type":"table"},{"id":"v2","name":"Dos","type":"list"}],
        "view":{"id":"$vista","name":"$vista","type":"table"},
        "filas":[{"id":"r1","cells":{"t":"Pan","e":"a"}}],
        "nivel":"edit"
    }"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val ruta = request.url.encodedPath.removePrefix("/api/trpc/")
                if (ruta == "db.updateCell") {
                    Thread.sleep(lentoCelda)
                    return respuestaTrpc("""{"ok":true}""")
                }
                val vista = if (request.url.queryParameter("input").orEmpty().contains("\"v2\"")) "v2" else "v1"
                if (vista == "v1") Thread.sleep(lentoVista1)
                return respuestaTrpc(datos(vista))
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
        Servicios.de(ctx).cache.vacia()
        Servicios.baseDePrueba = null
    }

    @Test
    fun unaRespuestaViejaNoPisaLaVistaElegida() = runBlocking {
        val est = EstadoBD("p1", Servicios.de(ctx), this)
        est.vistaId = "v1"
        lentoVista1 = 1500
        // El refresco de la vista 1 tarda; mientras, se elige la 2 y llega antes.
        val vieja = async { est.carga() }
        delay(200)
        est.vistaId = "v2"
        est.carga()
        vieja.await()
        assertEquals("v2", est.datos?.view?.id)
    }

    @Test
    fun unRefrescoNoDevuelveUnaCeldaASuValorViejo() = runBlocking {
        val est = EstadoBD("p1", Servicios.de(ctx), CoroutineScope(SupervisorJob() + Dispatchers.Default))
        est.vistaId = "v2"
        est.carga()
        // Se cambia la celda; el cambio tarda en llegar y entre medias salta el refresco
        // periódico, que aún trae el valor de antes.
        lentoCelda = 1500
        est.ponCelda("r1", "e", JsonPrimitive("b"))
        delay(200)
        est.carga()
        assertEquals("b", (est.celdas(est.datos!!.filas.first())["e"] as JsonPrimitive).content)
    }
}
