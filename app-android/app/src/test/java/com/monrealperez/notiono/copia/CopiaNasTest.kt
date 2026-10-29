package com.monrealperez.notiono.copia

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.datos.Registro
import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.Sesion
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.respuestaTrpc
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.net.URLDecoder
import java.util.Base64
import java.util.concurrent.CopyOnWriteArrayList

/** Lo que llega al DSM simulado: api, método y campos (de la URL, del formulario o del multipart, en orden). */
data class PeticionDsm(val api: String, val metodo: String, val campos: Map<String, String>, val orden: List<String>)

/**
 * La copia en el NAS de punta a punta contra un Notiono y un Synology DSM simulados (un solo
 * MockWebServer: `/api/trpc/…` es Notiono y `/drive/webapi/entry.cgi` es el NAS).
 */
@RunWith(RobolectricTestRunner::class)
class CopiaNasTest {
    private val ctx: Context = ApplicationProvider.getApplicationContext()
    private lateinit var servidor: MockWebServer
    private lateinit var sesion: Sesion
    private lateinit var registro: Registro
    private lateinit var copia: CopiaNas

    // El NAS simulado.
    private val archivos = mutableSetOf<String>()
    private val dsm = CopyOnWriteArrayList<PeticionDsm>()
    private var pass = "secreta-123"
    private var exigeCodigo = false
    private val dids = mutableSetOf<String>()
    private var fallaSubidaN: Int? = null

    // Notiono simulado.
    private val trpc = CopyOnWriteArrayList<RecordedRequest>()
    private var arbol = ArbolCopia()

    /** Cifrado de mentira (en Robolectric no hay AndroidKeyStore), pero que no deja el texto en claro. */
    private val cifrador = object : Cifrador {
        override fun cifra(datos: ByteArray) = ByteArray(datos.size) { (datos[it].toInt() xor 0x5A).toByte() }
        override fun descifra(datos: ByteArray) = cifra(datos)
    }

    private val ESPACIOS = """[
        {"id":"w1","name":"Privado","isOwner":true,"rol":"owner","compartido":false,"miembros":1},
        {"id":"w2","name":"Familia","isOwner":false,"rol":"editor","compartido":true,"miembros":3},
        {"id":"w3","name":"Ajeno","isOwner":false,"rol":"guest","compartido":true,"miembros":2}
    ]"""

    private fun ok(data: String = "{}") = MockResponse.Builder().code(200).body("""{"success":true,"data":$data}""").build()
    private fun mal(codigo: Int) = MockResponse.Builder().code(200).body("""{"success":false,"error":{"code":$codigo}}""").build()

    private fun campos(r: RecordedRequest): Pair<Map<String, String>, List<String>> {
        val texto = r.body?.utf8().orEmpty()
        val desdeUrl = r.url.queryParameterNames.associateWith { r.url.queryParameter(it).orEmpty() }
        if (r.headers["Content-Type"]?.startsWith("multipart") == true) {
            val partes = Regex("""name="([^"]+)"(?:; filename="([^"]*)")?\r\n(?:[^\r\n]+\r\n)*\r\n(.*?)\r\n--""", RegexOption.DOT_MATCHES_ALL).findAll(texto).toList()
            val m = partes.associate { it.groupValues[1] to it.groupValues[3] } + partes.filter { it.groupValues[2].isNotEmpty() }.associate { "filename" to it.groupValues[2] }
            return (desdeUrl + m) to partes.map { it.groupValues[1] }
        }
        val form = texto.split("&").filter { it.isNotEmpty() }.associate {
            val kv = it.split("=", limit = 2)
            URLDecoder.decode(kv[0], "UTF-8") to URLDecoder.decode(kv.getOrElse(1) { "" }, "UTF-8")
        }
        return (desdeUrl + form) to form.keys.toList()
    }

