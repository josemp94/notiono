package com.monrealperez.notiono.editor

import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.datos.Cache
import com.monrealperez.notiono.datos.Cola
import com.monrealperez.notiono.datos.Repo
import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.Sesion
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.red.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

/**
 * Un Notiono de mentira con las mismas reglas que el de verdad para el cuerpo de las
 * páginas: `app.bloques` con huella y `app.aplicar` con operaciones por bloque
 * (aplicadas como `aplicarOpsJson` del servidor). Permite cambiar el documento «desde
 * otro dispositivo» entre medias.
 */
class ServidorDePrueba : Dispatcher() {
    @Volatile var doc: List<JsonObject> = emptyList()
    @Volatile var caido = false
    val operaciones = mutableListOf<List<JsonObject>>()
    private fun huella() = doc.toString().hashCode().toString()

    override fun dispatch(request: RecordedRequest): MockResponse {
        if (caido) return MockResponse.Builder().code(503).build()
        val ruta = request.url.encodedPath.removePrefix("/api/trpc/")
        return when (ruta) {
            "app.bloques" -> {
                val input = json.parseToJsonElement(request.url.queryParameter("input")!!).jsonObject["json"]!!.jsonObject
                val igual = input.str("huella") == huella()
                respuestaTrpc("""{"huella":"${huella()}","bloques":${if (igual) "null" else JsonArray(doc).toString()}}""")
            }
            "app.aplicar" -> {
                val ops = json.parseToJsonElement(request.body!!.utf8()).jsonObject["json"]!!.jsonObject["ops"]!!.jsonArray.map { it.jsonObject }
                synchronized(this) {
                    operaciones.add(ops)
                    doc = Diff.aplica(doc, ops)
                }
                respuestaTrpc("""{"huella":"${huella()}","bloques":${JsonArray(doc)}}""")
            }
            else -> MockResponse.Builder().code(404).build()
        }
    }
}

@RunWith(RobolectricTestRunner::class)
class SincroTest {
    private lateinit var servidor: MockWebServer
    private val falso = ServidorDePrueba()
    private lateinit var repo: Repo
    private lateinit var dir: File
    private val pal = Paleta.clara

    private fun texto(id: String, t: String) = Bloque.nuevo(texto = t).let { Bloque(id, it.tipo, it.props, it.texto, null, it.resto).aJson() }

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = falso
        servidor.start()
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val sesion = Sesion(ctx, "prueba").apply { guarda(Canje("t", 0, UsuarioCanje("u", null, "a@b.c"))) }
        dir = File(ctx.filesDir, "sincro").apply { deleteRecursively(); mkdirs() }
        repo = Repo(Api(servidor.url("/").toString().trimEnd('/'), OkHttpClient(), sesion), Cache(dir), Cola(dir)) {}
        falso.doc = listOf(texto("a", "uno"), texto("b", "dos"), texto("c", "tres"))
    }

    @After
    fun cierra() = servidor.close()

    private fun nuevo(): Pair<EstadoEditor, Sincro> {
        val estado = EstadoEditor(pal, true)
        return estado to Sincro(Fuente("p1", esFila = false), estado, repo, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined))
    }

    private fun textos(bs: List<JsonObject>) = bs.map { Inline.textoPlano(it["content"]) }

    @Test
    fun loEscritoLlegaAlServidorComoOperaciones() = runBlocking {
        val (estado, sincro) = nuevo()
        sincro.abre()
        assertEquals(listOf("uno", "dos", "tres"), textos(estado.json()))
        estado.busca("b")!!.texto!!.append(" y medio")
        estado.texto(estado.busca("b")!!)
        estado.enter(estado.busca("c")!!, 4)
        sincro.envia()
        assertEquals(listOf("uno", "dos y medio", "tres", ""), textos(falso.doc))
        // Solo se manda lo que cambió: el bloque «a» ni se menciona.
        assertTrue(falso.operaciones.last().none { (it["block"] as? JsonObject)?.str("id") == "a" || it.str("id") == "a" })
        assertEquals(EstadoGuardado.Guardado, sincro.guardado)
    }

    @Test
    fun loDeFueraSeAdoptaPorBloques() = runBlocking {
        val (estado, sincro) = nuevo()
        sincro.abre()
        val a = estado.busca("a")
        // Otro dispositivo cambia «b».
        falso.doc = listOf(falso.doc[0], texto("b", "dos (de otro)"), falso.doc[2])
        sincro.refresca()
        assertEquals(listOf("uno", "dos (de otro)", "tres"), textos(estado.json()))
        // «a» no cambió: es el mismo objeto (y el cursor de quien escribe en él, también).
        assertSame(a, estado.busca("a"))
    }

    @Test
    fun edicionConcurrenteEnOtroBloqueNoSePierde() = runBlocking {
        val (estado, sincro) = nuevo()
        sincro.abre()
        // Aquí se escribe en «a» y, sin haberse mandado, otro cambia «c».
        estado.busca("a")!!.texto!!.append("!")
        estado.texto(estado.busca("a")!!)
        falso.doc = listOf(falso.doc[0], falso.doc[1], texto("c", "tres (de otro)"))
        // Con algo local sin mandar, lo de fuera no se adopta todavía (lo local manda)...
        sincro.refresca()
        assertEquals("uno!", Inline.textoPlano(estado.json()[0]["content"]))
        // ...y al mandar quedan los dos cambios, aquí y en el servidor.
        sincro.envia()
        assertEquals(listOf("uno!", "dos", "tres (de otro)"), textos(falso.doc))
        assertEquals(listOf("uno!", "dos", "tres (de otro)"), textos(estado.json()))
    }

    @Test
    fun sinRedSeGuardaEnElMovilYSeMandaAlVolver() = runBlocking {
        val (estado, sincro) = nuevo()
        sincro.abre()
        falso.caido = true
        servidor.close()
        estado.busca("a")!!.texto!!.append(" sin red")
        estado.texto(estado.busca("a")!!)
        sincro.envia()
        assertEquals(EstadoGuardado.Pendiente, sincro.guardado)
        assertEquals(1, repo.cola.pendientes().size)
        // Android cierra la app: al volver a abrir la página sale lo escrito sin red.
        val (estado2, sincro2) = nuevo()
        sincro2.abre()
        assertEquals("uno sin red", Inline.textoPlano(estado2.json()[0]["content"]))
        // Vuelve la red: la cola lo manda y el servidor lo tiene.
        val otro = MockWebServer()
        falso.caido = false
        otro.dispatcher = falso
        otro.start()
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val repo2 = Repo(Api(otro.url("/").toString().trimEnd('/'), OkHttpClient(), Sesion(ctx, "prueba")), Cache(dir), Cola(dir)) {}
        assertTrue(repo2.vaciaCola())
        assertEquals("uno sin red", Inline.textoPlano(falso.doc[0]["content"]))
        otro.close()
    }
}
