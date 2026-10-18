package com.monrealperez.notiono.editor

import android.text.SpannableStringBuilder
import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Documentos y tablas con formas raras: el editor los enseña y los edita sin cerrarse. */
@RunWith(RobolectricTestRunner::class)
class RobustezEditorTest {
    private val pal = Paleta.clara

    private fun parrafo(id: String, t: String, hijos: List<JsonObject> = emptyList()) = JsonObject(mapOf(
        "id" to JsonPrimitive(id), "type" to JsonPrimitive("paragraph"), "props" to JsonObject(emptyMap()),
        "content" to JsonPrimitive(t), "children" to JsonArray(hijos),
    ))

    @Test
    fun unIdRepetidoSePintaUnaVez() {
        // Dos bloques con el mismo id (un documento mal mezclado): son las claves de la lista
        // perezosa y repetidas la cierran, así que la página no se podría abrir nunca.
        val e = EstadoEditor(pal, true)
        e.carga(listOf(parrafo("a", "uno"), parrafo("b", "dos", listOf(parrafo("a", "otra vez"))), parrafo("b", "tres")))
        val ids = e.visibles().map { it.b.id }
        assertEquals(listOf("a", "b"), ids)
    }

    @Test
    fun quitarLaConsultaDeUnMenuConElTextoCambiado() {
        val t = SpannableStringBuilder("hola /tab")
        // Lo normal: se quita «/tab» y lo elegido va donde estaba la barra.
        assertEquals(5, quitaConsulta(t, MenuEscritura('/', "b", 5, "tab"), 9))
        assertEquals("hola ", t.toString())
        // El texto cambió por debajo y el menú apunta más allá del final o a otra cosa: nada se borra.
        val u = SpannableStringBuilder("hi")
        assertEquals(2, quitaConsulta(u, MenuEscritura('/', "b", 5, "tab"), 9))
        assertEquals("hi", u.toString())
        val v = SpannableStringBuilder("hola mundo")
        assertEquals(3, quitaConsulta(v, MenuEscritura('@', "b", 2, "x"), 3))
        assertEquals("hola mundo", v.toString())
    }

    @Test
    fun tablasConOtraFormaNoCierranLaApp() {
        // Filas con distinto número de celdas (celdas combinadas) y una celda fuera de rango.
        val rara = json.parseToJsonElement("""{"type":"tableContent","rows":[
            {"cells":[{"type":"tableCell","content":[],"props":{}},{"type":"tableCell","content":[],"props":{}}]},
            {"cells":[{"type":"tableCell","content":[],"props":{}}]}
        ]}""")
        val nuevo = JsonArray(listOf(JsonObject(mapOf("type" to JsonPrimitive("text"), "text" to JsonPrimitive("x"), "styles" to JsonObject(emptyMap())))))
        assertEquals(rara, Tabla.conCelda(rara, 1, 1, nuevo))
        assertEquals(rara, Tabla.conCelda(rara, 7, 0, nuevo))
        assertEquals("x", Inline.textoPlano(Tabla.celdas(Tabla.conCelda(rara, 1, 0, nuevo))[1][0]))
        // Añadir y quitar sobre formas raras, sin contenido o con índices fuera.
        assertEquals(3, Tabla.celdas(Tabla.añadeFila(rara, 9)).size)
        assertEquals(2, Tabla.celdas(Tabla.añadeFila(rara, 9))[2].size)
        // Sin contenido de tabla: se parte de una de 1×1.
        assertEquals(2, Tabla.celdas(Tabla.añadeFila(JsonNull, 0)).size)
        assertEquals(2, Tabla.celdas(Tabla.añadeFila(JsonPrimitive("x"), 0)).size)
        assertEquals(2, Tabla.celdas(Tabla.quitaFila(rara, 5)).size)
        assertEquals(listOf(1, 1), Tabla.celdas(Tabla.quitaColumna(rara, 1)).map { it.size })
        assertEquals(listOf(3, 2), Tabla.celdas(Tabla.añadeColumna(rara, 1)).map { it.size })
        assertEquals(0, Tabla.celdas(Tabla.añadeColumna(json.parseToJsonElement("""{"rows":"no"}"""), 0)).size)
    }
}