    private fun nas(r: RecordedRequest): MockResponse {
        val (c, orden) = campos(r)
        dsm += PeticionDsm(c["api"].orEmpty(), c["method"].orEmpty(), c, orden)
        return when (c["api"] to c["method"]) {
            "SYNO.API.Auth" to "login" -> when {
                c["passwd"] != pass -> mal(400)
                c["otp_code"] != null -> if (c["otp_code"] == "123456") ok("""{"sid":"sid-1","did":"did-1"}""").also { dids += "did-1" } else mal(404)
                exigeCodigo && c["device_id"] !in dids -> mal(403)
                else -> ok("""{"sid":"sid-1"}""")
            }
            "SYNO.API.Auth" to "logout" -> ok()
            "SYNO.FileStation.Upload" to "upload" -> {
                if (c["_sid"] != "sid-1") return mal(119)
                if (fallaSubidaN == dsm.count { it.metodo == "upload" }) return mal(416)
                archivos += c["path"] + "/" + c["filename"]
                ok()
            }
            "SYNO.FileStation.Delete" to "delete" -> {
                val ruta = json.parseToJsonElement(c["path"]!!).let { (it as JsonArray)[0].jsonPrimitive.content }
                if (archivos.remove(ruta)) ok() else mal(408)
            }
            else -> mal(101)
        }
    }

    private fun notiono(r: RecordedRequest): MockResponse {
        trpc += r
        val input = r.url.queryParameter("input")?.let { json.parseToJsonElement(it).jsonObject["json"] as JsonObject }
        return when (r.url.encodedPath.removePrefix("/api/trpc/")) {
            "workspace.list" -> respuestaTrpc(ESPACIOS)
            "app.arbolCopia" -> respuestaTrpc(json.encodeToString(ArbolCopia.serializer(), arbol))
            "app.exportarWord" -> {
                val id = input!!["id"]!!.jsonPrimitive.content + (input["recordId"]?.let { "/" + it.jsonPrimitive.content } ?: "")
                respuestaTrpc("""{"nombre":"x.docx","base64":"${Base64.getEncoder().encodeToString("word de $id".toByteArray())}"}""")
            }
            "app.informaCopia" -> respuestaTrpc("""{"ok":true}""")
            else -> MockResponse.Builder().code(404).build()
        }
    }

