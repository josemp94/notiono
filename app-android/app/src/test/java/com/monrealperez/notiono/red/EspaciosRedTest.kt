package com.monrealperez.notiono.red

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.datos.Cache
import com.monrealperez.notiono.datos.Cola
import com.monrealperez.notiono.datos.Repo
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import mockwebserver3.SocketEffect
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.util.Collections

/**
 * Varios espacios en la misma app (2.4.0): cada petición lleva el suyo, la caché de uno
 * no se enseña en otro y un cambio hecho sin red en un espacio llega a ese espacio
 * aunque luego se cambie de espacio.
 */
@RunWith(RobolectricTestRunner::class)
class EspaciosRedTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private lateinit var sesion: Sesion
    private lateinit var repo: Repo
    private val recibidas = Collections.synchronizedList(mutableListOf<Pair<String, String>>())
    @Volatile private var caido = false

    /** El espacio de la cookie notiono_ws de una petición. */
    private fun espacioDe(r: RecordedRequest) = Regex("notiono_ws=([\\w-]+)").find(r.headers["Cookie"].orEmpty())?.groupValues?.get(1) ?: "-"

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                // Sin red de verdad: se corta la conexión (un 503 sería un error del servidor).
                if (caido) return MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build()
                val ws = espacioDe(request)
                recibidas.add(request.url.encodedPath.removePrefix("/api/trpc/") to ws)
                // El árbol de cada espacio es otro: su única página se llama como el espacio.
                return respuestaTrpc(if (request.method == "POST") """{"ok":true}""" else """[{"id":"p-$ws","title":"Página de $ws"}]""")
            }
        }
        servidor.start()
        sesion = Sesion(ctx, "prueba")
        sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        val dir = File(ctx.filesDir, "prueba-espacios").apply { deleteRecursively(); mkdirs() }
        repo = Repo(Api(servidor.url("/").toString().trimEnd('/'), OkHttpClient(), sesion), Cache(dir), Cola(dir)) {}
    }

    @After
    fun cierra() {
        servidor.close()
        sesion.olvida()
    }

    private fun titulo(e: kotlinx.serialization.json.JsonElement) = (e as JsonArray)[0].jsonObject.str("title")

    @Test
    fun cadaEspacioTieneSuCacheYSuCookie() = runBlocking {
        sesion.espacio = "casa"
        assertEquals("Página de casa", titulo(repo.consulta("pages.tree")))
        sesion.espacio = "trabajo"
        assertEquals("Página de trabajo", titulo(repo.consulta("pages.tree")))
        assertEquals(listOf("pages.tree" to "casa", "pages.tree" to "trabajo"), recibidas.toList())
        // Sin red: lo guardado de cada espacio, nunca lo del otro.
        caido = true
        assertEquals("Página de trabajo", titulo(repo.consulta("pages.tree")))
        sesion.espacio = "casa"
        assertEquals("Página de casa", titulo(repo.consulta("pages.tree")))
        assertEquals("Página de casa", titulo(repo.cacheada("pages.tree")!!))
        assertEquals("Página de trabajo", titulo(repo.cacheada("pages.tree", espacio = "trabajo")!!))
        // Un espacio en el que nunca se entró no tiene nada guardado.
        sesion.espacio = "nuevo"
        assertNull(repo.cacheada("pages.tree"))
    }

    @Test
    fun unaLlamadaPuedeIrAOtroEspacioSinCambiarElActivo() = runBlocking {
        sesion.espacio = "casa"
        assertEquals("Página de trabajo", titulo(repo.fresca("pages.tree", espacio = "trabajo")))
        repo.mutacion("app.aplicar", objeto("id" to "x"), espacio = "trabajo")
        assertEquals(listOf("pages.tree" to "trabajo", "app.aplicar" to "trabajo"), recibidas.toList())
        assertEquals("casa", sesion.espacio)
    }

    @Test
    fun loDeLaColaVaAlEspacioEnElQueSeHizo() = runBlocking {
        sesion.espacio = "casa"
        caido = true
        assertNull(repo.mutacion("pages.rename", objeto("id" to "p-casa", "title" to "Sin red")))
        assertEquals("casa", repo.cola.pendientes().single().espacio)
        // Se cambia de espacio y vuelve la red: el cambio sale con la cookie de «casa».
        sesion.espacio = "trabajo"
        caido = false
        assertTrue(repo.vaciaCola())
        assertEquals(listOf("pages.rename" to "casa"), recibidas.toList())
    }

    @Test
    fun cerrarSesionOlvidaElEspacio() {
        sesion.espacio = "casa"
        assertEquals("casa", sesion.espacioFlujo.value)
        sesion.olvida()
        assertNull(sesion.espacioFlujo.value)
        assertNull(sesion.espacio)
    }
}
