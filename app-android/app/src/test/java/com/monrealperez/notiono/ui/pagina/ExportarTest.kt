package com.monrealperez.notiono.ui.pagina

import android.content.Context
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.tema.TemaNotiono
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
import java.util.concurrent.TimeUnit

/** «Exportar» como el de Notion: un formato de la lista y el botón; Word es uno más (2.5.1). */
@RunWith(RobolectricTestRunner::class)
class ExportarTest {
    @get:Rule val compose = createComposeRule()
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = respuestaTrpc(
                when {
                    request.url.encodedPath.endsWith("exportarWord") -> """{"nombre":"Lista.docx","base64":"UEs="}"""
                    request.url.encodedPath.endsWith("exportarHtml") -> """{"nombre":"Lista.html","html":"<h1>Lista</h1>"}"""
                    else -> """{"titulo":"Lista","markdown":"# Lista"}"""
                },
            )
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        Servicios.de(ctx).sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.baseDePrueba = null
    }

    private fun exporta(formato: String, recordId: String? = null): String {
        var cerrada = false
        compose.setContent { TemaNotiono(false) { if (!cerrada) HojaExportar("p1", recordId, esBd = false) { cerrada = true } } }
        for (f in listOf("PDF", "HTML", "Markdown y CSV", "Word (.docx)")) compose.onNodeWithText(f).assertExists()
        compose.onNodeWithText("Formato de exportación").assertExists()
        compose.onNodeWithText(formato).performClick()
        compose.onAllNodes(hasText("Exportar") and hasClickAction()).onFirst().performClick()
        compose.waitForIdle()
        val r = servidor.takeRequest(5, TimeUnit.SECONDS)!!
        assertTrue("la hoja se cierra", cerrada)
        return "${r.url.encodedPath}?${r.url.queryParameter("input")}"
    }

    @Test
    fun wordEsUnFormatoMasDeLaLista() = assertEquals("/api/trpc/app.exportarWord?{\"json\":{\"id\":\"p1\"}}", exporta("Word (.docx)"))

    @Test
    fun htmlDeUnaFila() = assertEquals("/api/trpc/app.exportarHtml?{\"json\":{\"id\":\"p1\",\"recordId\":\"r1\"}}", exporta("HTML", "r1"))

    @Test
    fun markdownDeUnaFila() = assertEquals("/api/trpc/app.exportarMarkdown?{\"json\":{\"id\":\"p1\",\"recordId\":\"r1\"}}", exporta("Markdown y CSV", "r1"))
}
