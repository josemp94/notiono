package com.monrealperez.notiono.editor

import android.text.SpannableStringBuilder
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Documentos de prueba compartidos con el servidor (scripts/fixtures, en el classpath de test). */
fun fixture(nombre: String): List<JsonObject> {
    val texto = ModeloTest::class.java.classLoader!!.getResourceAsStream(nombre)!!.bufferedReader().use { it.readText() }
    return (json.parseToJsonElement(texto) as JsonArray).map { it as JsonObject }
}

fun fixtures(): List<String> =
    ModeloTest::class.java.classLoader!!.getResource("bloques-todos.json")!!.let { java.io.File(it.toURI()).parentFile!! }
        .listFiles { f -> f.name.endsWith(".json") }!!.map { it.name }.sorted()

@RunWith(RobolectricTestRunner::class)
class ModeloTest {
    private val pal = Paleta.clara

    @Test
    fun idaYVueltaExactaDeTodosLosDocumentos() {
        val nombres = fixtures()
        assertTrue("debería haber documentos de prueba", nombres.isNotEmpty())
        for (n in nombres) {
            val doc = fixture(n)
            val vuelta = doc.map { Bloque.deJson(it, pal).aJson() }
            for ((a, b) in doc.zip(vuelta)) assertEquals("ida y vuelta de ${a.str("id")} en $n", normaliza(a), normaliza(b))
        }
    }

    /** null y ausente son lo mismo (BlockNote deja undefined donde el JSON guardado pone null). */
    private fun normaliza(e: kotlinx.serialization.json.JsonElement): kotlinx.serialization.json.JsonElement = when (e) {
        is JsonObject -> JsonObject(e.filterValues { it !is kotlinx.serialization.json.JsonNull }.mapValues { normaliza(it.value) })
        is JsonArray -> JsonArray(e.map { normaliza(it) })
        else -> e
    }

    @Test
    fun estilosEnlacesYChips() {
        val contenido = json.parseToJsonElement(
            """[{"type":"text","text":"hola ","styles":{}},{"type":"text","text":"mundo","styles":{"bold":true,"textColor":"red"}},
               {"type":"link","href":"https://x.es","content":[{"type":"text","text":"enlace","styles":{"italic":true}}]},
               {"type":"mention","props":{"pageId":"p1","title":"Otra","icon":"📄"}},
               {"type":"text","text":"raro","styles":{"miEstilo":"x"}}]""",
        )
        val sp = Inline.aSpannable(contenido, pal)
        assertEquals("hola mundoenlace${OBJ}raro", sp.toString())
        assertEquals(contenido, Inline.aJson(sp))
        // Poner negrita en «hola» parte el texto en dos tramos y no toca lo demás.
        Inline.alterna(sp, "bold", JsonPrimitive(true), 0, 4, pal, true)
        val j = Inline.aJson(sp)
        assertEquals("hola", (j[0] as JsonObject).str("text"))
        assertEquals(JsonObject(mapOf("bold" to JsonPrimitive(true))), (j[0] as JsonObject)["styles"])
        assertEquals(" ", (j[1] as JsonObject).str("text"))
        // Escribir al final de un tramo con estilo lo continúa (como en cualquier editor).
        val sb = SpannableStringBuilder(Inline.aSpannable(json.parseToJsonElement("""[{"type":"text","text":"ab","styles":{"bold":true}}]"""), pal))
        sb.append("c")
        assertEquals(json.parseToJsonElement("""[{"type":"text","text":"abc","styles":{"bold":true}}]"""), Inline.aJson(sb))
    }

    @Test
    fun lasOperacionesLlevanDeBaseALocal() {
        val base = fixture("bloques-todos.json")
        val local = base.map { Bloque.deJson(it, pal) }.toMutableList()
        // Editar texto, convertir, mover, sangrar, insertar y borrar, como haría el editor.
        local[3].texto!!.insert(0, "¡")
        local[2].tipo = "paragraph"
        val movido = local.removeAt(5)
        local.add(1, movido)
        val sangrado = local.removeAt(7)
        local[6].hijos.add(sangrado)
        local.add(0, Bloque.nuevo("checkListItem", texto = "nueva tarea"))
        local.removeAt(10)
        local[4].hijos.clear()
        val localJson = local.map { it.aJson() }
        val ops = Diff.ops(base, localJson)
        assertEquals(localJson, Diff.aplica(base, ops))
        // Sin cambios, ninguna operación.
        assertEquals(emptyList<JsonObject>(), Diff.ops(base, base.map { Bloque.deJson(it, pal).aJson() }))
    }
}
