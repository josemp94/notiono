package com.monrealperez.notiono.ui.capturas

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.github.takahirom.roborazzi.captureRoboImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.inicio.AccionesRapidas
import com.monrealperez.notiono.ui.inicio.BlocNotas
import com.monrealperez.notiono.ui.inicio.ConfigInicio
import com.monrealperez.notiono.ui.inicio.ListaRecordatorios
import com.monrealperez.notiono.ui.inicio.NotaFijada
import com.monrealperez.notiono.ui.pagina.HojaFecha
import com.monrealperez.notiono.ui.pagina.pieInfo
import com.monrealperez.notiono.ui.tareas.PantallaTareas
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.serialization.json.JsonObject
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
import java.time.LocalDate

/**
 * Capturas de lo nuevo de la 2.5.0 en la app, en claro y en oscuro (390 dp), con datos de
 * mentira: Inicio (acciones, bloc, nota fijada, recordatorios, información de la página),
 * Mis tareas por secciones y «Recordarme…». Solo graban con -Proborazzi.test.record=true.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class CapturasPabloTest {
    @get:Rule val compose = createComposeRule()
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private val hoy = LocalDate.now()

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = respuestaTrpc(
                when (request.url.encodedPath.substringAfterLast('/')) {
                    "db.myTasks" -> """[
                      {"recordId":"r1","pageId":"bd","dbTitle":"Tareas","title":"Pagar la luz","date":"${hoy.minusDays(2)}","status":"","hecha":false,"marca":{"fieldId":"c","si":true,"no":false}},
                      {"recordId":"r2","pageId":"bd","dbTitle":"Tareas","title":"Comprar pan","date":"$hoy","status":"","hecha":false,"marca":{"fieldId":"c","si":true,"no":false}},
                      {"recordId":"r3","pageId":"bd","dbTitle":"Tareas","title":"Revisar el coche","date":"${hoy.plusDays(1)}","status":"En curso","hecha":false,"marca":{"fieldId":"c","si":true,"no":false}},
                      {"recordId":"r5","pageId":"bd","dbTitle":"Tareas","title":"Llamar a la abuela","date":"${hoy.plusDays(4)}","status":"","hecha":false,"marca":{"fieldId":"c","si":true,"no":false}},
                      {"recordId":"r6","pageId":"bd","dbTitle":"Tareas","title":"Ordenar el trastero","date":"","status":"","hecha":false,"marca":{"fieldId":"c","si":true,"no":false}},
                      {"recordId":"r4","pageId":"bd","dbTitle":"Tareas","title":"Enviar el informe","date":"${hoy.minusDays(1)}","status":"","hecha":true,"marca":{"fieldId":"c","si":true,"no":false}}]"""
                    "inicio.get" -> """{"config":{"bloques":[],"tareas":"bd"},"paginas":{"bd":{"title":"Tareas","icon":null}}}"""
                    "app.bloques" -> """{"huella":"h","bloques":[
                      {"id":"n0","type":"heading","props":{"level":2},"content":[{"type":"text","text":"Súper","styles":{}}],"children":[]},
                      {"id":"n1","type":"checkListItem","props":{"checked":true},"content":[{"type":"text","text":"Leche","styles":{}}],"children":[]},
                      {"id":"n2","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Pan integral","styles":{}}],"children":[]},
                      {"id":"n3","type":"paragraph","content":[{"type":"text","text":"Del Mercadona, que cierra a las 21:30.","styles":{}}],"children":[]}]}"""
                    "app.recordatorio" -> """{"fecha":"${hoy.plusDays(1)}T09:00"}"""
                    else -> "null"
                },
            )
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Pablo", "pablo@example.com")))
        s.cache.vacia()
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
    }

    private fun foto(nombre: String, oscuro: Boolean, espera: String, contenido: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent {
            val nav = androidx.compose.runtime.remember { NavHostController(ctx) }
            CompositionLocalProvider(LocalNavegador provides Navegador(nav, {}, {})) {
                // El fondo lo pone Principal en la app.
                TemaNotiono(oscuro) { androidx.compose.foundation.layout.Box(Modifier.fillMaxSize().background(C.fondo)) { contenido() } }
            }
        }
        compose.waitUntil(5_000) { compose.waitForIdle(); compose.onAllNodesWithText(espera, substring = true).fetchSemanticsNodes().isNotEmpty() }
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("build/capturas/pablo/$nombre-${if (oscuro) "oscuro" else "claro"}.png")
    }

    private fun inicio(oscuro: Boolean) = foto("app-inicio", oscuro, "Pan integral") {
        Column(Modifier.fillMaxSize().background(C.fondo).verticalScroll(rememberScrollState()).padding(vertical = 12.dp)) {
            AccionesRapidas(ConfigInicio.porDefecto().copy(tareas = "bd")) {}
            androidx.compose.foundation.layout.Spacer(Modifier.padding(8.dp))
            BlocNotas("Ideas para el finde\n- [ ] Ir al cine\n- Llamar a la abuela")
            NotaFijada("pn", "Lista de la compra")
            androidx.compose.foundation.layout.Spacer(Modifier.padding(8.dp))
            ListaRecordatorios(listOf(json.parseToJsonElement("""{"key":"k","titulo":"Llamar al fontanero","inicio":"${hoy.plusDays(1)}T09:00","pageId":"p1","recordId":null}""") as JsonObject))
            for (l in pieInfo(json.parseToJsonElement("""{"palabras":124,"caracteres":702,"casillas":3,"hechas":1,"imagenes":2,"adjuntos":1,"creada":"2026-10-29T08:51:00.000Z","editada":"2026-10-29T09:51:00.000Z","editadaPor":"Pablo"}""") as JsonObject).let { it.first + it.second })
                androidx.compose.material3.Text(l, color = C.apagado, fontSize = androidx.compose.ui.unit.TextUnit(12f, androidx.compose.ui.unit.TextUnitType.Sp), modifier = Modifier.padding(horizontal = 16.dp))
        }
    }

    @Test fun inicioClaro() = inicio(false)
    @Test fun inicioOscuro() = inicio(true)
    @Test fun tareasClaro() = foto("app-mis-tareas", false, "Pagar la luz") { PantallaTareas() }
    @Test fun tareasOscuro() = foto("app-mis-tareas", true, "Pagar la luz") { PantallaTareas() }
    private val fechaConAviso = kotlinx.serialization.json.JsonObject(mapOf("fecha" to kotlinx.serialization.json.JsonPrimitive("2026-10-30T09:00"), "recordatorio" to kotlinx.serialization.json.JsonPrimitive("0"), "por" to kotlinx.serialization.json.JsonPrimitive("u1")))
    @Test fun recordarClaro() = foto("app-menu-fecha", false, "Recordar") { HojaFecha(fechaConAviso, {}, {}) }
    @Test fun recordarOscuro() = foto("app-menu-fecha", true, "Recordar") { HojaFecha(fechaConAviso, {}, {}) }
}
