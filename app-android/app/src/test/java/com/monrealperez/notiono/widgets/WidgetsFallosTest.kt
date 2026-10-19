package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Looper
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.widget.RemoteViews
import android.widget.TextView
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.errorTrpc
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.respuestaTrpc
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File
import java.time.Duration
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Los widgets nunca se quedan en blanco (lo que pasaba en el Xiaomi de Jose con Glance): se
 * llama a `onUpdate` como lo haría el sistema y se aplican los RemoteViews que se mandan de
 * verdad al escritorio dentro de un AppWidgetHostView. Sin red, sin sesión, recién
 * reiniciado (proceso nuevo y servidor lento), con lo guardado de la 2.1.0, con la
 * configuración de Glance, con el servidor fallando y con el primer intento cortado.
 *
 * Con el código de la 2.1.0 (Glance) estas pruebas no pueden ni pasar: `onUpdate` no pinta
 * nada, deja un trabajo en WorkManager y el escritorio se queda con lo que tuviera.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class WidgetsFallosTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private var respuesta: (RecordedRequest) -> MockResponse = { respuestaTrpc("{}") }
    private val pintados = mutableMapOf<Int, RemoteViews>()
    private val peticiones = AtomicInteger()

    private val pagina = """{"id":"p1","title":"Lista de la compra"}"""
    private val bloques = """{"bloques":[{"id":"b1","type":"paragraph","props":{},"content":[{"type":"text","text":"Comprar leche","styles":{}}],"children":[]},
        {"id":"b2","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Pan","styles":{}}],"children":[]}]}"""

    /** El servidor de Notiono «bueno». */
    private fun bueno(r: RecordedRequest): MockResponse = when {
        r.url.encodedPath.endsWith("app.pagina") -> respuestaTrpc(pagina)
        r.url.encodedPath.endsWith("app.bloques") -> respuestaTrpc(bloques)
        r.url.encodedPath.endsWith("app.vista") -> respuestaTrpc(
            """{"collection":{"id":"c1","name":"Tareas"},"fields":[{"id":"t","name":"Nombre","type":"text"},{"id":"h","name":"Hecho","type":"checkbox"}],
               "filas":[{"id":"r1","cells":{"t":"Llamar al taller","h":false},"textos":{}}]}""",
        )
        else -> respuestaTrpc("{}")
    }

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                peticiones.incrementAndGet()
                return respuesta(request)
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        procesoNuevo()
        Servicios.de(ctx).sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        Widgets.alPintar = { id, rv -> synchronized(pintados) { pintados[id] = rv } }
    }

    @After
    fun cierra() {
        Widgets.alPintar = null
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.de(ctx).cache.vacia()
        File(ctx.filesDir, "widgets").deleteRecursively()
        Servicios.baseDePrueba = null
    }

    /** Como si Android hubiera matado la app: otra instancia de Servicios sobre los mismos ficheros. */
    private fun procesoNuevo() {
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
    }

    /** Lo que hace el sistema al poner el widget, tras reiniciar o al actualizar la app. Tiene que pintar ya. */
    private fun onUpdate(p: ProveedorWidget, id: Int): List<String> {
        val t0 = System.currentTimeMillis()
        p.onUpdate(ctx, AppWidgetManager.getInstance(ctx), intArrayOf(id))
        val ms = System.currentTimeMillis() - t0
        assertTrue("onUpdate tardó $ms ms: no puede esperar a la red", ms < 1_500)
        return Arnes.textos(ctx, synchronized(pintados) { pintados[id] } ?: error("onUpdate no pintó nada"))
    }

    /** Lo que acaba enseñando cuando termina lo de detrás (la primera vista que cumple `hasta`). */
    private fun alFinal(id: Int, hasta: (List<String>) -> Boolean): List<String> {
        val fin = System.currentTimeMillis() + 15_000
        var ultimo = emptyList<String>()
        while (System.currentTimeMillis() < fin) {
            // El reloj del hilo principal de Robolectric no avanza solo: sin esto, ni los
            // reintentos (delay) ni la espera de red llegarían a su hora.
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500))
            synchronized(pintados) { pintados[id] }?.let { ultimo = Arnes.textos(ctx, it) }
            if (hasta(ultimo)) return ultimo
            Thread.sleep(50)
        }
        error("No llegó a pintar lo esperado; lo último: $ultimo; registro: ${Servicios.de(ctx).registro.eventos().takeLast(6).map { it.mensaje }}")
    }

    private fun List<String>.tiene(t: String) = any { t in it }

    /** Lo que la app dejó guardado de la nota hace dos horas (un refresco bueno de antes). */
    private fun notaGuardadaHace2h(): Int {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1"))
        respuesta = ::bueno
        runBlocking { NotaReceiver().refresca(ctx, id, "antes") }
        val i = Instantaneas.lee(ctx, id)!!
        Instantaneas.guarda(ctx, id, i.copy(fecha = System.currentTimeMillis() - 2 * 3600_000L))
        return id
    }

    @Test
    fun sinRedNiNadaGuardadoNuncaQuedaVacio() {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1", titulo = "Lista de la compra"))
        servidor.close()
        val primero = onUpdate(NotaReceiver(), id)
        assertTrue("$primero", primero.tiene("Lista de la compra") && primero.tiene("Cargando…"))
        val t = alFinal(id) { it.tiene("Sin conexión") }
        assertTrue("$t", t.tiene("Sin conexión. Toca para reintentar."))
        // Y queda un refresco esperando a que vuelva la red.
        val trabajos = WorkManager.getInstance(ctx).getWorkInfosForUniqueWork("widgets-red").get()
        assertTrue("$trabajos", trabajos.isNotEmpty())
    }

    @Test
    fun recienReiniciadoPintaAlInstanteLoGuardadoAunqueElServidorTarde() {
        val id = notaGuardadaHace2h()
        procesoNuevo()
        respuesta = { MockResponse.Builder().headersDelay(8, TimeUnit.SECONDS).body("{}").build() }
        val t = onUpdate(NotaReceiver(), id)
        assertTrue("$t", t.tiene("Lista de la compra") && t.tiene("Comprar leche") && t.tiene("Pan"))
    }

    @Test
    fun conLoGuardadoPorLaVersionAnteriorPintaSusDatos() {
        // La 2.1.0 (Glance) guardaba en la caché de red de la app, no por widget.
        val s = Servicios.de(ctx)
        s.cache.guarda(s.cache.clave("app.pagina", objeto("id" to "p1")), json.parseToJsonElement(pagina))
        s.cache.guarda(s.cache.clave("app.bloques", objeto("id" to "p1")), json.parseToJsonElement(bloques))
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1"))
        servidor.close()
        val t = onUpdate(NotaReceiver(), id)
        assertTrue("$t", t.tiene("Comprar leche"))
    }

    @Test
    fun laConfiguracionQueGuardoGlanceSeConserva() {
        // Un widget Lista puesto con la 2.1.0: su configuración vive en el DataStore de Glance.
        val id = Arnes.pon(ctx, ListaReceiver::class.java)
        val f = ctx.preferencesDataStoreFile("appWidget-$id")
        val alcance = CoroutineScope(Dispatchers.IO + Job())
        runBlocking {
            PreferenceDataStoreFactory.create(scope = alcance, produceFile = { f }).edit {
                it[stringPreferencesKey("pagina")] = "bd1"
                it[stringPreferencesKey("titulo")] = "Tareas · Pendientes"
            }
        }
        alcance.cancel()
        Thread.sleep(200)
        assertEquals(ConfigWidget(pagina = "bd1", titulo = "Tareas · Pendientes"), Configs.lee(ctx, id))
        respuesta = ::bueno
        onUpdate(ListaReceiver(), id)
        val t = alFinal(id) { it.tiene("Llamar al taller") }
        assertTrue("$t", t.tiene("Tareas · Pendientes"))
    }

    @Test
    fun error500EnseñaLoUltimoConSuMarca() {
        val id = notaGuardadaHace2h()
        respuesta = { errorTrpc(500, "INTERNAL_SERVER_ERROR", "Se cayó") }
        onUpdate(NotaReceiver(), id)
        val t = alFinal(id) { it.tiene("Sin actualizar") }
        assertTrue("$t", t.tiene("Comprar leche") && t.tiene("hace 2 h"))
    }

    @Test
    fun error401EnseñaLoUltimoYPideEntrar() {
        val id = notaGuardadaHace2h()
        respuesta = { errorTrpc(401, "UNAUTHORIZED", "No autorizado") }
        onUpdate(NotaReceiver(), id)
        val t = alFinal(id) { it.tiene("Sin actualizar") }
        assertTrue("$t", t.tiene("Comprar leche") && t.tiene("Inicia sesión"))
    }

    @Test
    fun respuestaRaraEnseñaLoUltimo() {
        val id = notaGuardadaHace2h()
        // La página de error del proxy con un 200, y un JSON sin los bloques.
        for (r in listOf(MockResponse.Builder().code(200).body("<html>502 Bad Gateway</html>").build(), respuestaTrpc("[1,2,3]"))) {
            respuesta = { r }
            synchronized(pintados) { pintados.clear() }
            onUpdate(NotaReceiver(), id)
            val t = alFinal(id) { it.tiene("Sin actualizar") }
            assertTrue("$t", t.tiene("Comprar leche"))
        }
    }

    @Test
    fun elPrimerIntentoCortadoNoCuentaComoFallo() {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1"))
        // La primera petición se corta (la red de fondo aún no deja salir) y las siguientes van.
        val primera = AtomicInteger()
        respuesta = { r -> if (primera.getAndIncrement() == 0) MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build() else bueno(r) }
        onUpdate(NotaReceiver(), id)
        val t = alFinal(id) { it.tiene("Comprar leche") }
        assertTrue("$t", !t.tiene("Sin actualizar"))
        val ev = Servicios.de(ctx).registro.eventos().map { it.mensaje }
        // El corte se reintenta (OkHttp o nosotros) y solo cuenta el resultado: ok, sin «fallo».
        assertTrue("$ev", ev.any { it.startsWith("nota#$id · sistema · ok") })
        assertTrue("${peticiones.get()}", peticiones.get() >= 3)
        assertTrue("$ev", ev.none { it.startsWith("nota#$id · sistema · fallo") })
    }

    @Test
    fun sinSesionLoDiceYNoEnseñaNada() {
        val id = notaGuardadaHace2h()
        Servicios.de(ctx).sesion.olvida()
        val t = onUpdate(NotaReceiver(), id)
        assertTrue("$t", t.tiene("Inicia sesión"))
        assertTrue("$t", !t.tiene("Comprar leche"))
    }

    @Test
    fun sinConfigurarLoDice() {
        for (c in listOf(NotaReceiver::class.java, ListaReceiver::class.java, CalendarioReceiver::class.java)) {
            val id = Arnes.pon(ctx, c)
            val t = onUpdate(c.getDeclaredConstructor().newInstance(), id)
            assertTrue("${c.simpleName}: $t", t.tiene("Toca para elegir"))
        }
        // Los que no necesitan nada pintan sus botones.
        val r = Arnes.pon(ctx, RapidaReceiver::class.java)
        assertTrue(onUpdate(RapidaReceiver(), r).tiene("Nota rápida"))
        val a = Arnes.pon(ctx, AccionesReceiver::class.java)
        assertTrue(onUpdate(AccionesReceiver(), a).containsAll(listOf("Página", "Foto", "Buscar")))
    }

    @Test
    fun marcarUnaFilaSeVeAlMomentoYLlegaAlServidor() {
        val id = Arnes.pon(ctx, ListaReceiver::class.java, ConfigWidget(pagina = "bd1"))
        respuesta = ::bueno
        runBlocking { ListaReceiver().refresca(ctx, id, "antes") }
        val mutaciones = mutableListOf<String>()
        respuesta = { r ->
            if (r.method == "POST") synchronized(mutaciones) { mutaciones += r.url.encodedPath + " " + r.body?.utf8() }
            if (r.method == "POST") respuestaTrpc("{}") else bueno(r)
        }
        val dato = marcaUri("fila", id, "pagina" to "bd1", "id" to "r1", "campo" to "h", "valor" to "true")
        ListaReceiver().onReceive(ctx, Intent(ctx, ListaReceiver::class.java).setAction(Widgets.ACCION_FILA)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra(Widgets.EXTRA_VALOR, dato))
        // Al momento, tachada (sin esperar al servidor).
        val v = Arnes.vista(ctx, synchronized(pintados) { pintados[id] }!!)
        val fila = buscaTexto(v, "Llamar al taller")!!
        assertTrue((fila.text as? Spanned)?.getSpans(0, fila.text.length, StrikethroughSpan::class.java)?.isNotEmpty() == true)
        val fin = System.currentTimeMillis() + 10_000
        while (synchronized(mutaciones) { mutaciones.isEmpty() } && System.currentTimeMillis() < fin) {
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500))
            Thread.sleep(50)
        }
        assertTrue("$mutaciones", mutaciones.any { "db.updateCell" in it && "\"recordId\":\"r1\"" in it && "\"value\":true" in it })
    }

    @Test
    fun cadaPintadoQuedaEnElRegistro() {
        val id = notaGuardadaHace2h()
        onUpdate(NotaReceiver(), id)
        val ev = Servicios.de(ctx).registro.eventos().map { it.mensaje }
        assertTrue("$ev", ev.any { it.startsWith("pinta · nota#$id · cache · 2 elem") && " kB" in it })
    }

    @Test
    fun siAlgoRevientaAlPintarSaleUnAvisoNoUnHueco() {
        val id = Arnes.pon(ctx, NotaReceiver::class.java, ConfigWidget(pagina = "p1"))
        // Lo guardado está roto (otra forma, a medio escribir): no puede tumbar el pintado.
        Instantaneas.guarda(ctx, id, Instantanea(NotaReceiver().clave(ConfigWidget(pagina = "p1")), json.parseToJsonElement("""{"bloques":"no"}"""), 1))
        val t = onUpdate(NotaReceiver(), id)
        assertTrue("$t", t.isNotEmpty())
        val inicial = android.view.LayoutInflater.from(ctx).inflate(R.layout.widget_cargando, null)
        assertTrue(Arnes.textos(inicial).containsAll(listOf("Notiono", "Cargando…")))
    }

    private fun buscaTexto(v: android.view.View, t: String): TextView? = when (v) {
        is TextView -> v.takeIf { it.text.toString() == t }
        is android.widget.AdapterView<*> -> (0 until (v.adapter?.count ?: 0)).firstNotNullOfOrNull { buscaTexto(v.adapter.getView(it, null, android.widget.FrameLayout(v.context)), t) }
        is android.view.ViewGroup -> (0 until v.childCount).firstNotNullOfOrNull { buscaTexto(v.getChildAt(it), t) }
        else -> null
    }
}
