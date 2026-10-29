package com.monrealperez.notiono

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.monrealperez.notiono.editor.CampoBloque
import com.monrealperez.notiono.editor.PuenteDibujo
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.Destino
import com.monrealperez.notiono.ui.Principal
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
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
import java.util.zip.ZipFile

/**
 * Lo de la 2.5.0 (lo que hacía la app de notas de Pablo) recorrido como una persona, contra
 * un Notiono de verdad en local: dibujar y guardar, reabrir el dibujo y seguir, exportar a
 * Word, «@recordar mañana», el bloc de notas del Inicio y añadir rápido en Mis tareas. Lo lanza
 * `scripts/recorrido-android.ts`, que después mira en el servidor que todo quedó bien.
 *
 * El lienzo es la página `/dibujo` de la web en un WebView (en Robolectric no corre su
 * JavaScript): la prueba hace lo que hace esa página al pulsar Hecho —subir la escena y el
 * PNG a /api/upload con la sesión de la app— y llama al puente como lo llamaría ella. Que la
 * página en sí dibuja y guarda lo prueba Playwright.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class RecorridoPabloTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private val hechos = linkedMapOf<String, String>()

    private fun foto(nombre: String) = compose.onRoot().captureRoboImage("build/recorrido/pablo-$nombre.png")

    private fun avanza(ms: Long = 100) {
        var t = 0L
        while (t < ms) {
            compose.mainClock.advanceTimeBy(50)
            shadowOf(Looper.getMainLooper()).idle()
            t += 50
        }
    }

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

    private fun pulsaNodo(n: SemanticsNode) {
        compose.onNode(SemanticsMatcher("nodo ${n.id}") { it.id == n.id }).performClick()
        avanza(400)
    }

    private fun pulsa(texto: String, exacto: Boolean = true, arriba: Boolean = false) = espera("poder pulsar «$texto»") {
        val nodos = compose.onAllNodes(hasText(texto, substring = !exacto) and hasClickAction()).fetchSemanticsNodes().filter(::visible)
        val nodo = (if (arriba) nodos.minByOrNull { it.boundsInRoot.top } else nodos.lastOrNull()) ?: return@espera false
        runCatching { pulsaNodo(nodo) }.isSuccess
    }

    private fun pulsaDesc(desc: String, indice: Int = -1) = espera("el botón «$desc»") {
        val nodos = compose.onAllNodesWithContentDescription(desc).fetchSemanticsNodes().filter(::visible)
        if (nodos.size <= maxOf(indice, 0)) return@espera false
        runCatching { pulsaNodo(if (indice < 0) nodos.last() else nodos[indice]) }.isSuccess
    }

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

    private fun <T> red(bloque: suspend () -> T): T {
        val tarea = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).async { bloque() }
        espera("la red", ms = 60_000) { tarea.isCompleted }
        return runBlocking { tarea.await() }
    }

    private fun vistas(raiz: View, out: MutableList<View> = ArrayList()): List<View> {
        out += raiz
        if (raiz is ViewGroup) for (i in 0 until raiz.childCount) vistas(raiz.getChildAt(i), out)
        return out
    }

    private fun campos() = vistas(compose.activity.window.decorView).filterIsInstance<CampoBloque>().filter { it.isShown }

    private fun enfocado(): CampoBloque {
        var c: CampoBloque? = null
        espera("un bloque con el cursor") { c = campos().firstOrNull { it.isFocused }; c != null }
        return c!!
    }

    private fun teclea(c: CampoBloque, texto: String) {
        if (!c.isFocused) c.requestFocus()
        val ic = c.onCreateInputConnection(EditorInfo())!!
        for (letra in texto) {
            ic.commitText(letra.toString(), 1)
            avanza(30)
        }
        avanza(300)
    }

    /** El WebView del lienzo (en su diálogo a pantalla completa). */
    private fun lienzo(): WebView {
        var w: WebView? = null
        espera("el lienzo del dibujo") {
            w = ShadowDialog.getLatestDialog()?.window?.decorView?.let { vistas(it) }?.filterIsInstance<WebView>()?.firstOrNull()
            w != null && shadowOf(w).lastLoadedUrl != null
        }
        return w!!
    }

    /**
     * Lo que hace la página `/dibujo` al pulsar Hecho: sube la escena (JSON de Excalidraw, con
     * su fondo) y la vista previa (PNG) con la sesión de la app, y llama al puente.
     */
    private fun guardaDibujo(w: WebView, trazos: Int, s: Servicios): Pair<String, String> {
        val elementos = (1..trazos).joinToString(",") { i ->
            """{"id":"t$i","type":"freedraw","x":${i * 20},"y":10,"width":40,"height":20,"strokeColor":"#1e1e1e","strokeWidth":1,"opacity":100,"points":[[0,0],[20,10],[40,0]],"pressures":[],"simulatePressure":true,"isDeleted":false,"version":1,"versionNonce":$i,"seed":$i}"""
        }
        val escena = """{"type":"excalidraw","version":2,"source":"notiono","elements":[$elementos],"appState":{"viewBackgroundColor":"transparent"},"files":{},"notiono":{"fondo":"puntos"}}"""
        val png = android.graphics.Bitmap.createBitmap(64, 32, android.graphics.Bitmap.Config.ARGB_8888).apply { eraseColor(android.graphics.Color.WHITE) }
            .let { b -> java.io.ByteArrayOutputStream().also { b.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }.toByteArray() }
        val (e, p) = red { s.api.subir(escena.toByteArray(), "dibujo.json", "application/json") to s.api.subir(png, "dibujo.png", "image/png") }
        val puente = shadowOf(w).getJavascriptInterface("NotionoApp") as PuenteDibujo
        puente.guardado("""{"escena":"${e.url}","imagen":"${p.url}","texto":""}""")
        avanza(500)
        return e.url to p.url
    }

    @Test
    fun recorrido() = runBlocking {
        assumeTrue("sin Notiono local (scripts/recorrido-android.ts)", NotionoLocal.base.isNotEmpty())
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = NotionoLocal.base
        val s = Servicios.de(ctx)
        NotionoLocal.entra(s.api, s.sesion, s.http)
        // Una BD de tareas (la plantilla) y el Inicio con los bloques nuevos a la vista.
        val tareas = s.api.mutation("pages.createFromTemplate", objeto("key" to "tareas")).comoObjeto.str("id")!!
        val inicio = s.api.query("inicio.get").comoObjeto["config"]!!.comoObjeto
        s.api.mutation("inicio.guardar", JsonObject(inicio - "bloc" + ("tareas" to JsonPrimitive(tareas)) + ("bloques" to JsonArray(
            listOf("bloc", "acciones", "recordatorios", "recientes", "tareas").map { objeto("id" to it, "visible" to true) },
        ))))
        hechos["tareasBd"] = tareas
        val destinos = Channel<Destino>(Channel.BUFFERED)
        compose.mainClock.autoAdvance = false
        compose.setContent { TemaNotiono(false) { Principal(destinos.receiveAsFlow()) } }
        espera("la app abierta") { hay("Inicio") }

        // ---------- Dibujo: «/dibujo», guardar, reabrir y seguir ----------
        pulsa("Nueva", arriba = false)
        espera("la página nueva") { campos().isNotEmpty() }
        val t = campoTexto() // el título
        compose.onNode(SemanticsMatcher("título ${t.id}") { it.id == t.id }).performTextReplacement("Apuntes de Pablo")
        avanza(300)
        val primero = campos().first()
        teclea(primero, "/dibujo")
        pulsa("Dibujo")
        val w1 = lienzo()
        assertTrue(shadowOf(w1).lastLoadedUrl, shadowOf(w1).lastLoadedUrl.contains("/dibujo?escena=&tema=light"))
        foto("dibujo-lienzo")
        val (escena1, _) = guardaDibujo(w1, 1, s)
        val pagina = red { s.repo.consulta("pages.search", objeto("query" to "Apuntes de Pablo"), cachear = false) }
            .let { (it as JsonArray).first().comoObjeto.str("id")!! }
        hechos["pagina"] = pagina
        espera("el dibujo, en el servidor", ms = 30_000) {
            shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(600))
            red { s.repo.fresca("app.bloques", objeto("id" to pagina), cachear = false) }.toString().contains(escena1)
        }
        // La vista previa (la imagen la carga Coil: el nodo está aunque aún no tenga alto).
        espera("la vista previa en la página") { compose.onAllNodes(hasContentDescription("Dibujo"), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        avanza(1_500)
        foto("dibujo-pagina")
        // Reabrirlo: el lienzo carga la escena guardada y se sigue dibujando.
        espera("poder tocar el dibujo") {
            val n = compose.onAllNodes(hasContentDescription("Dibujo") and hasClickAction()).fetchSemanticsNodes().firstOrNull() ?: return@espera false
            runCatching { pulsaNodo(n) }.isSuccess
        }
        val w2 = lienzo()
        assertTrue(shadowOf(w2).lastLoadedUrl, shadowOf(w2).lastLoadedUrl.contains("escena=" + Uri.encode(escena1)))
        val (escena2, imagen2) = guardaDibujo(w2, 2, s)
        hechos["escena"] = escena2
        hechos["imagen"] = imagen2
        espera("el dibujo seguido, en el servidor", ms = 30_000) {
            shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(600))
            red { s.repo.fresca("app.bloques", objeto("id" to pagina), cachear = false) }.toString().contains(escena2)
        }

        // ---------- Exportar (como Notion) en Word: el .docx que se comparte ----------
        pulsaDesc("Más opciones")
        pulsa("Exportar")
        pulsa("Word (.docx)")
        pulsa("Exportar")
        var docx: File? = null
        espera("el Word, listo para compartir", ms = 30_000) {
            docx = File(ctx.cacheDir, "export").listFiles()?.firstOrNull { it.name.endsWith(".docx") }
            docx != null
        }
        assertEquals("Apuntes_de_Pablo.docx", docx!!.name)
        val compartir = generateSequence { shadowOf(ctx as android.app.Application).nextStartedActivity }.firstOrNull { it.action == Intent.ACTION_CHOOSER }
        assertTrue("se ofrece con el menú de compartir", compartir != null)
        ZipFile(docx).use { z ->
            val xml = z.getInputStream(z.getEntry("word/document.xml")).readBytes().toString(Charsets.UTF_8)
            assertTrue("el Word lleva el título", xml.contains("Apuntes de Pablo"))
            assertTrue("y el dibujo, como imagen", z.entries().asSequence().any { it.name.startsWith("word/media/") })
        }

        // ---------- «@recordar mañana» (como Notion): mención de fecha con aviso a las 9:00 ----------
        teclea(campos().last(), "@recordar mañana")
        pulsa("Recordar mañana a las 9:00")
        espera("el recordatorio, en el servidor", ms = 30_000) {
            shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(600))
            red { s.repo.fresca("app.bloques", objeto("id" to pagina), cachear = false) }.toString()
                .let { it.contains("dateMention") && it.contains("\"recordatorio\":\"0\"") && it.contains("T09:00") }
        }
        foto("recordatorio")

        // ---------- Inicio: el bloc de notas se guarda solo y se convierte en página ----------
        pulsa("Inicio")
        espera("el Inicio con el bloc") { hay("Bloc de notas") && hay("Acciones rápidas") }
        val bloc = compose.onAllNodes(hasContentDescription("Bloc de notas rápido")).fetchSemanticsNodes().first()
        compose.onNode(SemanticsMatcher("bloc") { it.id == bloc.id }).performTextInput("Ideas de Pablo\n- [ ] Comprar pilas")
        espera("el bloc guardado", ms = 30_000) { avanza(400); hay("Guardado") }
        foto("inicio")
        assertTrue(red { s.api.query("inicio.get") }.toString().contains("Comprar pilas"))
        pulsa("Convertir en página")
        espera("la página del bloc") { campos().any { it.text.toString().contains("Comprar pilas") } }
        hechos["bloc"] = red { s.repo.consulta("pages.search", objeto("query" to "Ideas de Pablo"), cachear = false) }
            .let { (it as JsonArray).first().comoObjeto.str("id")!! }

        // ---------- Mis tareas: añadir rápido y marcarla hecha con el círculo ----------
        pulsa("Tareas")
        espera("Mis tareas") { hay("Van a:", exacto = false) }
        pulsaDesc("Añadir")
        espera("la hoja de la tarea nueva") { hay("Nueva tarea") }
        escribe("Comprar pan para Pablo")
        pulsa("Añadir")
        espera("la tarea en la lista", ms = 30_000) { hay("Comprar pan para Pablo") }
        foto("mis-tareas")
        val fila = compose.onAllNodes(hasText("Comprar pan para Pablo")).fetchSemanticsNodes().first()
        val circulo = compose.onAllNodes(hasContentDescription("Marcar hecha")).fetchSemanticsNodes()
            .minByOrNull { kotlin.math.abs(it.boundsInRoot.center.y - fila.boundsInRoot.center.y) }!!
        pulsaNodo(circulo)
        espera("hecha en el servidor", ms = 30_000) {
            (red { s.api.query("db.myTasks", objeto("conHechas" to true)) } as JsonArray).map { it.comoObjeto }
                .any { it.str("title") == "Comprar pan para Pablo" && it["hecha"] == JsonPrimitive(true) }
        }
        foto("mis-tareas-hecha")

        File("build/recorrido-pablo.json").writeText(JsonObject(hechos.mapValues { JsonPrimitive(it.value) }).toString())
    }
}
