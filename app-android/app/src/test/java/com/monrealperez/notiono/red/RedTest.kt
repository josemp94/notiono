package com.monrealperez.notiono.red

import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.datos.Cache
import com.monrealperez.notiono.datos.Cola
import com.monrealperez.notiono.datos.Repo
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

/** Lo que el servidor de prueba responde, como tRPC con superjson. */
fun respuestaTrpc(dato: String) = MockResponse.Builder().code(200).body("""{"result":{"data":{"json":$dato,"meta":{"values":{}}}}}""").build()
fun errorTrpc(http: Int, codigo: String, mensaje: String) = MockResponse.Builder().code(http)
    .body("""{"error":{"json":{"message":"$mensaje","code":-32001,"data":{"code":"$codigo","httpStatus":$http}}}}""").build()

@RunWith(RobolectricTestRunner::class)
class RedTest {
    private lateinit var servidor: MockWebServer
    private lateinit var sesion: Sesion
    private lateinit var api: Api

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.start()
        sesion = Sesion(ApplicationProvider.getApplicationContext(), "prueba")
        sesion.guarda(Canje("tok123", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        api = Api(servidor.url("/").toString().trimEnd('/'), OkHttpClient(), sesion)
    }

    @After
    fun cierra() {
        servidor.close()
        sesion.olvida()
    }

    @Test
    fun consultaYMutacionConSuperjsonYLaCookieDeSesion() = runBlocking {
        servidor.enqueue(respuestaTrpc("""{"id":"p1","createdAt":"2026-10-18T10:00:00.000Z"}"""))
        val r = api.query("app.pagina", objeto("id" to "p1")).jsonObject
        assertEquals("p1", r.str("id"))
        val q = servidor.takeRequest()
        assertEquals("GET", q.method)
        assertEquals("/api/trpc/app.pagina", q.url.encodedPath)
        assertEquals("""{"json":{"id":"p1"}}""", q.url.queryParameter("input"))
        assertTrue(q.headers["Cookie"]!!.contains("notiono_session=tok123"))

        servidor.enqueue(respuestaTrpc("""{"ok":true}"""))
        api.mutation("pages.rename", objeto("id" to "p1", "title" to "Hola"))
        val m = servidor.takeRequest()
        assertEquals("POST", m.method)
        assertEquals("""{"json":{"id":"p1","title":"Hola"}}""", m.body!!.utf8())
    }

    @Test
    fun erroresTipados() = runBlocking {
        servidor.enqueue(errorTrpc(401, "UNAUTHORIZED", "No autenticado."))
        try { api.query("auth.me"); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.NoAutorizado, e.tipo) }
        servidor.enqueue(errorTrpc(404, "NOT_FOUND", "No existe"))
        try { api.query("app.pagina", objeto("id" to "x")); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.NoEncontrado, e.tipo) }
        servidor.enqueue(errorTrpc(400, "BAD_REQUEST", "Mal"))
        try { api.mutation("x.y"); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.Peticion, e.tipo); assertEquals("Mal", e.message) }
        servidor.close()
        try { api.query("auth.me"); fail() } catch (e: ErrorApi) { assertTrue(e.sinConexion) }
    }

    @Test
    fun respuestasRarasSonErrorApiYNoCierranLaApp() = runBlocking {
        // La página del proxy con un 200 (o un JSON con otra forma) al canjear el código del
        // SSO, al subir, en una ruta propia y al mirar la versión: siempre ErrorApi, que es lo
        // único que capturan las pantallas (MainActivity solo captura ErrorApi al entrar).
        val html = { MockResponse.Builder().code(200).body("<html>Synology</html>").build() }
        servidor.enqueue(html())
        try { api.canjear("c", "v"); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.Servidor, e.tipo) }
        servidor.enqueue(MockResponse.Builder().code(200).body("""{"token":"t"}""").build())
        try { api.canjear("c", "v"); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.Servidor, e.tipo) }
        servidor.enqueue(html())
        try { api.subir(ByteArray(3), "a.txt", "text/plain"); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.Servidor, e.tipo) }
        servidor.enqueue(html())
        try { api.getJson("/api/geo?q=x"); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.Servidor, e.tipo) }
        servidor.enqueue(MockResponse.Builder().code(200).body("{}").build())
        try { api.versionPublicada(); fail() } catch (e: ErrorApi) { assertEquals(ErrorApi.Tipo.Servidor, e.tipo) }
        // Y sin servidor, «sin conexión» en todas.
        servidor.close()
        try { api.canjear("c", "v"); fail() } catch (e: ErrorApi) { assertTrue(e.sinConexion) }
        try { api.postJson("/api/app/registro", JsonObject(emptyMap())); fail() } catch (e: ErrorApi) { assertTrue(e.sinConexion) }
    }

    @Test
    fun sinConexionSeLeeLaCacheYLosCambiosVanALaCola() = runBlocking {
        val dir = File(ApplicationProvider.getApplicationContext<android.content.Context>().filesDir, "prueba-cola").apply { deleteRecursively(); mkdirs() }
        val repo = Repo(api, Cache(dir), Cola(dir)) {}
        // Con red: se guarda la respuesta.
        servidor.enqueue(respuestaTrpc("""[{"id":"p1","title":"Uno"}]"""))
        repo.consulta("pages.tree")
        // Sin red: se lee lo guardado y lo que se cambia se encola, en orden.
        val recibidas = mutableListOf<String>()
        var caido = true
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (caido) return MockResponse.Builder().code(503).body("caído").build()
                recibidas.add(request.url.encodedPath.removePrefix("/api/trpc/") + ":" + request.body!!.utf8())
                return respuestaTrpc("""{"ok":true}""")
            }
        }
        servidor.close()
        assertEquals("Uno", repo.consulta("pages.tree").let { (it as kotlinx.serialization.json.JsonArray)[0].jsonObject.str("title") })
        assertNull(repo.mutacion("pages.rename", objeto("id" to "p1", "title" to "A")))
        assertNull(repo.mutacion("pages.rename", objeto("id" to "p1", "title" to "B")))
        assertEquals(2, repo.cola.pendientes().size)
        // Vuelve la red: salen en el mismo orden y la cola queda vacía.
        val otro = MockWebServer()
        otro.dispatcher = servidor.dispatcher
        caido = false
        otro.start()
        val repo2 = Repo(Api(otro.url("/").toString().trimEnd('/'), OkHttpClient(), sesion), Cache(dir), Cola(dir)) {}
        // Con cambios en cola, uno nuevo va detrás aunque haya red.
        assertNull(repo2.mutacion("pages.rename", objeto("id" to "p1", "title" to "C")))
        assertTrue(repo2.vaciaCola())
        assertEquals(listOf("A", "B", "C"), recibidas.map { json.parseToJsonElement(it.substringAfter(":")).jsonObject["json"]!!.jsonObject.str("title") })
        assertTrue(repo2.cola.estaVacia())
        otro.close()
    }

    @Test
    fun loQueElServidorRechazaNoSeQuedaEnLaCola() = runBlocking {
        val dir = File(ApplicationProvider.getApplicationContext<android.content.Context>().filesDir, "prueba-cola2").apply { deleteRecursively(); mkdirs() }
        val cola = Cola(dir)
        cola.añade(com.monrealperez.notiono.datos.Pendiente(ruta = "pages.rename", input = JsonObject(mapOf("id" to JsonPrimitive("borrada")))))
        cola.añade(com.monrealperez.notiono.datos.Pendiente(ruta = "pages.rename", input = JsonObject(mapOf("id" to JsonPrimitive("p1")))))
        servidor.enqueue(errorTrpc(404, "NOT_FOUND", "No existe"))
        servidor.enqueue(respuestaTrpc("""{"ok":true}"""))
        val repo = Repo(api, Cache(dir), cola) {}
        assertTrue(repo.vaciaCola())
        assertTrue(cola.estaVacia())
    }
}
