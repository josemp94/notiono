package com.monrealperez.notiono.ui.espacios

import android.content.Context
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.captureScreenRoboImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.bandeja.PantallaBandeja
import com.monrealperez.notiono.ui.comun.HojaMover
import com.monrealperez.notiono.ui.inicio.PantallaInicio
import com.monrealperez.notiono.ui.pagina.HojaCompartir
import com.monrealperez.notiono.ui.pagina.MenuPagina
import com.monrealperez.notiono.ui.panel.Panel
import com.monrealperez.notiono.ui.tema.C
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

/**
 * Fotos de las pantallas nuevas de la 2.4.0 (espacios, personas, compartir, mover a otro
 * espacio, el invitado y los avisos nuevos), en claro y en oscuro a 390 dp, con un servidor
 * de mentira. Solo escriben los PNG con `-Proborazzi.test.record=true`
 * (app/build/capturas-espacios/<modo>/); sin eso recorren las pantallas igual.
 */
@OptIn(ExperimentalRoborazziApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class CapturasEspaciosTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    @Volatile private var rol = "owner"

    private fun yo() = if (rol == "guest") """{"id":"u1","email":"ana@example.com","name":"Ana","wsRole":"guest","workspace":{"id":"w3","name":"Huerto de Pepa","icon":"🌱"}}"""
    else """{"id":"u1","email":"ana@example.com","name":"Ana","wsRole":"owner","workspace":{"id":"w1","name":"Casa","icon":"🏠"}}"""

    private val respuestas: Map<String, () -> String> = mapOf(
        "auth.me" to { yo() },
        "workspace.list" to {
            """[{"id":"w1","name":"Casa","icon":"🏠","isOwner":true,"rol":"owner","ownerName":"Ana","compartido":true,"miembros":3,"sinLeer":0},
               {"id":"w2","name":"Trabajo","isOwner":false,"rol":"editor","ownerName":"Luis","compartido":true,"miembros":5,"sinLeer":3},
               {"id":"w3","name":"Huerto de Pepa","icon":"🌱","isOwner":false,"rol":"guest","ownerName":"Pepa","compartido":true,"miembros":2,"sinLeer":1}]"""
        },
        "workspace.members" to {
            """{"myRole":"owner","isOwner":true,"ownerId":"u1","members":[
                {"userId":"u1","name":"Ana","email":"ana@example.com","role":"owner"},
                {"userId":"u2","name":"Luis","email":"luis@example.com","role":"editor"},
                {"userId":"u4","name":"Abuela","email":"abuela@sso.local","role":"viewer"},
                {"userId":"u3","name":"Rocío","email":"rocio@example.com","role":"guest"}],
               "invitaciones":[{"id":"i1","destino":"primo","role":"editor"}]}"""
        },
        "pages.perms.get" to {
            """{"restricted":true,"nivel":"full","permisos":[{"userId":"u2","level":"edit","name":"Luis","email":"luis@example.com"}],
               "invitados":[{"userId":"u3","level":"comment","name":"Rocío","email":"rocio@example.com"}],
               "pendientes":[{"id":"ip1","destino":"suegra","level":"view"}]}"""
        },
        "pages.tree" to {
            if (rol == "guest") """[{"id":"t1","title":"Tomates","icon":"🍅","parentId":null,"order":"a","hasChildren":true},{"id":"t2","title":"Riego","parentId":"t1","order":"a"}]"""
            else """[{"id":"p1","title":"Viaje a Lisboa","icon":"🧳","parentId":null,"order":"a"},{"id":"p2","title":"Recetas","icon":"🍲","parentId":null,"order":"b"}]"""
        },
        "pages.arbolDe" to { """[{"id":"q1","title":"Proyectos","icon":"📁","parentId":null},{"id":"q2","title":"Reuniones","parentId":"q1"}]""" },
        "favorites.list" to { "[]" },
        "notifications.list" to {
            """[{"id":"n1","type":"share","read":false,"createdAt":"2026-10-25T10:00:00.000Z","actor":{"name":"Gio"},"page":{"id":"p1","title":"Viaje a Lisboa","icon":"🧳"}},
               {"id":"n2","type":"space","read":false,"createdAt":"2026-10-25T09:00:00.000Z","title":"Casa","actor":{"name":"Gio"}},
               {"id":"n3","type":"comment","read":true,"createdAt":"2026-10-24T09:00:00.000Z","title":"¿Vamos el sábado?","actor":{"name":"Luis"},"page":{"id":"p2","title":"Recetas"}}]"""
        },
        "inicio.get" to { """{"config":null,"paginas":{}}""" },
    )

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val ruta = request.url.encodedPath.removePrefix("/api/trpc/")
                return respuestaTrpc(respuestas[ruta]?.invoke() ?: if (request.method == "POST") "{}" else "[]")
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.sesion.espacio = "w1"
        s.cache.vacia()
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
    }

    @Test fun claro() = recorre("claro", false)
    @Test fun oscuro() = recorre("oscuro", true)

    private fun aparece(texto: String) = compose.waitUntil(8_000) { compose.onAllNodesWithText(texto, substring = true).fetchSemanticsNodes().isNotEmpty() }

    private fun recorre(modo: String, oscuro: Boolean) {
        var pantalla by mutableStateOf("")
        val y = json.decodeFromString(Yo.serializer(), yo())
        compose.setContent {
            val nav = remember { NavHostController(ctx) }
            CompositionLocalProvider(LocalNavegador provides Navegador(nav, {}, {})) {
                TemaNotiono(oscuro) {
                    Box(Modifier.fillMaxSize().background(C.fondo)) {
                        when (pantalla) {
                            "selector" -> HojaEspacios(y, onCerrar = {}, onCambiado = {}, onAjustes = {}, onInvitar = {})
                            "nuevo-espacio" -> NuevoEspacio(onCerrar = {}, onCreado = {})
                            "general" -> PantallaEspacioGeneral()
                            "personas" -> PantallaPersonas()
                            "personas-invitados" -> PantallaPersonas(invitadosPrimero = true)
                            "compartir" -> HojaCompartir("p1", publicada = true, onPublicar = {}, onCerrar = {})
                            "mover-a-otro-espacio" -> HojaMover("p1") {}
                            "bandeja" -> PantallaBandeja()
                            "menu-invitado" -> MenuPagina(PaginaInfo("t1", title = "Tomates", icon = "🍅", nivel = "edit"), onCerrar = {}, onComentarios = {})
                            "inicio-invitado" -> PantallaInicio()
                            "panel-invitado" -> Panel(onCerrar = {})
                        }
                    }
                }
            }
        }
        fun foto(nombre: String, espera: String) {
            pantalla = nombre
            aparece(espera)
            compose.mainClock.advanceTimeBy(1_000)
            compose.waitForIdle()
            captureScreenRoboImage("build/capturas-espacios/$modo/$nombre.png")
        }
        foto("selector", "Nuevo espacio")
        foto("nuevo-espacio", "Crear espacio")
        foto("general", "Zona de peligro")
        foto("personas", "Invitaciones pendientes")
        foto("personas-invitados", "Rocío")
        foto("compartir", "Pendiente · Ver")
        foto("mover-a-otro-espacio", "Recetas")
        compose.onNodeWithText("Espacio").performClick()
        aparece("Trabajo")
        compose.mainClock.advanceTimeBy(1_000)
        captureScreenRoboImage("build/capturas-espacios/$modo/mover-elegir-espacio.png")
        compose.onNodeWithText("Trabajo").performClick()
        aparece("Proyectos")
        compose.onNodeWithText("Proyectos").performClick()
        aparece("Entiendo, duplicar")
        compose.mainClock.advanceTimeBy(1_000)
        captureScreenRoboImage("build/capturas-espacios/$modo/mover-confirmar.png")
        foto("bandeja", "te ha añadido al espacio")
        // Ana, invitada de una página en el huerto de Pepa.
        rol = "guest"
        Servicios.de(ctx).sesion.espacio = "w3"
        foto("menu-invitado", "Historial de versiones")
        foto("inicio-invitado", "Compartido contigo")
        foto("panel-invitado", "Compartido")
    }
}
