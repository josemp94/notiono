package com.monrealperez.notiono

import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.datos.Cache
import com.monrealperez.notiono.datos.Cola
import com.monrealperez.notiono.datos.Repo
import com.monrealperez.notiono.editor.EstadoEditor
import com.monrealperez.notiono.editor.Fuente
import com.monrealperez.notiono.editor.Inline
import com.monrealperez.notiono.editor.Paleta
import com.monrealperez.notiono.editor.Sincro
import com.monrealperez.notiono.red.Acceso
import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.Sesion
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

/**
 * La app contra un Notiono DE VERDAD en local, con su propia capa de red, su editor y su
 * sincronía. La lanza `scripts/integracion-android.ts`, que levanta el SSO falso, prepara
 * la página y tiene un navegador conectado por Yjs escribiendo en otro bloque mientras
 * tanto. Sin `-Pnotiono.integracion=<url>` se salta.
 */
@RunWith(RobolectricTestRunner::class)
class IntegracionTest {
    private val base = System.getProperty("notiono.integracion").orEmpty()
    private val paginaNavegador = System.getProperty("notiono.pagina").orEmpty()

    /** La Custom Tab: recorre las redirecciones del SSO hasta `notiono://auth?code=…`. */
    private fun recorreSso(http: OkHttpClient, inicio: String): String {
        var url = inicio
        val cookies = mutableListOf<String>()
        repeat(5) {
            val res = http.newCall(Request.Builder().url(url).header("Cookie", cookies.joinToString("; ")).build()).execute()
            res.use { r ->
                cookies += r.headers("Set-Cookie").map { it.substringBefore(';') }
                val destino = r.header("Location") ?: error("el SSO no redirige (${r.code})")
                if (destino.startsWith("notiono://")) return destino
                url = destino
            }
        }
        error("demasiadas redirecciones")
    }

    @Test
    fun laAppContraNotionoDeVerdad() = runBlocking {
        assumeTrue("sin Notiono local (scripts/integracion-android.ts)", base.isNotEmpty())
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val sesion = Sesion(ctx, "integracion").apply { olvida() }
        val http = OkHttpClient.Builder().followRedirects(false).build()
        val api = Api(base, http, sesion)
        val dir = File(ctx.filesDir, "integracion").apply { deleteRecursively(); mkdirs() }
        val repo = Repo(api, Cache(dir), Cola(dir)) {}

        // --- Inicio de sesión: SSO + PKCE, canje del código ---
        val verificador = Acceso.nuevoVerificador()
        val vuelta = Uri.parse(recorreSso(http, Acceso.urlInicio(base, verificador).toString()))
        val codigo = Acceso.codigoDe(vuelta)!!
        sesion.guarda(api.canjear(codigo, verificador))
        assertEquals("ana@example.com", repo.consulta("auth.me").comoObjeto.str("email"))

        // --- Páginas y filas ---
        val pagina = repo.mutacion("pages.create", objeto("title" to "Desde Android"), encolable = false)!!.comoObjeto.str("id")!!
        assertTrue(repo.consulta("pages.tree", cachear = false).toString().contains(pagina))
        val bd = repo.mutacion("db.create", objeto("title" to "Compra"), encolable = false)!!.comoObjeto.str("id")!!
        var vista = repo.consulta("app.vista", objeto("pageId" to bd), cachear = false).comoObjeto
        val coleccion = vista.obj("collection")!!.str("id")!!
        val titulo = vista.objs("fields").first { it.str("type") == "text" }.str("id")!!
        val fila = repo.mutacion("db.addRecord", objeto("collectionId" to coleccion), encolable = false)!!.comoObjeto.str("id")!!
        repo.mutacion("db.updateCell", objeto("recordId" to fila, "fieldId" to titulo, "value" to "Leche"))
        vista = repo.consulta("app.vista", objeto("pageId" to bd, "q" to "lech"), cachear = false).comoObjeto
        assertEquals(listOf(fila), vista.objs("filas").map { it.str("id") })
        assertEquals("Leche", vista.objs("filas")[0].obj("textos")!!.str(titulo))

        // --- Editor: la página que el navegador tiene abierta y en la que escribe sin parar ---
        if (paginaNavegador.isNotEmpty()) {
            val estado = EstadoEditor(Paleta.clara, true)
            val sincro = Sincro(Fuente(paginaNavegador, esFila = false), estado, repo, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined))
            sincro.abre()
            val y = estado.busca("y")!!
            y.texto!!.replace(0, y.texto!!.length, "la app escribió esto desde Android")
            estado.texto(y)
            sincro.envia()
            // Mientras, el navegador sigue tecleando en «x»: lo suyo llega aquí y lo nuestro se queda.
            delay(1500)
            sincro.refresca()
            val textos = estado.json().map { Inline.textoPlano(it["content"]) }
            assertTrue("lo del navegador llega a la app: $textos", textos[0].startsWith("del navegador·"))
            assertEquals("la app escribió esto desde Android", textos[1])
            val servidor = repo.consulta("app.bloques", objeto("id" to paginaNavegador), cachear = false).comoObjeto.arr("bloques")!!
            assertEquals("la app escribió esto desde Android", Inline.textoPlano(servidor[1].comoObjeto["content"]))
        }
    }
}