    @Before
    fun prepara() {
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) =
                if (request.url.encodedPath.startsWith("/drive/")) nas(request) else notiono(request)
        }
        servidor.start()
        sesion = Sesion(ctx, "prueba")
        sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        registro = Registro(ctx.filesDir, ctx.getSharedPreferences("registro-copia", Context.MODE_PRIVATE))
        val http = OkHttpClient()
        copia = CopiaNas(ctx, cifrador, Api(servidor.url("/").toString().trimEnd('/'), http, sesion), http, registro)
        arbol = ArbolCopia(
            paginas = listOf(
                PaginaCopia("p1", null, "Notas", "doc", "t1"),
                PaginaCopia("p2", null, "Proyecto", "doc", "t1"),
                PaginaCopia("p3", "p2", "Tareas", "database", "t1"),
                PaginaCopia("p4", null, "Diario", "doc", "t1"),
            ),
            filas = listOf(FilaCopia("r1", "p3", "Comprar pan", "t1"), FilaCopia("r2", "p3", "Llamar", "t1")),
        )
    }

    @After
    fun cierra() {
        runBlocking { copia.desconecta() }
        servidor.close()
        sesion.olvida()
        File(ctx.filesDir, "registro.jsonl").delete()
    }

    private val conf get() = ConfigCopia(servidor = servidor.url("/drive/").toString(), carpeta = "/home/Notiono", usuario = "ana")
    private val B = "/home/Notiono/Privado"
    private val TODO = setOf("$B/Notas.docx", "$B/Proyecto/Proyecto.docx", "$B/Proyecto/Tareas/Comprar pan.docx", "$B/Proyecto/Tareas/Llamar.docx", "$B/Diario.docx")

    private fun subidas() = dsm.filter { it.metodo == "upload" }.map { it.campos["path"] + "/" + it.campos["filename"] }
    /** Lo que se mandó borrar (de una en una: un array JSON de un elemento). */
    private fun borrados() = dsm.filter { it.metodo == "delete" }.map { (json.parseToJsonElement(it.campos["path"]!!) as JsonArray).single().jsonPrimitive.content }
    private fun informes() = trpc.filter { it.url.encodedPath.endsWith("app.informaCopia") }.map { json.parseToJsonElement(it.body!!.utf8()).jsonObject["json"]!!.jsonObject }

    private fun conectaYCopia(): String? = runBlocking {
        copia.conecta(conf, pass)
        dsm.clear()
        copia.copia()
    }

    @Test
    fun primeraCopiaSubeTodoYLaSegundaNada() = runBlocking {
        assertNull(conectaYCopia())
        assertEquals(TODO, subidas().toSet())
        assertEquals(5, subidas().size)
        assertEquals(TODO, archivos)
        // Solo el espacio propio sin compartir (el compartido y el de invitado, no).
        val pedidos = trpc.filter { it.url.encodedPath.endsWith("app.arbolCopia") }
        assertTrue(pedidos.all { it.headers["Cookie"]!!.contains("notiono_ws=w1") })
        // Cada Word, de su página o de su fila, en su espacio.
        val words = trpc.filter { it.url.encodedPath.endsWith("app.exportarWord") }
        assertTrue(words.all { it.headers["Cookie"]!!.contains("notiono_ws=w1") })
        assertTrue(words.any { it.url.queryParameter("input") == """{"json":{"id":"p3","recordId":"r1"}}""" })
        assertTrue(words.any { it.url.queryParameter("input") == """{"json":{"id":"p1"}}""" })
        // Entra, sube y sale.
        assertEquals("login", dsm.first().metodo)
        assertEquals("logout", dsm.last().metodo)

        val i = informes().last()
        assertEquals(true, i["activa"]!!.jsonPrimitive.content.toBoolean())
        assertEquals(5, i["paginas"]!!.jsonPrimitive.content.toInt())
        assertEquals("/home/Notiono", i["carpeta"]!!.jsonPrimitive.content)
        assertTrue(copia.estado().ultima != null)

        dsm.clear()
        assertNull(copia.copia())
        assertTrue(subidas().isEmpty())
        assertTrue(borrados().isEmpty())
    }

    @Test
    fun editarUnaSubeSoloEsa() = runBlocking {
        conectaYCopia()
        arbol = arbol.copy(filas = arbol.filas.map { if (it.id == "r2") it.copy(editada = "t2") else it })
        dsm.clear()
        assertNull(copia.copia())
        assertEquals(listOf("$B/Proyecto/Tareas/Llamar.docx"), subidas())
        assertTrue(borrados().isEmpty())
    }

    @Test
    fun renombrarMoverYBorrarSoloBorraLoSuyo() = runBlocking {
        archivos += "$B/ajeno.docx"
        archivos += "$B/Proyecto"
        conectaYCopia()
        val subidasAntes = archivos.toSet()
        // Renombrar una, mover otra dentro de Proyecto y borrar una tercera.
        arbol = arbol.copy(
            paginas = arbol.paginas.mapNotNull {
                when (it.id) {
                    "p1" -> it.copy(titulo = "Notas viejas")
                    "p4" -> it.copy(parentId = "p2")
                    else -> it
                }
            },
            filas = arbol.filas.filter { it.id != "r2" },
        )
        dsm.clear()
        assertNull(copia.copia())
        assertEquals(setOf("$B/Notas viejas.docx", "$B/Proyecto/Diario.docx"), subidas().toSet())
        assertEquals(setOf("$B/Notas.docx", "$B/Diario.docx", "$B/Proyecto/Tareas/Llamar.docx"), borrados().toSet())
        // Primero sube lo nuevo y después borra lo viejo.
        assertTrue(dsm.indexOfLast { it.metodo == "upload" } < dsm.indexOfFirst { it.metodo == "delete" })
        // Nunca una carpeta ni algo que no subió ella.
        assertTrue(borrados().all { it.endsWith(".docx") && it in subidasAntes })
        assertTrue("$B/ajeno.docx" in archivos)
        assertTrue("$B/Proyecto" in archivos)
        assertTrue(copia.estado().porBorrar.isEmpty())
        assertEquals(4, copia.estado().subidos.size)
    }

    @Test
    fun siLoBorradoYaNoEstabaSigue() = runBlocking {
        conectaYCopia()
        archivos.remove("$B/Diario.docx")
        arbol = arbol.copy(paginas = arbol.paginas.filter { it.id != "p4" })
        dsm.clear()
        assertNull(copia.copia())
        assertEquals(listOf("$B/Diario.docx"), borrados())
        assertTrue(copia.estado().porBorrar.isEmpty())
        assertFalse(copia.estado().subidos.containsKey("p4"))
    }

    @Test
    fun siFallaAMitadLaSiguienteSigueDondeSeQuedo() = runBlocking {
        runBlocking { copia.conecta(conf, pass) }
        dsm.clear()
        fallaSubidaN = 3
        val error = copia.copia()
        assertEquals("No queda espacio en el NAS (o se ha llegado a la cuota)", error)
        assertEquals(2, copia.estado().subidos.size)
        assertEquals(error, copia.estado().error)
        assertEquals(error, informes().last()["error"]!!.jsonPrimitive.content)
        assertEquals("logout", dsm.last().metodo)
        fallaSubidaN = null
        dsm.clear()
        assertNull(copia.copia())
        assertEquals(3, subidas().size)
        assertEquals(TODO, archivos)
        assertNull(copia.estado().error)
    }

    @Test
    fun verificacionEnDosPasosGuardaElTokenDelDispositivo() = runBlocking {
        exigeCodigo = true
        try {
            copia.conecta(conf, pass)
            fail()
        } catch (e: ErrorCopia) {
            assertTrue(e.pideCodigo)
            assertEquals("El NAS pide el código de verificación en dos pasos", e.message)
        }
        assertFalse(copia.activa())
        try {
            copia.conecta(conf, pass, "000000")
            fail()
        } catch (e: ErrorCopia) {
            assertTrue(e.pideCodigo)
            assertEquals("El código de verificación no es correcto", e.message)
        }
        copia.conecta(conf, pass, "123456")
        val conCodigo = dsm.last { it.metodo == "login" }
        assertEquals("123456", conCodigo.campos["otp_code"])
        assertEquals("yes", conCodigo.campos["enable_device_token"])
        assertEquals("Notiono Android", conCodigo.campos["device_name"])
        assertEquals("3", conCodigo.campos["version"])
        assertEquals("FileStation", conCodigo.campos["session"])
        assertEquals("sid", conCodigo.campos["format"])
        // La siguiente entrada (la copia de fondo) no pide código: manda el token.
        dsm.clear()
        assertNull(copia.copia())
        val siguiente = dsm.first { it.metodo == "login" }
        assertEquals("did-1", siguiente.campos["device_id"])
        assertNull(siguiente.campos["otp_code"])
        assertEquals(5, subidas().size)
        // El token tampoco queda en claro.
        assertFalse(File(ctx.noBackupFilesDir, "copia-nas.secreto").readText().contains("did-1"))
    }

    @Test
    fun contraseñaMalaEnCristianoYNoGuardaNada() = runBlocking {
        try {
            copia.conecta(conf, "otra")
            fail()
        } catch (e: ErrorCopia) {
            assertFalse(e.pideCodigo)
            assertEquals("Usuario o contraseña del NAS incorrectos", e.message)
        }
        assertFalse(copia.activa())
        assertFalse(File(ctx.noBackupFilesDir, "copia-nas.secreto").exists())
        // Si cambia en el NAS después de conectar, la copia lo dice igual.
        copia.conecta(conf, pass)
        pass = "cambiada"
        assertEquals("Usuario o contraseña del NAS incorrectos", copia.copia())
        assertEquals("Usuario o contraseña del NAS incorrectos", informes().last()["error"]!!.jsonPrimitive.content)
    }

    @Test
    fun laContraseñaNoSaleDelMovil() = runBlocking {
        conectaYCopia()
        pass = "cambiada"
        copia.copia()
        // Ni a Notiono (ni la contraseña, ni el usuario, ni el servidor del NAS)…
        for (r in trpc) {
            val todo = r.url.toString() + (r.body?.utf8() ?: "") + r.headers.toString()
            assertFalse(todo.contains("secreta-123"))
            assertFalse(todo.contains("/drive"))
            assertFalse(todo.contains("\"usuario\"") || todo.contains("account"))
        }
        assertEquals(setOf("activa", "ultima", "paginas", "error", "carpeta"), informes().last().keys)
        // …ni al registro de diagnóstico (que tampoco lleva títulos ni rutas)…
        val eventos = registro.eventos().filter { it.tipo == "copia" }
        assertEquals(listOf("copia nas: 5 subidas, 0 borradas", "copia nas: 0 subidas, 0 borradas, error nas 400"), eventos.map { it.mensaje })
        // …ni en claro en el móvil, ni en la URL de entrada.
        val nuestros = ctx.noBackupFilesDir.listFiles()!!.filter { it.name.startsWith("copia-nas") }
        assertEquals(3, nuestros.size)
        for (f in nuestros) assertFalse(f.name, f.readText().contains("secreta-123"))
        assertTrue(dsm.filter { it.metodo == "login" }.all { "passwd" in it.orden })
    }

    @Test
    fun laSubidaLlevaLosCamposYElArchivoAlFinal() = runBlocking {
        conectaYCopia()
        val s = dsm.first { it.metodo == "upload" }
        assertEquals("2", s.campos["version"])
        assertEquals("sid-1", s.campos["_sid"])
        assertEquals(listOf("path", "create_parents", "overwrite", "file"), s.orden)
        assertEquals("true", s.campos["create_parents"])
        assertEquals("true", s.campos["overwrite"])
        assertEquals("word de p1", s.campos["file"])
        val borrado = run {
            arbol = arbol.copy(paginas = arbol.paginas.filter { it.id != "p1" })
            copia.copia()
            dsm.last { it.metodo == "delete" }
        }
        assertEquals("2", borrado.campos["version"])
        assertEquals("""["$B/Notas.docx"]""", borrado.campos["path"])
        assertEquals("false", borrado.campos["recursive"])
    }

    @Test
    fun espaciosElegidosUnaCarpetaPorEspacio() = runBlocking {
        conectaYCopia()
        copia.guardaEspacios(listOf("w1", "w2", "w3"))
        dsm.clear()
        assertNull(copia.copia())
        // El compartido se añade en su carpeta; el de invitado nunca; lo de Privado no se resube.
        assertEquals(TODO.map { it.replace("/Privado/", "/Familia/") }.toSet(), subidas().toSet())
        // Quitar un espacio de la copia no borra lo que se subió de él.
        copia.guardaEspacios(listOf("w2"))
        dsm.clear()
        assertNull(copia.copia())
        assertTrue(borrados().isEmpty())
    }

    @Test
    fun desconectarLoBorraTodo() = runBlocking {
        conectaYCopia()
        copia.trasEditar()
        val wm = WorkManager.getInstance(ctx)
        assertEquals(WorkInfo.State.ENQUEUED, wm.getWorkInfosForUniqueWork(CopiaNas.PERIODICA).get().single().state)
        assertEquals(WorkInfo.State.ENQUEUED, wm.getWorkInfosForUniqueWork(CopiaNas.TRAS_EDITAR).get().single().state)
        copia.desconecta()
        assertFalse(copia.activa())
        assertTrue(ctx.noBackupFilesDir.listFiles()!!.none { it.name.startsWith("copia-nas") })
        assertEquals(EstadoCopia(), copia.estado())
        assertEquals(WorkInfo.State.CANCELLED, wm.getWorkInfosForUniqueWork(CopiaNas.PERIODICA).get().single().state)
        assertEquals(WorkInfo.State.CANCELLED, wm.getWorkInfosForUniqueWork(CopiaNas.TRAS_EDITAR).get().single().state)
        assertEquals(false, informes().last()["activa"]!!.jsonPrimitive.content.toBoolean())
        // Desconectada no copia ni programa nada.
        dsm.clear()
        assertNull(copia.copia())
        copia.trasEditar()
        assertTrue(dsm.isEmpty())
        assertEquals(WorkInfo.State.CANCELLED, wm.getWorkInfosForUniqueWork(CopiaNas.TRAS_EDITAR).get().single().state)
    }
}
