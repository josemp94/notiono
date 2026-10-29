package com.monrealperez.notiono.ui.espacios

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.errorTrpc
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.Destino
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.bandeja.enlaceDeAviso
import com.monrealperez.notiono.ui.bandeja.textoAviso
import com.monrealperez.notiono.ui.comun.HojaMover
import com.monrealperez.notiono.ui.pagina.HojaCompartir
import com.monrealperez.notiono.ui.pagina.MenuPagina
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Espacios y compartir en la app (2.4.0), lo mismo que la web: el selector, «Nuevo
 * espacio», Personas, «Compartir» de una página, «Mover a» otro espacio, lo que un
 * invitado no tiene y los avisos de otro espacio. Sin servidor de verdad.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class EspaciosTest {
    @get:Rule val compose = createComposeRule()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer

    /** Lo que responde cada procedimiento (por defecto, `{}` a las mutaciones y `null` a las consultas). */
    private val respuestas = ConcurrentHashMap<String, (RecordedRequest) -> MockResponse>()
    private val pedidas = CopyOnWriteArrayList<Pair<String, String>>()

    private fun responde(ruta: String, json: String) { respuestas[ruta] = { respuestaTrpc(json) } }

    private fun yo(rol: String, ws: String = "w1", nombre: String = "Casa") =
        """{"id":"u1","email":"ana@example.com","name":"Ana","wsRole":"$rol","workspace":{"id":"$ws","name":"$nombre"}}"""

    private val lista = """[
        {"id":"w1","name":"Casa","isOwner":true,"rol":"owner","ownerName":"Ana","compartido":true,"miembros":3,"sinLeer":0},
        {"id":"w2","name":"Trabajo","isOwner":false,"rol":"editor","ownerName":"Luis","compartido":true,"miembros":2,"sinLeer":3},
        {"id":"w3","name":"Suegros","isOwner":false,"rol":"guest","ownerName":"Pepa","compartido":true,"miembros":4,"sinLeer":0}
    ]"""

    private val avisos = CopyOnWriteArrayList<String>()
    private val oyente = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Default)

    @Before
    fun prepara() {
        oyente.launch { com.monrealperez.notiono.ui.comun.Avisos.flujo.collect { avisos.add(it.texto) } }
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val ruta = request.url.encodedPath.removePrefix("/api/trpc/")
                pedidas.add(ruta to (if (request.method == "POST") request.body!!.utf8() else request.url.queryParameter("input").orEmpty()))
                return respuestas[ruta]?.invoke(request) ?: respuestaTrpc(if (request.method == "POST") "{}" else "null")
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
        responde("workspace.list", lista)
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
    }

    /** Espera a que la app pida `ruta` y devuelve lo que mandó (el cuerpo `{"json":…}`). */
    private fun espera(ruta: String): String {
        compose.waitUntil(5_000) { pedidas.any { it.first == ruta } }
        return json.parseToJsonElement(pedidas.last { it.first == ruta }.second).jsonObject["json"].toString()
    }

    private fun conNavegador(contenido: @androidx.compose.runtime.Composable () -> Unit) = compose.setContent {
        val nav = androidx.compose.runtime.remember { NavHostController(ctx) }
        CompositionLocalProvider(LocalNavegador provides Navegador(nav, {}, { _, _ -> })) { TemaNotiono(false) { contenido() } }
    }

    /**
     * Espera a que se cumpla; si no, dice qué pasó. Deja correr el hilo principal en cada
     * vuelta: una condición que no mira la pantalla no lo hace sola (y lo que sigue a una
     * llamada de red se queda esperando en él).
     */
    private fun esperaQue(que: String, cond: () -> Boolean) = try {
        compose.waitUntil(5_000) { compose.waitForIdle(); cond() }
    } catch (e: Throwable) {
        throw AssertionError("$que; avisos: $avisos; pedidas: ${pedidas.map { it.first }}; espacio: ${Servicios.de(ctx).sesion.espacio}; registro: ${Servicios.de(ctx).registro.eventos().takeLast(4).map { it.tipo + " " + it.mensaje + " " + it.traza?.take(600) }}", e)
    }

    private fun aparece(texto: String) = esperaQue("no aparece «$texto»") { compose.onAllNodesWithText(texto).fetchSemanticsNodes().isNotEmpty() }
    private fun noHay(texto: String) = assertTrue("no debería salir «$texto»", compose.onAllNodesWithText(texto).fetchSemanticsNodes().isEmpty())

    // ---------------- Lógica ----------------

    @Test
    fun loQuePuedeCadaRol() {
        val invitado = Puede("guest")
        assertFalse(invitado.crear); assertFalse(invitado.papelera); assertFalse(invitado.misTareas)
        assertFalse(invitado.personas); assertFalse(invitado.organizar); assertFalse(invitado.compartir("full"))
        assertFalse(Puede("viewer").crear)
        assertTrue(Puede("viewer").organizar)
        assertTrue(Puede("editor").crear)
        assertTrue(Puede("editor").compartir("full"))
        assertFalse(Puede("owner").compartir("edit"))
        assertEquals("Propietario · 3 miembros", Roles.subtitulo("owner", 3))
        assertEquals("Miembro · 1 miembro", Roles.subtitulo("editor", 1))
        assertEquals("Invitado", Roles.subtitulo("guest", 4))
        assertEquals("Acceso total", Roles.nivel("full"))
        assertEquals("Invitado", Roles.nombre("guest"))
        val l = Espacios.lista(json.parseToJsonElement(lista))
        assertEquals(listOf("w1", "w2"), Espacios.destinosMover(l, "w1").map { it.id })
        assertTrue(Espacios.unicoPropio(l))
        assertTrue(Espacios.avisosFuera(l, "w1"))
        assertFalse(Espacios.avisosFuera(l, "w2"))
    }

    @Test
    fun enlacesConEspacio() {
        assertEquals(Destino.EnEspacio("w2", Destino.Pagina("p1")), Destino.de(Uri.parse("notiono://pagina/p1?ws=w2")))
        assertEquals(Destino.EnEspacio("w2", Destino.Fila("p1", "r1")), Destino.de(Uri.parse("notiono://fila/p1/r1?ws=w2")))
        assertEquals(Destino.Espacio("w2"), Destino.de(Uri.parse("notiono://espacio/w2")))
        assertEquals(Destino.Pagina("p1"), Destino.de(Uri.parse("notiono://pagina/p1?ws=../x")))
        // El push de la web: /api/espacio/<id>?a=/p/<página>.
        assertEquals(
            Destino.EnEspacio("w2", Destino.Fila("p1", "r1")),
            Destino.de(Uri.parse("https://notiono.monrealperez.com/api/espacio/w2?a=" + Uri.encode("/p/p1?r=r1"))),
        )
        assertEquals(Destino.Espacio("w2"), Destino.de(Uri.parse("https://notiono.monrealperez.com/api/espacio/w2")))
        assertEquals(Destino.Espacio("w2"), Destino.de(Uri.parse("https://notiono.monrealperez.com/api/espacio/w2?a=//otro.sitio")))
    }

    @Test
    fun avisosNuevosConSuTextoYSuEspacio() {
        fun aviso(t: String) = json.parseToJsonElement(t).jsonObject
        val share = aviso("""{"id":"n1","type":"share","actor":{"name":"Gio"},"page":{"id":"p1","title":"Viaje","icon":"🧳"},"espacio":{"id":"w2","name":"Trabajo"}}""")
        assertEquals("Gio ha compartido «🧳Viaje» contigo", textoAviso(share).text)
        assertEquals("notiono://pagina/p1?ws=w2", enlaceDeAviso(share))
        val alta = aviso("""{"id":"n2","type":"space","title":"Casa","actor":{"email":"gio@x.es"},"workspaceId":"w3"}""")
        assertEquals("gio@x.es te ha añadido al espacio «Casa»", textoAviso(alta).text)
        assertEquals("notiono://espacio/w3", enlaceDeAviso(alta))
        // Uno que esta versión no conoce: nada de «te mencionó en una página borrada».
        val raro = aviso("""{"id":"n3","type":"otracosa","title":"Algo","actor":{"name":"Gio"}}""")
        assertFalse(textoAviso(raro).text.contains("mencionó"))
        assertEquals("Novedad: «Algo» · Gio", textoAviso(raro).text)
        assertEquals("notiono://bandeja", enlaceDeAviso(aviso("""{"id":"n4","type":"mention"}""")))
        val due = aviso("""{"id":"n5","type":"due","key":"due:r9:f:2026-10-25","page":{"id":"bd"},"espacio":{"id":"w1"}}""")
        assertEquals("notiono://fila/bd/r9?ws=w1", enlaceDeAviso(due))
    }

    // ---------------- Selector y «Nuevo espacio» ----------------

    @Test
    fun elSelectorMarcaElActivoEnseñaAvisosDeOtrosYCambia() {
        responde("auth.me", yo("owner"))
        var cambiado = false
        val y = json.decodeFromString(Yo.serializer(), yo("owner"))
        conNavegador { HojaEspacios(y, onCerrar = {}, onCambiado = { cambiado = true }, onAjustes = {}, onInvitar = {}) }
        aparece("Trabajo")
        compose.onNodeWithText("Propietario · 3 miembros").assertIsDisplayed()
        compose.onNodeWithText("Invitar miembros").assertIsDisplayed()
        compose.onNodeWithText("3").assertIsDisplayed()
        compose.onNodeWithText("de Luis").assertIsDisplayed()
        compose.onNodeWithText("Nuevo espacio").assertIsDisplayed()
        compose.onNodeWithText("Trabajo").performClick()
        assertEquals("""{"workspaceId":"w2"}""", espera("workspace.switch"))
        esperaQue("no cambió") { cambiado }
        assertEquals("w2", Servicios.de(ctx).sesion.espacio)
    }

    @Test
    fun unInvitadoNoInvitaNiSabeCuantosHay() {
        val y = json.decodeFromString(Yo.serializer(), yo("guest", "w3", "Suegros"))
        conNavegador { HojaEspacios(y, onCerrar = {}, onCambiado = {}, onAjustes = {}, onInvitar = {}) }
        aparece("Casa")
        compose.onNodeWithText("Invitado").assertIsDisplayed()
        noHay("Invitar miembros")
    }

    @Test
    fun nuevoEspacioEntraEnElYEnseñaElTope() {
        respuestas["workspace.create"] = { r ->
            if (r.body!!.utf8().contains("Huerto")) respuestaTrpc("""{"id":"w9"}""")
            else errorTrpc(400, "BAD_REQUEST", "Ya tienes 20 espacios propios; borra alguno antes de crear otro.")
        }
        var creado = false
        conNavegador { NuevoEspacio(onCerrar = {}, onCreado = { creado = true }) }
        compose.onNode(hasSetTextAction()).performTextInput("Otro más")
        compose.onNodeWithText("Crear espacio").performClick()
        aparece("Ya tienes 20 espacios propios; borra alguno antes de crear otro.")
        assertFalse(creado)
        assertEquals("w1", Servicios.de(ctx).sesion.espacio)
        compose.onNode(hasSetTextAction()).performTextInput(" Huerto")
        compose.onNodeWithText("Crear espacio").performClick()
        esperaQue("no se creó") { creado }
        assertTrue(espera("workspace.create").contains("Otro más Huerto"))
        assertEquals("w9", Servicios.de(ctx).sesion.espacio)
    }

    // ---------------- Personas ----------------

    private val personas = """{
        "myRole":"owner","isOwner":true,"ownerId":"u1",
        "members":[
          {"userId":"u1","name":"Ana","email":"ana@example.com","role":"owner"},
          {"userId":"u2","name":"Luis","email":"luis@example.com","role":"editor"},
          {"userId":"u3","name":"Rocío","email":"rocio@example.com","role":"guest"}
        ],
        "invitaciones":[{"id":"i1","destino":"abuela","role":"viewer"}]
    }"""

    @Test
    fun elPropietarioInvitaAnulaTraspasaYConvierte() {
        responde("workspace.members", personas)
        responde("workspace.share", """{"pendiente":true}""")
        conNavegador { PantallaPersonas() }
        aparece("Luis")
        compose.onNodeWithText("Ana (tú)").assertIsDisplayed()
        compose.onNodeWithText("abuela").assertIsDisplayed()
        // Invitar como lector: queda pendiente hasta su primer inicio de sesión.
        compose.onNode(hasSetTextAction()).performTextInput("prima@example.com")
        compose.onNode(hasText("Lector") and hasClickAction()).performClick()
        compose.onNodeWithText("Invitar").performClick()
        assertEquals("""{"email":"prima@example.com","role":"viewer"}""", espera("workspace.share"))
        aparece("Invitación pendiente: entrará en el espacio la primera vez que inicie sesión con el NAS.")
        compose.onNodeWithText("Anular").performClick()
        assertEquals("""{"id":"i1"}""", espera("workspace.cancelInvite"))
        // Traspasar la propiedad, con su aviso.
        compose.onNodeWithText("Luis").performClick()
        aparece("Quitar del espacio")
        // La del menú (la fila de Ana también dice «Propietario del espacio», pero no se toca).
        compose.onNode(hasText("Propietario del espacio") and isEnabled() and hasClickAction()).performClick()
        aparece("¿Hacer a Luis propietario del espacio?")
        compose.onNodeWithText("Traspasar").performClick()
        assertEquals("""{"userId":"u2"}""", espera("workspace.transfer"))
        // Invitados: convertir en miembro.
        compose.onNode(hasText("Invitados · 1")).performClick()
        aparece("Rocío")
        compose.onNodeWithText("Rocío").performClick()
        compose.onNodeWithText("Convertir en miembro").performClick()
        aparece("¿Convertir a Rocío en miembro?")
        compose.onNodeWithText("Convertir").performClick()
        assertEquals("""{"userId":"u3","role":"editor"}""", espera("workspace.setRole"))
    }

    @Test
    fun unMiembroVePeroNoGestiona() {
        responde("workspace.members", personas.replace("\"myRole\":\"owner\",\"isOwner\":true", "\"myRole\":\"editor\",\"isOwner\":false").replace("\"invitaciones\":[{\"id\":\"i1\",\"destino\":\"abuela\",\"role\":\"viewer\"}]", "\"invitaciones\":[]"))
        conNavegador { PantallaPersonas() }
        aparece("Luis")
        noHay("Invitar")
        compose.onNodeWithText("Luis").performClick()
        compose.waitForIdle()
        noHay("Quitar del espacio")
    }

    // ---------------- Compartir una página ----------------

    @Test
    fun compartirInvitaConNivelYGestionaInvitados() {
        responde("pages.perms.get", """{"restricted":false,"nivel":"full","permisos":[],
            "invitados":[{"userId":"u3","level":"edit","name":"Rocío","email":"rocio@example.com"}],
            "pendientes":[{"id":"ip1","destino":"suegra","level":"view"}]}""")
        responde("pages.perms.invitar", """{"pendiente":true,"miembro":false}""")
        conNavegador { HojaCompartir("p1", publicada = false, onPublicar = {}, onCerrar = {}) }
        aparece("Rocío")
        compose.onNodeWithText("Pendiente · Ver").assertIsDisplayed()
        compose.onNode(hasSetTextAction()).performTextInput("suegro")
        compose.onNodeWithText("Comentar").performClick()
        compose.onNodeWithText("Invitar").performClick()
        assertEquals("""{"pageId":"p1","email":"suegro","level":"comment"}""", espera("pages.perms.invitar"))
        aparece("Invitación pendiente: verá la página cuando entre por primera vez con el NAS.")
        compose.onNodeWithText("Anular").performClick()
        assertEquals("""{"pageId":"p1","id":"ip1"}""", espera("pages.perms.anularInvitacion"))
        compose.onNodeWithText("Rocío").performClick()
        compose.onNodeWithText("Quitar acceso").performClick()
        assertEquals("""{"pageId":"p1","userId":"u3"}""", espera("pages.perms.remove"))
    }

    // ---------------- Menú de la página según el rol ----------------

    @Test
    fun elInvitadoNoTieneLoQueEsDelEspacio() {
        responde("auth.me", yo("guest", "w3", "Suegros"))
        Servicios.de(ctx).repo.cache.guarda(Servicios.de(ctx).repo.clave("auth.me"), json.parseToJsonElement(yo("guest", "w3", "Suegros")))
        conNavegador { MenuPagina(PaginaInfo("p1", title = "Viaje", nivel = "full"), onCerrar = {}, onComentarios = {}) }
        aparece("Historial de versiones")
        compose.onNodeWithText("Comentarios").assertIsDisplayed()
        for (t in listOf("Compartir", "Mover a…", "Duplicar", "Enviar a la papelera")) noHay(t)
    }

    @Test
    fun conAccesoTotalSeComparte() {
        responde("auth.me", yo("editor"))
        Servicios.de(ctx).repo.cache.guarda(Servicios.de(ctx).repo.clave("auth.me"), json.parseToJsonElement(yo("editor")))
        conNavegador { MenuPagina(PaginaInfo("p1", title = "Viaje", nivel = "full"), onCerrar = {}, onComentarios = {}) }
        aparece("Compartir")
        compose.onNodeWithText("Mover a…").assertExists()
    }

    // ---------------- «Mover a» otro espacio ----------------

    @Test
    fun moverAOtroEspacioDuplicaTrasConfirmar() {
        responde("auth.me", yo("owner"))
        responde("pages.tree", """[{"id":"p1","title":"Viaje","order":"a"},{"id":"p2","title":"Recetas","order":"b"}]""")
        responde("pages.arbolDe", """[{"id":"q1","title":"Proyectos","parentId":null}]""")
        responde("pages.copiarAEspacio", """{"id":"c1","workspaceId":"w2"}""")
        var cerrada = false
        conNavegador { HojaMover("p1") { cerrada = true } }
        aparece("Recetas")
        aparece("Espacio")
        compose.onNodeWithText("Espacio").performClick()
        aparece("Trabajo")
        // Donde eres invitado (o lector) no puedes dejar nada: no sale.
        noHay("Suegros")
        compose.onNodeWithText("Trabajo").performClick()
        aparece("Proyectos")
        assertEquals("""{"workspaceId":"w2"}""", espera("pages.arbolDe"))
        noHay("Recetas")
        compose.onNodeWithText("Proyectos").performClick()
        aparece("Entiendo, duplicar")
        compose.onNodeWithText("Entiendo, duplicar").performClick()
        assertEquals("""{"id":"p1","workspaceId":"w2","parentId":"q1"}""", espera("pages.copiarAEspacio"))
        esperaQue("no se cerró") { cerrada }
        // El original se queda y la app no cambia de espacio sola.
        assertNull(pedidas.find { it.first == "pages.move" })
        assertEquals("w1", Servicios.de(ctx).sesion.espacio)
    }
}
