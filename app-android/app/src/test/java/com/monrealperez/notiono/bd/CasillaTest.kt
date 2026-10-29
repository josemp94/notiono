package com.monrealperez.notiono.bd

import android.content.Context
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit

/** La casilla se marca tocándola en la Lista y en las tarjetas (2.4.1: se pintaba pero abría la ficha). */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class CasillaTest {
    @get:Rule val compose = createComposeRule()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private lateinit var est: EstadoBD
    private val abiertas = mutableListOf<String>()

    private val datos = """{
        "collection":{"id":"c1"},
        "fields":[
          {"id":"t","name":"Nombre","type":"text"},
          {"id":"h","name":"Hecha","type":"checkbox"},
          {"id":"e","name":"Estado","type":"select","config":{"options":[{"id":"a","label":"Por hacer","color":"gray"},{"id":"b","label":"Hecho","color":"green"}]}}
        ],
        "views":[{"id":"v1","name":"Tareas","type":"list","config":{"groupByFieldId":"e"}}],
        "view":{"id":"v1","name":"Tareas","type":"list","config":{"groupByFieldId":"e"}},
        "filas":[
          {"id":"r1","cells":{"t":"Comprar pan","e":"a"}},
          {"id":"r2","cells":{"t":"Regar","h":true,"e":"b"}}
        ],
        "nivel":"edit"
    }"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
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
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.baseDePrueba = null
    }

    private fun hecha(id: String) = (est.celdas(est.datos!!.filas.first { it.id == id })["h"] as? JsonPrimitive)?.content

    /** Toca la primera casilla (la de «Comprar pan») y comprueba que se manda sin abrir la ficha. */
    private fun tocaYComprueba() {
        compose.onAllNodes(isToggleable()).onFirst().performClick()
        compose.waitForIdle()
        assertEquals("true", hecha("r1"))
        assertEquals(emptyList<String>(), abiertas)
        val r = servidor.takeRequest(5, TimeUnit.SECONDS)!!
        assertEquals("/api/trpc/db.updateCell", r.url.encodedPath)
        assertEquals("""{"json":{"recordId":"r1","fieldId":"h","value":true}}""", r.body!!.utf8())
    }

    @Test
    fun enLaListaLaCasillaSeMarcaSinAbrirLaFicha() {
        compose.setContent { TemaNotiono(false) { VistaLista(est, abrir = { abiertas += it }) } }
        tocaYComprueba()
        // El resto de la fila sigue abriendo la ficha.
        compose.onNodeWithText("Regar").performClick()
        compose.waitForIdle()
        assertEquals(listOf("r2"), abiertas)
    }

    /** Como en Notion: la casilla va con las demás propiedades (no delante del título) y la fila hecha no se tacha. */
    @Test
    fun enLaListaLaCasillaEsUnaPropiedadMasYNoTachaElTitulo() {
        compose.setContent { TemaNotiono(false) { VistaLista(est, abrir = { abiertas += it }) } }
        fun estilo(t: String) = mutableListOf<TextLayoutResult>().also {
            compose.onNodeWithText(t).fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!(it)
        }.single().layoutInput.style
        val titulo = compose.onNodeWithText("Regar")
        assertNull("la fila hecha no tacha el título", estilo("Regar").textDecoration?.takeIf { it != TextDecoration.None })
        assertEquals("ni lo apaga", estilo("Comprar pan").color, estilo("Regar").color)
        // Las dos casillas (una por fila), debajo de su título, con su nombre como las demás propiedades.
        val casillas = compose.onAllNodes(isToggleable()).fetchSemanticsNodes()
        assertEquals(2, casillas.size)
        val delTitulo = titulo.getUnclippedBoundsInRoot()
        assertTrue("la casilla no va delante del título", casillas.last().boundsInRoot.top >= delTitulo.bottom.value - 1f)
        assertEquals(2, compose.onAllNodesWithText("Hecha").fetchSemanticsNodes().size)
    }

    @Test
    fun enUnaTarjetaDelKanbanLaCasillaSeMarcaSinAbrirLaFicha() {
        compose.setContent { TemaNotiono(false) { VistaKanban(est, abrir = { abiertas += it }, nueva = {}) } }
        // La casilla sin marcar también sale en la tarjeta, para poder marcarla.
        assertEquals(2, compose.onAllNodesWithText("Hecha").fetchSemanticsNodes().size)
        tocaYComprueba()
    }

    @Test
    fun enSoloLecturaSeVePeroNoSeToca() {
        val s = Servicios.de(ctx)
        s.repo.cache.guarda(s.repo.cache.clave("app.vista", objeto("pageId" to "p2")), json.parseToJsonElement(datos.replace("\"edit\"", "\"read\"")))
        est = EstadoBD("p2", s, s.alcance).apply { cacheada() }
        compose.setContent { TemaNotiono(false) { VistaLista(est, abrir = { abiertas += it }) } }
        assertEquals(0, compose.onAllNodes(isToggleable()).fetchSemanticsNodes().size)
    }
}
