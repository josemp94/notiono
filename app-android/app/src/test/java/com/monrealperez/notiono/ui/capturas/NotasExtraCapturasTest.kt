package com.monrealperez.notiono.ui.capturas

import android.content.Context
import android.view.View
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.github.takahirom.roborazzi.captureRoboImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.bd.EstadoBD
import com.monrealperez.notiono.bd.VistaLista
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.respuestaTrpc
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.ajustes.PantallaCopiaNas
import com.monrealperez.notiono.ui.buscar.PantallaBuscar
import com.monrealperez.notiono.ui.pagina.HojaApariencia
import com.monrealperez.notiono.ui.pagina.PantallaPagina
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.TemaNotiono
import com.monrealperez.notiono.widgets.Arnes
import com.monrealperez.notiono.widgets.FavoritosReceiver
import com.monrealperez.notiono.widgets.Muestras
import com.monrealperez.notiono.widgets.NotaReceiver
import com.monrealperez.notiono.widgets.RecientesReceiver
import com.monrealperez.notiono.widgets.VistasPreviasTest
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Capturas de lo nuevo de la 2.5.2 (claro y oscuro, 390 dp), con un servidor de mentira:
 * «Apariencia y diseño», una página con color y Texto pequeño, la Lista de «Notas» por
 * etiqueta, una nota en el buscador, los widgets Favoritos/Recientes/Nota con color,
 * «Copia en el NAS» y «Añadir a ▾». Solo graban con -Proborazzi.test.record=true
 * (en app/build/capturas/notas-extra/).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class NotasExtraCapturasTest {
    @get:Rule val compose = createComposeRule()
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    @Volatile private var pagina = ""

    private val bloques = """{"huella":"h","bloques":[
      {"id":"b1","type":"heading","props":{"level":2},"content":[{"type":"text","text":"Martes","styles":{}}],"children":[]},
      {"id":"b2","type":"paragraph","content":[{"type":"text","text":"Por la mañana al mercado con Lucía; por la tarde, la reunión del cole.","styles":{}}],"children":[]},
      {"id":"b3","type":"checkListItem","props":{"checked":true},"content":[{"type":"text","text":"Llamar al fontanero","styles":{}}],"children":[]},
      {"id":"b4","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Pedir cita en el dentista","styles":{}}],"children":[]},
      {"id":"b5","type":"bulletListItem","content":[{"type":"text","text":"Ideas para el finde: ir al cine o a la playa","styles":{}}],"children":[]}]}"""

    @Before
    fun prepara() {
        assumeTrue(System.getProperty("roborazzi.test.record") == "true")
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = respuestaTrpc(
                when (request.url.encodedPath.removePrefix("/api/trpc/")) {
                    "auth.me" -> """{"id":"u1","email":"ana@example.com","name":"Ana","wsRole":"owner","workspace":{"id":"w1","name":"Casa","icon":"🏠"}}"""
                    "app.pagina" -> pagina
                    "app.bloques" -> if (pagina.contains("\"p1\"")) bloques else """{"huella":"h","bloques":[]}"""
                    "workspace.list" -> """[{"id":"w1","name":"Casa","icon":"🏠","isOwner":true,"rol":"owner","ownerName":"Ana","compartido":false,"miembros":1,"sinLeer":0},
                       {"id":"w2","name":"Familia","isOwner":false,"rol":"editor","ownerName":"Luis","compartido":true,"miembros":4,"sinLeer":0}]"""
                    "pages.search" -> """[
                      {"id":"bdn","recordId":"r1","title":"Receta de lentejas","dbTitle":"Notas","color":"green","inTitle":true},
                      {"id":"bdn","recordId":"r4","title":"Ideas de cenas","dbTitle":"Notas","inTitle":false},
                      {"id":"p9","title":"Recetas de la abuela","icon":"🍲","type":"doc","inTitle":true}]"""
                    else -> if (request.method == "POST") "{}" else "null"
                },
            )
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.sesion.espacio = "w1"
        s.cache.vacia()
        File(ctx.noBackupFilesDir, "copia-nas.json").delete()
        File(ctx.noBackupFilesDir, "copia-nas-estado.json").delete()
    }

    @After
    fun cierra() {
        if (!::servidor.isInitialized) return
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
    }

    private fun modo(oscuro: Boolean) = if (oscuro) "oscuro" else "claro"

    private fun foto(nombre: String, oscuro: Boolean, espera: String, antes: () -> Unit = {}, contenido: @Composable () -> Unit) {
        compose.setContent {
            val nav = remember { NavHostController(ctx) }
            CompositionLocalProvider(LocalNavegador provides Navegador(nav, {}, { _, _ -> })) {
                TemaNotiono(oscuro) { Box(Modifier.fillMaxSize().background(C.fondo)) { contenido() } }
            }
        }
        antes()
        compose.waitUntil(8_000) { compose.waitForIdle(); compose.onAllNodesWithText(espera, substring = true).fetchSemanticsNodes().isNotEmpty() }
        // Lo que no está en la semántica (el texto del editor es un EditText) llega por la red real del MockWebServer.
        repeat(10) { Thread.sleep(150); compose.mainClock.advanceTimeBy(200); compose.waitForIdle() }
        compose.onRoot().captureRoboImage("build/capturas/notas-extra/app_${nombre}_${modo(oscuro)}.png")
    }

    // 1. ⋯ → Apariencia y diseño, con Amarillo y Texto pequeño puestos. La hoja sale a media
    // altura: se sube arrastrándola, como con el dedo, para que se vean los colores.
    private fun apariencia(oscuro: Boolean) = foto("apariencia", oscuro, "Amarillo", antes = {
        compose.onNodeWithText("Estilo").performTouchInput { swipeUp(startY = centerY, endY = centerY - 1500f, durationMillis = 400) }
    }) { HojaApariencia(PaginaInfo("p1", title = "Diario de octubre", smallText = true, color = "yellow", nivel = "full"), { _, _, _ -> }) {} }
    @Test fun aparienciaClaro() = apariencia(false)
    @Test fun aparienciaOscuro() = apariencia(true)

    // 2. Una página amarilla con Texto pequeño (y su miga de pan, del árbol guardado).
    private fun paginaColor(oscuro: Boolean) {
        val s = Servicios.de(ctx)
        s.repo.cache.guarda(s.repo.clave("pages.tree"), json.parseToJsonElement(
            """[{"id":"p0","title":"Diario","icon":"📔","parentId":null,"order":"a","hasChildren":true},{"id":"p1","title":"Diario de octubre","icon":"🍂","parentId":"p0","order":"a","color":"yellow"}]""",
        ))
        pagina = """{"id":"p1","parentId":"p0","title":"Diario de octubre","icon":"🍂","nivel":"full","smallText":true,"color":"yellow"}"""
        foto("pagina_color", oscuro, "Diario de octubre") { PantallaPagina("p1") }
    }
    @Test fun paginaColorClaro() = paginaColor(false)
    @Test fun paginaColorOscuro() = paginaColor(true)

    // 3. La Lista de una BD «Notas», agrupada por su Selección múltiple, con barritas de color.
    private val notas = """{
        "collection":{"id":"c1","name":"Notas"},
        "fields":[{"id":"t","name":"Nombre","type":"text"},
          {"id":"e","name":"Etiquetas","type":"multiselect","config":{"options":[{"id":"o1","label":"Cocina","color":"orange"},{"id":"o2","label":"Casa","color":"blue"},{"id":"o3","label":"Ideas","color":"purple"}]}}],
        "views":[{"id":"v1","name":"Todas","type":"list","config":{"groupByFieldId":"e"}}],
        "view":{"id":"v1","name":"Todas","type":"list","config":{"groupByFieldId":"e"}},
        "filas":[
          {"id":"r1","cells":{"t":"Receta de lentejas","e":["o1"]},"colorPagina":"green"},
          {"id":"r2","cells":{"t":"Lista de la compra","e":["o1","o2"]},"colorPagina":"yellow"},
          {"id":"r3","cells":{"t":"Arreglar la persiana","e":["o2"]}},
          {"id":"r4","cells":{"t":"Ideas de cenas","e":["o1","o3"]},"colorPagina":"pink"},
          {"id":"r5","cells":{"t":"Regalos de Navidad","e":["o3"]},"colorPagina":"red"},
          {"id":"r6","cells":{"t":"Apuntes sueltos"}}
        ],
        "grupos":[
          {"clave":"o1","etiqueta":"Cocina","ids":["r1","r2","r4"]},
          {"clave":"o2","etiqueta":"Casa","ids":["r2","r3"]},
          {"clave":"o3","etiqueta":"Ideas","ids":["r4","r5"]},
          {"clave":"","etiqueta":"Sin Etiquetas","ids":["r6"]}
        ],
        "nivel":"edit"
    }"""
    private fun listaNotas(oscuro: Boolean) {
        val s = Servicios.de(ctx)
        s.repo.cache.guarda(s.repo.clave("app.vista", objeto("pageId" to "bdn")), json.parseToJsonElement(notas))
        val est = EstadoBD("bdn", s, s.alcance).apply { cacheada() }
        foto("lista_notas", oscuro, "Receta de lentejas") { VistaLista(est) {} }
    }
    @Test fun listaNotasClaro() = listaNotas(false)
    @Test fun listaNotasOscuro() = listaNotas(true)

    // 4. Buscar: notas (filas de «Notas») junto a una página.
    private fun buscar(oscuro: Boolean) = foto("buscar_nota", oscuro, "Receta de lentejas", antes = {
        compose.onNode(hasSetTextAction()).performTextInput("rece")
    }) { PantallaBuscar() }
    @Test fun buscarClaro() = buscar(false)
    @Test fun buscarOscuro() = buscar(true)

    // 6. Ajustes → Copia en el NAS: sin conectar, y con una copia hecha (y un error de ejemplo).
    @Test fun copiaSinConectarClaro() = foto("copia_nas_sin_conectar", false, "Conectar") { PantallaCopiaNas() }
    @Test fun copiaSinConectarOscuro() = foto("copia_nas_sin_conectar", true, "Conectar") { PantallaCopiaNas() }
    private fun copiaHecha(oscuro: Boolean) {
        File(ctx.noBackupFilesDir, "copia-nas.json").writeText("""{"servidor":"https://nas.example.com/drive","carpeta":"/home/Notiono","usuario":"ana","espacios":["w1"]}""")
        val subidos = (1..37).joinToString(",") { """"p$it":{"espacio":"w1","ruta":"/home/Notiono/Casa/Pagina $it.docx","editada":"2026-10-29T07:00:00Z"}""" }
        File(ctx.noBackupFilesDir, "copia-nas-estado.json").writeText(
            """{"subidos":{$subidos},"ultima":"${java.time.Instant.now().minusSeconds(2 * 3600)}","error":"No se pudo conectar con el NAS: revisa la dirección"}""",
        )
        foto("copia_nas_hecha", oscuro, "Última copia") { PantallaCopiaNas() }
    }
    @Test fun copiaHechaClaro() = copiaHecha(false)
    @Test fun copiaHechaOscuro() = copiaHecha(true)

    // 7. Una página nueva, en la raíz, con la pastilla «Añadir a ▾ Casa».
    private fun nueva(oscuro: Boolean) {
        pagina = """{"id":"p2","parentId":null,"title":"","nivel":"full"}"""
        foto("anadir_a", oscuro, "Añadir a") { PantallaPagina("p2", nueva = true) }
    }
    @Test fun anadirAClaro() = nueva(false)
    @Test fun anadirAOscuro() = nueva(true)

    // 5. Widgets: Favoritos, Recientes y la Nota con la barrita de su color (390 dp de ancho).
    private fun widgets(oscuro: Boolean) {
        val ancho = 390
        val todos = listOf(
            "widget_favoritos" to FavoritosReceiver().muestra(ctx),
            "widget_recientes" to RecientesReceiver().muestra(ctx),
            "widget_nota_color" to NotaReceiver.nota(ctx, 0, "muestra", Muestras.TITULO_NOTA, NotaReceiver.planos(Muestras.nota), null, color = "yellow"),
        )
        for ((nombre, rv) in todos) {
            val png = VistasPreviasTest.pinta(ctx, Arnes.vista(ctx, rv, ancho, 300).parent as View, ancho, 300)
            VistasPreviasTest.guarda(png, File("build/capturas/notas-extra/app_${nombre}_${modo(oscuro)}.png"))
        }
    }
    @Test fun widgetsClaro() = widgets(false)
    @Config(qualifiers = "+night")
    @Test fun widgetsOscuro() = widgets(true)
}
