package com.monrealperez.notiono

import android.content.Context
import android.os.Looper
import android.text.Spanned
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.AppWidgetId
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.monrealperez.notiono.editor.CampoBloque
import com.monrealperez.notiono.editor.Inline
import com.monrealperez.notiono.editor.NegritaSpan
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.Destino
import com.monrealperez.notiono.ui.Principal
import com.monrealperez.notiono.ui.tema.TemaNotiono
import com.monrealperez.notiono.widgets.MarcaCasilla
import com.monrealperez.notiono.widgets.MarcaFila
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowDialog
import java.io.File

/**
 * La app recorrida como lo haría una persona, contra un Notiono de verdad en local: crea
 * una página y escribe en ella con formato, «/», casillas, mover y deshacer; comenta; crea
 * una base de datos con una propiedad de cada tipo y las rellena desde la ficha; filtra,
 * cambia de vista, arrastra en el Kanban, abre el calendario; busca; abre un vencimiento
 * desde la bandeja; manda la página a la papelera y la recupera; crea desde una
 * plantilla; y usa las acciones de los widgets. Lo lanza `scripts/recorrido-android.ts`,
 * que después comprueba en el servidor (como la web) que todo quedó como debe.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class RecorridoTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private val hechos = linkedMapOf<String, String>()

    // ---------- cómo se mueve por la app ----------

    private fun foto(nombre: String) = compose.onRoot().captureRoboImage("build/recorrido/$nombre.png")

    private fun avanza(ms: Long = 100) {
        var t = 0L
        while (t < ms) {
            compose.mainClock.advanceTimeBy(50)
            shadowOf(Looper.getMainLooper()).idle()
            t += 50
        }
    }

    /** Espera con reloj real (la red es de verdad) a que algo pase. */
    private fun espera(que: String, ms: Long = 20_000, cond: () -> Boolean) {
        val fin = System.currentTimeMillis() + ms
        while (!cond()) {
            if (System.currentTimeMillis() > fin) {
                runCatching { foto("fallo") }
                error("no pasó a tiempo: $que")
            }
            avanza(50)
            Thread.sleep(20)
        }
        avanza(300)
    }

    private fun visible(n: SemanticsNode) = n.boundsInRoot.left >= 0f && n.boundsInRoot.right > 0f && n.boundsInRoot.top >= 0f

    private fun hay(texto: String, exacto: Boolean = false) =
        compose.onAllNodes(hasText(texto, substring = !exacto), useUnmergedTree = true).fetchSemanticsNodes().any(::visible)

    private fun esperaTexto(texto: String) = espera("«$texto» en pantalla") { hay(texto) }

    private fun pulsaNodo(n: SemanticsNode) {
        compose.onNode(SemanticsMatcher("nodo ${n.id}") { it.id == n.id }).performClick()
        avanza(400)
    }

    /** Pulsa lo que se ve con ese texto (el de más arriba o el último pintado: el de la hoja abierta). */
    private fun pulsa(texto: String, exacto: Boolean = true, arriba: Boolean = false) {
        // Si está en una lista, más abajo de lo que se ve (el panel), se baja hasta él.
        // (con el dedo: performScrollToNode espera a que todo esté quieto y con el reloj a mano no llega)
        fun seVe() = compose.onAllNodes(hasText(texto, substring = !exacto) and hasClickAction()).fetchSemanticsNodes().any(::visible)
        var intentos = 0
        while (!seVe() && intentos++ < 8) {
            val lista = compose.onAllNodes(hasScrollToNodeAction()).fetchSemanticsNodes().filter(::visible).lastOrNull() ?: break
            compose.onNode(SemanticsMatcher("lista ${lista.id}") { it.id == lista.id }).performTouchInput { swipeUp() }
            avanza(600)
        }
        // Buscar y pulsar a la vez, reintentando: el nodo puede recomponerse entre medias.
        espera("poder pulsar «$texto»") {
            val nodos = compose.onAllNodes(hasText(texto, substring = !exacto) and hasClickAction()).fetchSemanticsNodes().filter(::visible)
            val nodo = (if (arriba) nodos.minByOrNull { it.boundsInRoot.top } else nodos.lastOrNull()) ?: return@espera false
            runCatching { pulsaNodo(nodo) }.isSuccess
        }
    }

    private fun pulsaDesc(desc: String, indice: Int = -1) {
        espera("el botón «$desc»") {
            val nodos = compose.onAllNodesWithContentDescription(desc).fetchSemanticsNodes().filter(::visible)
            if (nodos.size <= maxOf(indice, 0)) return@espera false
            runCatching { pulsaNodo(if (indice < 0) nodos.last() else nodos[indice]) }.isSuccess
        }
    }

    /** El último campo de texto de Compose que se ve: el de la hoja abierta, o el título. */
    private fun campoTexto(): SemanticsNode {
        var n: SemanticsNode? = null
        espera("un campo de texto") { n = compose.onAllNodes(hasSetTextAction()).fetchSemanticsNodes().lastOrNull(::visible); n != null }
        return n!!
    }

    private fun escribe(texto: String) {
        val n = campoTexto()
        compose.onNode(SemanticsMatcher("campo ${n.id}") { it.id == n.id }).performTextInput(texto)
        avanza(300)
    }

    private fun reemplaza(texto: String) {
        val n = campoTexto()
        compose.onNode(SemanticsMatcher("campo ${n.id}") { it.id == n.id }).performTextReplacement(texto)
        avanza(300)
    }

    /** Cierra la hoja de abajo abierta, como el gesto de atrás. */
    private fun cierraHoja() {
        ShadowDialog.getLatestDialog()?.let { (it as? androidx.activity.ComponentDialog)?.onBackPressedDispatcher?.onBackPressed() ?: it.dismiss() }
        avanza(800)
    }

    private fun abrePanel() {
        fun con(d: String) = compose.onAllNodesWithContentDescription(d).fetchSemanticsNodes().any(::visible)
        espera("el botón del panel o atrás") { con("Abrir panel") || con("Atrás") }
        while (!con("Abrir panel")) { pulsaDesc("Atrás"); avanza(300) }
        pulsaDesc("Abrir panel")
        avanza(500)
    }

    /**
     * Una llamada de red desde la prueba: en otro hilo, mientras el principal sigue moviéndose
     * (bloquearlo con runBlocking dejaba colgado lo que la app tenía en marcha en él).
     */
    private fun <T> red(bloque: suspend () -> T): T {
        val tarea = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).async { bloque() }
        espera("la red", ms = 60_000) { tarea.isCompleted }
        return runBlocking { tarea.await() }
    }

    // ---------- el editor: sus campos son EditText de Android, fuera del árbol de Compose ----------

    private fun campos(): List<CampoBloque> {
        val out = ArrayList<CampoBloque>()
        fun baja(v: View) {
            if (v is CampoBloque && v.isShown) out += v
            if (v is ViewGroup) for (i in 0 until v.childCount) baja(v.getChildAt(i))
        }
        baja(compose.activity.window.decorView)
        return out
    }

    private fun campoCon(texto: String): CampoBloque {
        var c: CampoBloque? = null
        espera("el bloque «$texto»") { c = campos().firstOrNull { it.text.toString() == texto }; c != null }
        return c!!
    }

    private fun enfocado(): CampoBloque {
        var c: CampoBloque? = null
        espera("un bloque con el cursor") { c = campos().firstOrNull { it.isFocused }; c != null }
        return c!!
    }

    /** Teclea letra a letra, como el teclado (así saltan los atajos de Markdown y los menús). */
    private fun teclea(c: CampoBloque, texto: String) {
        if (!c.isFocused) c.requestFocus()
        val ic = c.onCreateInputConnection(EditorInfo())!!
        for (letra in texto) {
            ic.commitText(letra.toString(), 1)
            avanza(30)
        }
        avanza(300)
    }

    private fun enter(c: CampoBloque) {
        c.onCreateInputConnection(EditorInfo())!!.commitText("\n", 1)
        avanza(400)
    }

    @Test
    fun recorrido() = runBlocking {
        assumeTrue("sin Notiono local (scripts/recorrido-android.ts)", NotionoLocal.base.isNotEmpty())
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = NotionoLocal.base
        val s = Servicios.de(ctx)
        NotionoLocal.entra(s.api, s.sesion, s.http)
        val destinos = Channel<Destino>(Channel.BUFFERED)
        compose.mainClock.autoAdvance = false
        compose.setContent { TemaNotiono(false) { Principal(destinos.receiveAsFlow()) } }
        espera("la app abierta") { hay("Inicio") }

        // ---------- Página: crear, título, escribir con formato, «/», casillas, mover, deshacer ----------
        pulsa("Nueva", arriba = false)
        espera("la página nueva") { campos().isNotEmpty() }
        reemplaza("Recorrido Android")
        val primero = campos().first()
        teclea(primero, "## Lista de la compra")
        enter(primero)
        val leche = enfocado()
        teclea(leche, "[] Leche")
        enter(leche)
        val pan = enfocado()
        teclea(pan, "Pan")
        enter(pan)
        val otro = enfocado()
        teclea(otro, "/cita")
        pulsa("Cita")
        val cita = enfocado()
        teclea(cita, "Es importante comprar fruta")
        // Negrita en «importante», con la barra de formato.
        cita.setSelection(3, 13)
        avanza(300)
        pulsaDesc("Negrita")
        fun negritas() = (cita.text as Spanned).getSpans(0, cita.text!!.length, NegritaSpan::class.java).size
        assertEquals(1, negritas())
        // Deshacer quita la negrita; rehacer la vuelve a poner.
        pulsaDesc("Deshacer")
        assertEquals(0, (campoCon("Es importante comprar fruta").text as Spanned).getSpans(0, 27, NegritaSpan::class.java).size)
        pulsaDesc("Rehacer")
        assertEquals(1, (campoCon("Es importante comprar fruta").text as Spanned).getSpans(0, 27, NegritaSpan::class.java).size)
        // Marcar «Leche» y subir «Pan» por encima (con la hoja del asa).
        pulsaDesc("Casilla", 0)
        pulsaDesc("Acciones del bloque", 2)
        pulsa("Subir")
        fun alto(c: CampoBloque) = IntArray(2).also { c.getLocationInWindow(it) }[1]
        espera("«Pan» encima de «Leche»") {
            val cs = campos()
            val p = cs.firstOrNull { it.text.toString() == "Pan" }
            val l = cs.firstOrNull { it.text.toString() == "Leche" }
            p != null && l != null && alto(p) < alto(l)
        }
        foto("pagina")

        // Comentario de página.
        pulsaDesc("Comentarios")
        escribe("¿Compramos también huevos?")
        pulsaDesc("Enviar")
        esperaTexto("¿Compramos también huevos?")
        cierraHoja()
        val pagina = red { s.repo.consulta("pages.search", objeto("query" to "Recorrido Android"), cachear = false) }
            .let { (it as JsonArray).first().comoObjeto.str("id")!! }
        hechos["pagina"] = pagina

        // ---------- Base de datos: crear, propiedades de cada tipo, ficha, subtarea ----------
        abrePanel()
        pulsa("Nueva base de datos")
        espera("la base de datos") { hay("Nombre", exacto = true) }
        reemplaza("Gastos del mes")
        avanza(1_000)
        pulsa("Nueva", arriba = true)
        espera("la ficha de la fila nueva") { hay("+ Añadir una propiedad") }
        reemplaza("Luz de octubre")
        for ((nombre, tipo) in listOf(
            "Categoría" to "Selección", "Importe" to "Número", "Fecha" to "Fecha", "Pagado" to "Casilla", "Quién" to "Persona",
            "Web" to "URL", "Etiquetas" to "Selección múltiple", "Estado" to "Estado",
        )) {
            pulsa("+ Añadir una propiedad")
            escribe(nombre)
            pulsa(tipo)
            espera("la propiedad «$nombre»") { hay(nombre, exacto = true) }
        }
        pulsa("Categoría")
        escribe("Casa")
        pulsa("Crear «Casa»")
        pulsa("Importe")
        escribe("42,5")
        pulsa("Hecho")
        pulsa("Fecha")
        pulsa("Hoy")
        pulsa("Hecho")
        pulsa("Pagado")
        pulsa("Quién")
        pulsa("Ana")
        cierraHoja()
        pulsa("Web")
        escribe("https://example.com")
        pulsa("Hecho")
        pulsa("Etiquetas")
        escribe("Luz")
        pulsa("Crear «Luz»")
        escribe("Mensual")
        pulsa("Crear «Mensual»")
        cierraHoja()
        pulsa("Estado")
        pulsa("En curso")
        espera("los valores en la ficha") { hay("Casa") && hay("42,5") && hay("En curso") && hay("Mensual") }
        foto("ficha")
        pulsa("+ Añadir subtarea")
        espera("la ficha de la subtarea") { hay("+ Añadir una propiedad") && !hay("Luz de octubre") }
        reemplaza("Pagar en el banco")
        avanza(1_500)
        pulsaDesc("Atrás")
        esperaTexto("Luz de octubre")
        pulsaDesc("Abrir la base de datos")
        esperaTexto("Gastos del mes")
        // Otra fila, sin pagar.
        pulsa("Nueva", arriba = true)
        espera("otra ficha") { hay("+ Añadir una propiedad") && !hay("Luz de octubre") }
        reemplaza("Agua")
        avanza(1_500)
        pulsaDesc("Atrás")
        espera("las dos filas en la tabla") { hay("Luz de octubre") && hay("Agua", exacto = true) }

        // Filtro: solo lo pagado.
        pulsaDesc("Filtrar")
        pulsa("Añadir filtro")
        pulsa("Pagado")
        pulsa("Elegir…")
        pulsa("Marcada")
        cierraHoja()
        espera("el filtro aplicado") { hay("Luz de octubre") && !hay("Agua", exacto = true) }
        foto("bd_filtrada")

        // Kanban: por Estado, y arrastrar la tarjeta a «Sin empezar».
        pulsaDesc("Cambiar de vista")
        pulsa("Nueva vista")
        pulsa("Kanban")
        espera("el Kanban") { hay("Sin asignar") }
        pulsaDesc("Ajustes de la vista")
        pulsa("Columnas por", exacto = false)
        pulsa("Estado")
        cierraHoja()
        espera("columnas de Estado") { hay("Sin empezar") && hay("En curso") }
        val tarjeta = compose.onAllNodes(hasText("Luz de octubre") and hasClickAction()).fetchSemanticsNodes().first()
        val dx = with(compose.density) { 250.dp.toPx() }
        compose.onNode(SemanticsMatcher("tarjeta") { it.id == tarjeta.id }).performTouchInput {
            down(Offset(12f, centerY))
            advanceEventTime(viewConfiguration.longPressTimeoutMillis + 200)
            repeat(10) { moveBy(Offset(-dx / 10, 0f)) }
            up()
        }
        avanza(1_500)
        foto("kanban")

        // Calendario: la fila sale hoy y se abre su ficha.
        pulsaDesc("Cambiar de vista")
        pulsa("Nueva vista")
        pulsa("Calendario")
        // «Hoy» y los días de la semana son del calendario (el Kanban de antes también enseña la fila).
        espera("el calendario") { hay("Hoy", exacto = true) && hay("Luz de octubre") }
        foto("calendario")
        pulsa("Luz de octubre")
        esperaTexto("+ Añadir subtarea")
        pulsaDesc("Atrás")

        val bd = red { s.repo.consulta("pages.search", objeto("query" to "Gastos del mes"), cachear = false) }
            .let { (it as JsonArray).first().comoObjeto.str("id")!! }
        hechos["bd"] = bd

        // ---------- Buscar ----------
        pulsa("Buscar")
        escribe("Recorrido")
        pulsa("Recorrido Android")
        espera("la página encontrada") { campos().any { it.text.toString() == "Lista de la compra" } }

        // ---------- Bandeja: el vencimiento de hoy abre su fila ----------
        red { s.repo.mutacion("notifications.checkDue", encolable = false) }
        pulsa("Bandeja")
        pulsa("Te toca", exacto = false)
        espera("la ficha del vencimiento") { hay("+ Añadir subtarea") && hay("Luz de octubre") }

        // ---------- Papelera: mandar la página y recuperarla ----------
        destinos.trySend(Destino.Pagina(pagina))
        espera("la página") { campos().any { it.text.toString() == "Lista de la compra" } }
        pulsaDesc("Más opciones")
        pulsa("Enviar a la papelera")
        pulsa("Enviar")
        avanza(1_000)
        abrePanel()
        pulsa("Papelera")
        pulsa("Recorrido Android")
        espera("la página recuperada") { campos().any { it.text.toString() == "Lista de la compra" } }

        // ---------- Plantillas ----------
        abrePanel()
        pulsa("Plantillas")
        pulsa("Notas de reunión")
        espera("la página de la plantilla") { campos().isNotEmpty() }
        hechos["plantilla"] = red { s.repo.consulta("pages.search", objeto("query" to "Notas de reunión"), cachear = false) }
            .let { (it as JsonArray).first().comoObjeto.str("id")!! }
        // Sale de la página: lo pendiente del editor se manda.
        pulsa("Inicio")
        avanza(2_000)

        // ---------- Widgets: marcar la casilla de una nota y la de una fila ----------
        val vista = red { s.repo.consulta("app.vista", objeto("pageId" to bd), cachear = false) }.comoObjeto
        val titulo = vista.objs("fields").first { it.str("type") == "text" }.str("id")!!
        val pagado = vista.objs("fields").first { it.str("name") == "Pagado" }.str("id")!!
        // (la vista tiene el filtro «Pagado»: el agua se busca en la de calendario, sin filtro)
        val calendario = vista.objs("views").first { it.str("type") == "calendar" }.str("id")!!
        val agua = red { s.repo.consulta("app.vista", objeto("pageId" to bd, "viewId" to calendario), cachear = false) }.comoObjeto
            .objs("filas").first { it.obj("cells")?.str(titulo) == "Agua" }.str("id")!!
        red { MarcaFila().onAction(ctx, AppWidgetId(-91), actionParametersOf(
            MarcaFila.PAGINA to bd, MarcaFila.FILA to agua, MarcaFila.CAMPO to pagado, MarcaFila.VALOR to "true",
        )) }
        val bloques = red { s.repo.consulta("app.bloques", objeto("id" to pagina), cachear = false) }.comoObjeto.arr("bloques")!!.map { it.comoObjeto }
        val idPan = bloques.first { Inline.textoPlano(it["content"]) == "Pan" }.str("id")!!
        red { MarcaCasilla().onAction(ctx, AppWidgetId(-92), actionParametersOf(MarcaCasilla.PAGINA to pagina, MarcaCasilla.BLOQUE to idPan)) }

        File("build/recorrido.json").writeText(JsonObject(hechos.mapValues { JsonPrimitive(it.value) }).toString())
        assertTrue(File("build/recorrido.json").exists())
        assertFalse(hechos.isEmpty())
    }
}
