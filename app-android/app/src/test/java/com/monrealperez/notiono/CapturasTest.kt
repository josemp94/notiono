package com.monrealperez.notiono

import android.content.Context
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.Destino
import com.monrealperez.notiono.ui.Principal
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.LocalDate

/**
 * Capturas de la app entera (Roborazzi) contra un Notiono local con datos realistas:
 * cada pantalla, cada tipo de vista de BD, la ficha de una fila y el editor (los
 * widgets, en WidgetsTest), en claro y en oscuro, a 390 dp. Las lanza `scripts/capturas-android.ts`
 * (sin Notiono local se saltan) y salen en `app/build/capturas/<modo>/`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class CapturasTest {
    @get:Rule val compose = createComposeRule()

    @Test fun claro() = recorre("claro", false)

    @Config(qualifiers = "+night")
    @Test fun oscuro() = recorre("oscuro", true)

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var modo: String

    private fun foto(nombre: String) = compose.onRoot().captureRoboImage("build/capturas/$modo/$nombre.png")

    /** Espera (con reloj real, la red es de verdad) a que algo salga en pantalla. */
    private fun espera(ms: Long = 20_000, cond: () -> Boolean) {
        val fin = System.currentTimeMillis() + ms
        while (!cond()) {
            if (System.currentTimeMillis() > fin) {
                foto("fallo")
                error("no salió a tiempo en $modo (ver fallo.png)")
            }
            compose.mainClock.advanceTimeBy(50)
            Thread.sleep(25)
        }
        // Lo que se pinta después (imágenes, animaciones de entrada).
        repeat(30) { compose.mainClock.advanceTimeBy(50); Thread.sleep(10) }
    }

    private var desde = 0L
    /** Para esperar un rato fijo con [espera]: cierto cuando han pasado `ms` desde la primera llamada. */
    private fun pasado(ms: Long): Boolean {
        val ahora = System.currentTimeMillis()
        if (desde == 0L) desde = ahora
        return (ahora - desde >= ms).also { if (it) desde = 0L }
    }

    private fun hay(texto: String) =
        compose.onAllNodesWithText(texto, substring = true, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()

    private fun esperaTexto(texto: String) = espera { hay(texto) }

    /** Pulsa lo que se ve con ese texto (no lo del panel cerrado, que también existe). */
    private fun pulsa(texto: String) {
        var nodo: SemanticsNode? = null
        espera {
            nodo = compose.onAllNodes(hasText(texto) and hasClickAction()).fetchSemanticsNodes()
                .lastOrNull { it.boundsInRoot.left >= 0f && it.boundsInRoot.right > 0f }
            nodo != null
        }
        compose.onNode(SemanticsMatcher("nodo ${nodo!!.id}") { it.id == nodo!!.id }).performClick()
    }

    /** El panel: desde las pantallas con «atrás» (Ajustes…) se vuelve antes a la anterior. */
    private fun abrePanel() {
        fun con(d: String) = compose.onAllNodesWithContentDescription(d).fetchSemanticsNodes().isNotEmpty()
        espera { con("Abrir panel") || con("Atrás") }
        if (!con("Abrir panel")) {
            compose.onAllNodesWithContentDescription("Atrás").onLast().performClick()
            espera { con("Abrir panel") }
        }
        compose.onAllNodesWithContentDescription("Abrir panel").onLast().performClick()
    }

    private fun recorre(nombreModo: String, oscuro: Boolean) = runBlocking {
        assumeTrue("sin Notiono local (scripts/capturas-android.ts)", NotionoLocal.base.isNotEmpty())
        modo = nombreModo
        // Una app recién instalada por prueba, apuntando al Notiono local.
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = NotionoLocal.base
        val s = Servicios.de(ctx)
        NotionoLocal.entra(s.api, s.sesion, s.http)
        val datos = siembra(s)

        val destinos = MutableSharedFlow<Destino>(extraBufferCapacity = 4)
                compose.mainClock.autoAdvance = false
        compose.setContent { TemaNotiono(oscuro) { Principal(destinos) } }
        fun ve(d: Destino) {
            destinos.tryEmit(d)
            compose.mainClock.advanceTimeBy(100)
        }

        // Documento: el editor de bloques con todo tipo de bloques.
        // (el texto de los bloques vive en EditText, fuera del árbol de Compose: se espera al título)
        ve(Destino.Pagina(datos.viaje))
        esperaTexto("Viaje a Asturias")
        espera(2_000) { pasado(1_500) }
        foto("pagina_documento")
        // La lista del editor (la visible: la del panel cerrado también existe, fuera de pantalla).
        val editor = compose.onAllNodes(hasScrollToIndexAction()).fetchSemanticsNodes().first { it.boundsInRoot.left >= 0f }
        compose.onNode(SemanticsMatcher("editor") { it.id == editor.id })
            .performScrollToIndex(editor.config[SemanticsProperties.CollectionInfo].rowCount - 1)
        espera(2_000) { pasado(1_000) }
        foto("pagina_documento_abajo")
        ve(Destino.Pagina(datos.tortilla))
        esperaTexto("Recetas")
        espera(2_000) { pasado(1_500) }
        foto("pagina_subpagina")

        // La base de datos, en cada tipo de vista.
        for ((id, tipo) in datos.vistas) {
            ve(Destino.Pagina(datos.bd, id))
            esperaTexto(when (tipo) { "chart" -> "Alta"; "form" -> "Prioridad"; else -> "Pintar el salón" })
            foto("bd_$tipo")
        }
        ve(Destino.Fila(datos.bd, datos.fila))
        esperaTexto("Responsable")
        espera(2_000) { pasado(1_500) }
        foto("bd_ficha")

        // Las pantallas de la barra de abajo y las del panel.
        pulsa("Inicio")
        esperaTexto("Viaje a Asturias")
        foto("inicio")
        // El Inicio personalizado (todos los bloques y enlaces fijados) y el modo Personalizar.
        s.repo.mutacion("inicio.guardar", objeto(
            "bloques" to listOf("hoy", "proximas", "enlaces", "favoritos", "recientes", "tareas").map { objeto("id" to it, "visible" to (it != "tareas")) },
            "enlaces" to listOf(objeto("id" to "e1", "tipo" to "pagina", "pageId" to datos.viaje), objeto("id" to "e2", "tipo" to "web", "url" to "https://www.aemet.es/", "titulo" to "El tiempo")),
            "abrir" to objeto("tipo" to "inicio"),
        ), encolable = false, etiquetas = listOf("inicio"))
        esperaTexto("Enlaces fijados")
        espera(2_000) { pasado(1_000) }
        foto("inicio_bloques")
        pulsa("Personalizar")
        esperaTexto("Al abrir Notiono, mostrar")
        foto("inicio_personalizar")
        pulsa("Listo")
        abrePanel()
        esperaTexto("Papelera")
        foto("panel")
        pulsa("Ajustes")
        esperaTexto("Marta")
        foto("ajustes")
        abrePanel()
        pulsa("Plantillas")
        espera { hay("Lista de tareas") || hay("Diario") || hay("Reunión") }
        foto("plantillas")
        abrePanel()
        pulsa("Papelera")
        esperaTexto("Borrador viejo")
        foto("papelera")
        pulsa("Buscar")
        espera { compose.onAllNodes(hasSetTextAction()).fetchSemanticsNodes().isNotEmpty() }
        compose.onAllNodes(hasSetTextAction()).onLast().performTextInput("tortilla")
        esperaTexto("Tortilla de patatas")
        foto("buscar")
        pulsa("Tareas")
        esperaTexto("Renovar el DNI")
        foto("tareas")
        pulsa("Bandeja")
        esperaTexto("Bandeja")
        foto("bandeja")

    }

    /** Lo que se ha sembrado en el Notiono local. */
    private class Datos(
        val viaje: String, val tortilla: String, val bd: String, val fila: String,
        val vistas: List<Pair<String, String>>,
    )

    /** Un espacio con páginas y una base de datos de tareas de casa (una vez por persona). */
    private suspend fun siembra(s: Servicios): Datos {
        val r = s.repo
        suspend fun m(ruta: String, vararg pares: Pair<String, Any?>) = r.mutacion(ruta, objeto(*pares), encolable = false)!!
        val yo = r.consulta("auth.me").comoObjeto.str("id")!!
        val arbol = r.consulta("pages.tree", cachear = false).comoLista.map { it.comoObjeto }
        val ya = arbol.firstOrNull { it.str("title") == "Tareas de casa" }
        if (ya == null) {
            // Páginas
            val viaje = m("pages.create", "title" to "Viaje a Asturias").comoObjeto.str("id")!!
            m("pages.rename", "id" to viaje, "title" to "Viaje a Asturias", "icon" to "🏔️")
            m("pages.setCover", "id" to viaje, "cover" to "gradient:sunset")
            m("app.aplicar", "id" to viaje, "ops" to opsDe(BLOQUES_VIAJE))
            m("pages.toggleFavorite", "pageId" to viaje)
            val recetas = m("pages.create", "title" to "Recetas").comoObjeto.str("id")!!
            m("pages.rename", "id" to recetas, "title" to "Recetas", "icon" to "🍲")
            val tortilla = m("pages.create", "parentId" to recetas, "title" to "Tortilla de patatas").comoObjeto.str("id")!!
            m("pages.rename", "id" to tortilla, "title" to "Tortilla de patatas", "icon" to "🥔")
            m("app.aplicar", "id" to tortilla, "ops" to opsDe(BLOQUES_TORTILLA))
            m("pages.create", "parentId" to recetas, "title" to "Lentejas de la abuela")
            val diario = m("pages.create", "title" to "Diario").comoObjeto.str("id")!!
            m("pages.rename", "id" to diario, "title" to "Diario", "icon" to "📓")
            val viejo = m("pages.create", "title" to "Borrador viejo").comoObjeto.str("id")!!
            m("pages.archive", "id" to viejo)

            // Base de datos
            val bd = m("db.create", "title" to "Tareas de casa").comoObjeto.str("id")!!
            m("pages.rename", "id" to bd, "title" to "Tareas de casa", "icon" to "✅")
            var v = r.consulta("app.vista", objeto("pageId" to bd), cachear = false).comoObjeto
            val col = v.obj("collection")!!.str("id")!!
            v.objs("filas").forEach { m("db.deleteRecord", "id" to it.str("id")) }
            for ((nombre, tipo) in listOf("Estado" to "status", "Fecha" to "date", "Responsable" to "person", "Hecho" to "checkbox", "Coste" to "number")) {
                m("db.addField", "collectionId" to col, "name" to nombre, "type" to tipo)
            }
            m("db.addView", "collectionId" to col, "type" to "kanban", "name" to "Por estado")
            for (t in listOf("Prioridad" to "select", "Etiquetas" to "multiselect")) m("db.addField", "collectionId" to col, "name" to t.first, "type" to t.second)
            for (t in listOf("list", "gallery", "calendar", "timeline", "chart", "form")) m("db.addView", "collectionId" to col, "type" to t)
            val hoy = LocalDate.now()
            fun d(n: Long) = hoy.plusDays(n).toString()
            m(
                "db.importCsvInto", "collectionId" to col,
                "headers" to listOf("Nombre", "Estado", "Prioridad", "Fecha", "Coste", "Etiquetas"),
                "rows" to listOf(
                    listOf("Pintar el salón", "En curso", "Alta", d(2), "180", "Casa,Bricolaje"),
                    listOf("Revisar la caldera", "Sin empezar", "Media", d(5), "90", "Casa"),
                    listOf("Renovar el DNI", "Sin empezar", "Alta", d(1), "12", "Papeles"),
                    listOf("Comprar regalo de Lucía", "Hecho", "Baja", d(-3), "45", "Compras"),
                    listOf("Cambiar el aceite del coche", "En curso", "Media", d(9), "70", "Coche"),
                    listOf("Declaración de la renta", "Hecho", "Alta", d(-10), "0", "Papeles"),
                    listOf("Podar el limonero", "Sin empezar", "Baja", d(14), "", "Jardín"),
                ),
            )
            v = r.consulta("app.vista", objeto("pageId" to bd), cachear = false).comoObjeto
            val campo = { n: String -> v.objs("fields").first { it.str("name") == n }.str("id")!! }
            for (f in v.objs("filas")) {
                val nombre = f.obj("textos")!!.str(campo("Nombre"))
                if (nombre in setOf("Pintar el salón", "Renovar el DNI", "Cambiar el aceite del coche")) {
                    m("db.updateCell", "recordId" to f.str("id"), "fieldId" to campo("Responsable"), "value" to listOf(yo))
                }
                if (nombre in setOf("Comprar regalo de Lucía", "Declaración de la renta")) {
                    m("db.updateCell", "recordId" to f.str("id"), "fieldId" to campo("Hecho"), "value" to true)
                }
                if (nombre == "Pintar el salón") {
                    m("db.updateCell", "recordId" to f.str("id"), "fieldId" to campo("Fecha"), "value" to objeto("start" to d(2), "end" to d(6)))
                    m("app.aplicarFila", "recordId" to f.str("id"), "ops" to opsDe(BLOQUES_FILA))
                }
            }
        }
        val arbol2 = r.consulta("pages.tree", cachear = false).comoLista.map { it.comoObjeto }
        fun busca(nodos: List<JsonObject>, t: String): JsonObject? =
            nodos.firstNotNullOfOrNull { n -> if (n.str("title") == t) n else busca(n.objs("children"), t) }
        val viaje = busca(arbol2, "Viaje a Asturias")!!.str("id")!!
        val bd = busca(arbol2, "Tareas de casa")!!.str("id")!!
        val v = r.consulta("app.vista", objeto("pageId" to bd), cachear = false).comoObjeto
        val nombre = v.objs("fields").first { it.str("name") == "Nombre" }.str("id")!!
        return Datos(
            viaje = viaje,
            tortilla = busca(arbol2, "Tortilla de patatas")!!.str("id")!!,
            bd = bd,
            fila = v.objs("filas").first { it.obj("textos")!!.str(nombre) == "Pintar el salón" }.str("id")!!,
            vistas = v.objs("views").map { it.str("id")!! to it.str("type")!! },
        )
    }

    private fun opsDe(bloques: String): List<JsonObject> {
        val bs = json.parseToJsonElement(bloques).jsonArray.map { it.comoObjeto }
        return bs.mapIndexed { i, b ->
            JsonObject(mapOf("op" to JsonPrimitive("upsert"), "block" to b) + (if (i > 0) mapOf("afterId" to bs[i - 1]["id"]!!) else emptyMap()))
        }
    }

    private companion object {
        val BLOQUES_VIAJE = """[
          {"id":"v1","type":"heading","props":{"level":2},"content":[{"type":"text","text":"Plan","styles":{}}]},
          {"id":"v2","type":"paragraph","content":[{"type":"text","text":"Salimos el ","styles":{}},{"type":"text","text":"viernes a las 8:00","styles":{"bold":true}},{"type":"text","text":" desde Madrid. Reserva en el ","styles":{}},{"type":"link","href":"https://example.com","content":[{"type":"text","text":"hotel de Cangas","styles":{}}]},{"type":"text","text":".","styles":{}}]},
          {"id":"v3","type":"checkListItem","props":{"checked":true},"content":[{"type":"text","text":"Reservar hotel","styles":{}}]},
          {"id":"v4","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Comprar billetes de tren","styles":{}}]},
          {"id":"v5","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Preparar la maleta","styles":{}}]},
          {"id":"v6","type":"callout","props":{"color":"naranja","emoji":"💡"},"content":[{"type":"text","text":"Llevar chubasquero: en Asturias llueve hasta en agosto.","styles":{}}]},
          {"id":"v7","type":"heading","props":{"level":2},"content":[{"type":"text","text":"Ruta","styles":{}}]},
          {"id":"v8","type":"numberedListItem","content":[{"type":"text","text":"Oviedo","styles":{}}],"children":[
            {"id":"v8a","type":"bulletListItem","content":[{"type":"text","text":"Catedral y casco antiguo","styles":{}}]}]},
          {"id":"v9","type":"numberedListItem","content":[{"type":"text","text":"Cudillero","styles":{}}]},
          {"id":"v10","type":"numberedListItem","content":[{"type":"text","text":"Lagos de Covadonga","styles":{"italic":true}}]},
          {"id":"v11","type":"quote","content":[{"type":"text","text":"Asturias, paraíso natural.","styles":{}}]},
          {"id":"v12","type":"divider","props":{}},
          {"id":"v13","type":"toggleListItem","content":[{"type":"text","text":"Presupuesto","styles":{}}],"children":[
            {"id":"v13a","type":"paragraph","content":[{"type":"text","text":"Unos 600 € entre los dos.","styles":{}}]}]},
          {"id":"v14","type":"table","content":{"type":"tableContent","columnWidths":[null,null],"rows":[
            {"cells":[[{"type":"text","text":"Concepto","styles":{"bold":true}}],[{"type":"text","text":"Importe","styles":{"bold":true}}]]},
            {"cells":[[{"type":"text","text":"Hotel","styles":{}}],[{"type":"text","text":"320 €","styles":{}}]]},
            {"cells":[[{"type":"text","text":"Tren","styles":{}}],[{"type":"text","text":"140 €","styles":{}}]]}]}},
          {"id":"v15","type":"codeBlock","props":{"language":"javascript"},"content":[{"type":"text","text":"const salida = '08:00';","styles":{}}]}
        ]"""
        val BLOQUES_TORTILLA = """[
          {"id":"t1","type":"heading","props":{"level":3},"content":[{"type":"text","text":"Ingredientes","styles":{}}]},
          {"id":"t2","type":"bulletListItem","content":[{"type":"text","text":"Patatas (1 kg)","styles":{}}]},
          {"id":"t3","type":"bulletListItem","content":[{"type":"text","text":"6 huevos","styles":{}}]},
          {"id":"t4","type":"bulletListItem","content":[{"type":"text","text":"Cebolla, ","styles":{}},{"type":"text","text":"opcional","styles":{"italic":true}}]},
          {"id":"t5","type":"paragraph","content":[{"type":"text","text":"Pochar a fuego lento 25 minutos.","styles":{}}]}
        ]"""
        val BLOQUES_FILA = """[
          {"id":"f1","type":"paragraph","content":[{"type":"text","text":"Color: blanco roto. Dos manos.","styles":{}}]},
          {"id":"f2","type":"checkListItem","props":{"checked":true},"content":[{"type":"text","text":"Comprar pintura","styles":{}}]},
          {"id":"f3","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Cinta de carrocero","styles":{}}]}
        ]"""
    }
}
