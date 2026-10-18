package com.monrealperez.notiono.bd

import android.content.Context
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.serialization.json.JsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit

/** Arrastrar tarjetas en el Kanban (la 2.0.1 se cerraba al soltar), sin servidor de verdad. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class KanbanTest {
    @get:Rule val compose = createComposeRule()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private lateinit var est: EstadoBD
    private val abiertas = mutableListOf<String>()

    private val datos = """{
        "collection":{"id":"c1"},
        "fields":[
          {"id":"t","name":"Nombre","type":"text"},
          {"id":"e","name":"Estado","type":"select","config":{"options":[{"id":"a","label":"Por hacer","color":"gray"},{"id":"b","label":"Hecho","color":"green"}]}}
        ],
        "views":[{"id":"v1","name":"Tablero","type":"kanban","config":{"groupByFieldId":"e"}}],
        "view":{"id":"v1","name":"Tablero","type":"kanban","config":{"groupByFieldId":"e"}},
        "filas":[
          {"id":"r1","cells":{"t":"Comprar pan","e":"a"}},
          {"id":"r2","cells":{"t":"Llamar al taller","e":"a"}},
          {"id":"r3","cells":{"t":"Regar","e":"b"}}
        ],
        "nivel":"edit"
    }"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            // Las mutaciones dicen «hecho»; las consultas, la vista tal cual.
            override fun dispatch(request: RecordedRequest): MockResponse =
                respuestaTrpc(if (request.method == "POST") """{"ok":true}""" else datos)
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.repo.cache.guarda(s.repo.cache.clave("app.vista", objeto("pageId" to "p1")), json.parseToJsonElement(datos))
        est = EstadoBD("p1", s, s.alcance).apply { cacheada() }
        compose.setContent { TemaNotiono(false) { VistaKanban(est, abrir = { abiertas += it }, nueva = {}) } }
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.baseDePrueba = null
    }

    private fun fila(id: String) = est.datos!!.filas.first { it.id == id }

    @Test
    fun arrastrarAOtraColumnaLaMueveSinCerrarse() {
        var dx = 0f
        compose.runOnIdle { dx = with(compose.density) { 300.dp.toPx() } }
        compose.onNodeWithText("Comprar pan").performTouchInput {
            down(center)
            advanceEventTime(viewConfiguration.longPressTimeoutMillis + 200)
            repeat(10) { moveBy(Offset(dx / 10, 0f)) }
            up()
        }
        compose.waitForIdle()
        assertEquals("b", (est.celdas(fila("r1"))["e"] as JsonPrimitive).content)
        val r = servidor.takeRequest(5, TimeUnit.SECONDS)!!
        assertEquals("/api/trpc/db.updateCell", r.url.encodedPath)
        assertEquals("""{"json":{"recordId":"r1","fieldId":"e","value":"b"}}""", r.body!!.utf8())
    }

    @Test
    fun opcionesRepetidasNoRepitenColumnas() {
        // Las columnas son las claves de la lista: una repetida cerraba la vista.
        val c = com.monrealperez.notiono.datos.Campo("e2", "E", "select", config = json.parseToJsonElement(
            """{"options":[{"id":"a","label":"A"},{"id":"a","label":"A otra vez"},{"id":"","label":"Vacía"}]}""",
        ))
        assertEquals(listOf("a", ""), gruposDe(est, c).map { it.id })
    }

    @Test
    fun pulsacionLargaSinMoverAbreElMenu() {
        compose.onNodeWithText("Comprar pan").performTouchInput {
            down(center)
            advanceEventTime(viewConfiguration.longPressTimeoutMillis + 200)
            up()
        }
        compose.waitForIdle()
        assertTrue(compose.onAllNodesWithText("Mover a…").fetchSemanticsNodes().isNotEmpty())
        assertEquals("a", (est.celdas(fila("r1"))["e"] as JsonPrimitive).content)
        assertEquals(emptyList<String>(), abiertas)
    }
}
