package com.monrealperez.notiono.ui.tareas

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.inicio.BlocNotas
import com.monrealperez.notiono.ui.inicio.NotaFijada
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.serialization.json.jsonObject
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
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Mis tareas (secciones, el círculo que la marca hecha, añadir rápido) y los bloques nuevos
 * del Inicio (bloc de notas que se guarda solo, nota fijada con casillas) contra un servidor falso.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class TareasInicioTest {
    @get:Rule val compose = createComposeRule()
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private val pedidas = CopyOnWriteArrayList<Pair<String, String>>()
    private val hoy = LocalDate.now()

    private val tareas get() = """[
      {"recordId":"r1","pageId":"bd","dbTitle":"Tareas","title":"Pagar la luz","date":"${hoy.minusDays(2)}","status":"","hecha":false,"marca":{"fieldId":"c","si":true,"no":false}},
      {"recordId":"r2","pageId":"bd","dbTitle":"Tareas","title":"Comprar pan","date":"$hoy","status":"","hecha":false,"marca":{"fieldId":"c","si":true,"no":false}},
      {"recordId":"r3","pageId":"bd","dbTitle":"Tareas","title":"Revisar el coche","date":"${hoy.plusDays(1)}","status":"","hecha":false,"marca":null},
      {"recordId":"r4","pageId":"bd","dbTitle":"Tareas","title":"Hecha ya","date":"","status":"","hecha":true,"marca":{"fieldId":"c","si":true,"no":false}}
    ]"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val ruta = request.url.encodedPath.substringAfterLast('/')
                pedidas += ruta to (request.body?.utf8() ?: request.url.queryParameter("input").orEmpty())
                return respuestaTrpc(
                    when (ruta) {
                        "db.myTasks" -> tareas
                        "inicio.get" -> """{"config":{"bloques":[],"tareas":"bd"},"paginas":{"bd":{"title":"Tareas","icon":null}}}"""
                        "app.bloques" -> """{"huella":"h","bloques":[{"id":"n1","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Leche","styles":{}}],"children":[]}]}"""
                        else -> """{"ok":true}"""
                    },
                )
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.cache.vacia()
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
    }

    private fun monta(contenido: @androidx.compose.runtime.Composable () -> Unit) = compose.setContent {
        val nav = androidx.compose.runtime.remember { NavHostController(ctx) }
        CompositionLocalProvider(LocalNavegador provides Navegador(nav, {}, { _, _ -> })) { TemaNotiono(false) { contenido() } }
    }

    private fun espera(ruta: String): String {
        compose.waitUntil(5_000) { compose.waitForIdle(); pedidas.any { it.first == ruta } }
        return json.parseToJsonElement(pedidas.last { it.first == ruta }.second).jsonObject["json"].toString()
    }

    /** Con el reloj a mano: avanza (y deja correr el hilo principal) hasta que se cumpla. */
    private fun avanzaHasta(cond: () -> Boolean) {
        val fin = System.currentTimeMillis() + 5_000
        while (!cond()) {
            check(System.currentTimeMillis() < fin) { "no pasó a tiempo" }
            compose.mainClock.advanceTimeBy(50)
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
            Thread.sleep(20)
        }
    }

    private fun hay(texto: String) = compose.onAllNodesWithText(texto).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun misTareasPorSeccionesYElCirculoLaMarcaHecha() {
        monta { PantallaTareas() }
        compose.waitUntil(5_000) { compose.waitForIdle(); hay("Pagar la luz") }
        for (s in listOf("Vencidas", "Hoy", "Mañana", "Completadas")) assertTrue(s, hay(s))
        assertTrue("Completadas va plegada", !hay("Hecha ya"))
        // Pide también lo hecho (la 2.4 no lo pedía).
        assertTrue(pedidas.first { it.first == "db.myTasks" }.second.contains("conHechas"))
        // El círculo de «Comprar pan» (el 2.º sin hacer) pone la casilla de su BD.
        compose.onAllNodes(androidx.compose.ui.test.hasContentDescription("Marcar hecha"))[1].performClick()
        assertEquals("""{"recordId":"r2","fieldId":"c","value":true}""", espera("db.updateCell"))
        // El filtro «Hoy»: lo vencido y lo de hoy.
        compose.onAllNodesWithText("Hoy")[0].performClick() // el filtro (arriba); el otro «Hoy» es la sección
        compose.waitForIdle()
        assertTrue(!hay("Revisar el coche"))
    }

    @Test
    fun anadirRapidoVaASuBaseDeDatos() {
        monta { PantallaTareas() }
        compose.waitUntil(5_000) { compose.waitForIdle(); hay("Pagar la luz") && hay("Van a: Tareas") }
        compose.onNodeWithContentDescription("Añadir").performClick() // el «+» de la barra
        compose.waitUntil(5_000) { hay("Nueva tarea") }
        compose.onNode(androidx.compose.ui.test.hasSetTextAction()).performTextInput("Llamar al dentista")
        compose.onNodeWithText("Añadir").performClick()
        assertEquals("""{"titulo":"Llamar al dentista","fecha":null}""", espera("inicio.nuevaTarea"))
    }

    @Test
    fun elBlocSeGuardaSoloYLaNotaFijadaMarcaSusCasillas() {
        monta { androidx.compose.foundation.layout.Column { BlocNotas(""); NotaFijada("pn", "Lista de la compra") } }
        compose.onNodeWithContentDescription("Bloc de notas rápido").performTextInput("Idea suelta")
        compose.mainClock.advanceTimeBy(1_500)
        assertEquals("""{"texto":"Idea suelta"}""", espera("inicio.guardarBloc"))
        compose.waitUntil(5_000) { compose.waitForIdle(); hay("Leche") }
        compose.onNodeWithContentDescription("Leche").performClick()
        val ops = espera("app.aplicar")
        assertTrue(ops, ops.contains("\"checked\":true") && ops.contains("\"id\":\"n1\"") && ops.contains("\"id\":\"pn\""))
    }
}
