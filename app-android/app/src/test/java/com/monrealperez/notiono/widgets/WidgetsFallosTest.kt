package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetHostView
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.TextView
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.ExperimentalGlanceApi
import androidx.glance.appwidget.AppWidgetId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.compose
import androidx.glance.appwidget.runComposition
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.errorTrpc
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.respuestaTrpc
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Los widgets cuando el servidor falla (la 2.0.1 se quedaba en blanco): lento, 500, 401,
 * respuesta rara, proceso nuevo, sin sesión, sin configurar. Se ejecuta la sesión de Glance
 * de verdad (`compose`/`runComposition`, lo mismo que corre el SessionWorker) y se leen los
 * textos del RemoteViews ya aplicado.
 */
@OptIn(ExperimentalGlanceApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class WidgetsFallosTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private var respuesta: (RecordedRequest) -> MockResponse = { respuestaTrpc("{}") }
    private val id = AppWidgetId(-77)
    private val tamaño = DpSize(300.dp, 300.dp)

    private val pagina = """{"id":"p1","title":"Lista de la compra"}"""
    private val bloques = """{"bloques":[{"id":"b1","type":"paragraph","props":{},"content":[{"type":"text","text":"Comprar leche","styles":{}}],"children":[]}]}"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = respuesta(request)
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        procesoNuevo()
        Servicios.de(ctx).sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        // El estado de Glance vive en un DataStore que sobrevive entre pruebas.
        runBlocking { updateAppWidgetState(ctx, id) { it.clear() } }
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.de(ctx).cache.vacia()
        Servicios.baseDePrueba = null
    }

    /** Como si Android hubiera matado la app: otra instancia de Servicios sobre los mismos ficheros. */
    private fun procesoNuevo() {
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
    }

    /** Lo que la app dejó guardado de la nota hace dos horas. */
    private fun notaGuardadaHace2h() = runBlocking {
        val s = Servicios.de(ctx)
        s.cache.guarda(s.cache.clave("app.pagina", objeto("id" to "p1")), json.parseToJsonElement(pagina))
        s.cache.guarda(s.cache.clave("app.bloques", objeto("id" to "p1")), json.parseToJsonElement(bloques))
        val antes = System.currentTimeMillis() - 2 * 3600_000L
        File(ctx.filesDir, "red").listFiles()!!.forEach { it.setLastModified(antes) }
        updateAppWidgetState(ctx, id) { it[Widgets.CLAVE_PAGINA] = "p1" }
    }

    private fun textos(rv: RemoteViews): List<String> {
        val anfitrion = AppWidgetHostView(ctx)
        val v = rv.apply(ctx, anfitrion)
        anfitrion.addView(v)
        return textos(v)
    }

    private fun textos(v: View): List<String> = when (v) {
        is TextView -> listOf(v.text.toString())
        is AdapterView<*> -> (0 until (v.adapter?.count ?: 0)).flatMap { textos(v.adapter.getView(it, null, FrameLayout(ctx))) }
        is ViewGroup -> (0 until v.childCount).flatMap { textos(v.getChildAt(it)) }
        else -> emptyList()
    }

    /** Lo primero que pinta el widget: tiene que salir enseguida, sin esperar a la red. */
    private fun primero(w: GlanceAppWidget): List<String> = runBlocking {
        withTimeout(3_000) { textos(w.compose(ctx, id, size = tamaño)) }
    }

    /** Lo que acaba pintando cuando termina el refresco (la primera vista que cumple `hasta`). */
    private fun alFinal(w: GlanceAppWidget, hasta: (List<String>) -> Boolean): List<String> = runBlocking {
        withTimeout(10_000) { w.runComposition(ctx, id, sizes = listOf(tamaño)).first { hasta(textos(it)) }.let { textos(it) } }
    }

    private fun List<String>.tiene(t: String) = any { t in it }

    @Test
    fun servidorLentoPintaAlInstanteLoGuardado() {
        notaGuardadaHace2h()
        procesoNuevo()
        respuesta = { MockResponse.Builder().headersDelay(8, TimeUnit.SECONDS).body("{}").build() }
        val t = primero(NotaWidget())
        assertTrue("$t", t.tiene("Comprar leche"))
    }

    @Test
    fun error500EnseñaLoUltimoConSuMarca() {
        notaGuardadaHace2h()
        respuesta = { errorTrpc(500, "INTERNAL_SERVER_ERROR", "Se cayó") }
        val t = alFinal(NotaWidget()) { it.tiene("Sin actualizar") }
        assertTrue("$t", t.tiene("Comprar leche") && t.tiene("hace 2 h"))
    }

    @Test
    fun error401EnseñaLoUltimoYPideEntrar() {
        notaGuardadaHace2h()
        respuesta = { errorTrpc(401, "UNAUTHORIZED", "No autorizado") }
        val t = alFinal(NotaWidget()) { it.tiene("Sin actualizar") }
        assertTrue("$t", t.tiene("Comprar leche") && t.tiene("Inicia sesión"))
    }

    @Test
    fun respuestaRaraEnseñaLoUltimo() {
        notaGuardadaHace2h()
        // La página de error del proxy, con un 200.
        respuesta = { MockResponse.Builder().code(200).body("<html>502 Bad Gateway</html>").build() }
        val t = alFinal(NotaWidget()) { it.tiene("Sin actualizar") }
        assertTrue("$t", t.tiene("Comprar leche"))
    }

    @Test
    fun formaRaraEnseñaLoUltimo() {
        notaGuardadaHace2h()
        // JSON válido pero sin los bloques: no puede borrar lo que había.
        respuesta = { respuestaTrpc("""[1,2,3]""") }
        val t = alFinal(NotaWidget()) { it.tiene("Sin actualizar") }
        assertTrue("$t", t.tiene("Comprar leche"))
    }

    @Test
    fun sinSesionLoDice() {
        notaGuardadaHace2h()
        Servicios.de(ctx).sesion.olvida()
        respuesta = { errorTrpc(401, "UNAUTHORIZED", "No autorizado") }
        val t = primero(NotaWidget())
        assertTrue("$t", t.tiene("Inicia sesión"))
        assertTrue("$t", !t.tiene("Comprar leche"))
    }

    @Test
    fun sinConfigurarLoDice() {
        val t = primero(NotaWidget())
        assertTrue("$t", t.tiene("Toca para elegir"))
    }

    @Test
    fun listaConServidorLentoPintaLoGuardado() {
        val s = Servicios.de(ctx)
        val datos = """{"collection":{"id":"c1","name":"Tareas"},"fields":[{"id":"t","name":"Nombre","type":"text"}],"filas":[{"id":"r1","cells":{"t":"Llamar al taller"}}]}"""
        s.cache.guarda(s.cache.clave("app.vista", objeto("pageId" to "bd1")), json.parseToJsonElement(datos))
        runBlocking { updateAppWidgetState(ctx, id) { it[Widgets.CLAVE_PAGINA] = "bd1" } }
        procesoNuevo()
        respuesta = { MockResponse.Builder().headersDelay(8, TimeUnit.SECONDS).body("{}").build() }
        val t = primero(ListaWidget())
        assertTrue("$t", t.tiene("Llamar al taller"))
    }
}
