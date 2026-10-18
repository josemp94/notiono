package com.monrealperez.notiono.bd

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.tema.TemaNotiono
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** La gráfica con menos valores que categorías (otra versión del servidor): se pinta, no se cierra. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class GraficaTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer

    private val datos = """{
        "collection":{"id":"c1"},
        "fields":[{"id":"t","name":"Nombre","type":"text"}],
        "views":[{"id":"v1","name":"Gráfica","type":"chart"}],
        "view":{"id":"v1","name":"Gráfica","type":"chart"},
        "filas":[],
        "nivel":"edit"
    }"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.url.encodedPath.endsWith("db.chartData")) {
                    respuestaTrpc("""{"chartType":"bar","categories":["Lunes","Martes","Miércoles"],"values":[3],"xName":"Día","yName":"Tareas"}""")
                } else respuestaTrpc(datos)
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.repo.cache.guarda(s.repo.cache.clave("app.vista", objeto("pageId" to "p1")), json.parseToJsonElement(datos))
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).cache.vacia()
        Servicios.baseDePrueba = null
    }

    @Test
    fun menosValoresQueCategorias() {
        val s = Servicios.de(ctx)
        val est = EstadoBD("p1", s, s.alcance).apply { cacheada() }
        compose.setContent { TemaNotiono(false) { VistaGrafica(est) } }
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Miércoles").fetchSemanticsNodes().isNotEmpty() }
        // Las barras se pintan al dibujar (y ahí fallaba): se dibuja la ventana en un bitmap.
        compose.runOnIdle {
            val raiz = compose.activity.window.decorView
            raiz.draw(Canvas(Bitmap.createBitmap(raiz.width.coerceAtLeast(1), raiz.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)))
        }
    }
}
