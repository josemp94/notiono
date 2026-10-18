package com.monrealperez.notiono.editor

import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import androidx.test.core.app.ApplicationProvider
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * El teclado como lo manda Gboard: Enter llega como el texto "\n" (commitText) y el
 * Retroceso al principio como deleteSurroundingText(1, 0) sobre nada. Si el campo no
 * intercepta eso, en el móvil Enter no parte el bloque y Retroceso no une.
 */
@RunWith(RobolectricTestRunner::class)
class TecladoTest {
    private val pal = Paleta.clara

    private fun montaje(vararg textos: Pair<String, String>): Pair<EstadoEditor, (Bloque) -> CampoBloque> {
        val estado = EstadoEditor(pal, true)
        estado.carga(textos.map { (tipo, t) -> Bloque.nuevo(tipo, texto = t).aJson() })
        val oyente = object : OyenteCampo {
            override fun enter(campo: CampoBloque, pos: Int) = estado.enter(campo.bloque!!, pos)
            override fun retrocesoAlInicio(campo: CampoBloque) = estado.retrocesoAlInicio(campo.bloque!!)
            override fun cambio(campo: CampoBloque, ini: Int, antes: Int, despues: Int) {
                estado.texto(campo.bloque!!)
                val t = campo.bloque!!.texto!!
                if (despues == 1 && ini < t.length && t[ini] == ' ') estado.atajoMarkdown(campo.bloque!!)
            }
            override fun seleccion(campo: CampoBloque, a: Int, b: Int) { estado.seleccion = a to b }
            override fun foco(campo: CampoBloque, tiene: Boolean) {}
            override fun tab(campo: CampoBloque, atras: Boolean) {}
        }
        val campo = { b: Bloque -> CampoBloque(ApplicationProvider.getApplicationContext()).also { it.oyente = oyente; it.pon(b) } }
        return estado to campo
    }

    @Test
    fun enterComoGboardParteElBloque() {
        val (estado, campo) = montaje("paragraph" to "holamundo")
        val c = campo(estado.raiz[0])
        c.setSelection(4)
        val ic = c.onCreateInputConnection(EditorInfo())!!
        ic.commitText("\n", 1)
        assertEquals(listOf("hola", "mundo"), estado.raiz.map { it.texto.toString() })
        assertEquals(estado.raiz[1].id, estado.foco?.id)
    }

    @Test
    fun enterEnListaVaciaSaleDeLaLista() {
        val (estado, campo) = montaje("bulletListItem" to "uno", "bulletListItem" to "")
        val ic = campo(estado.raiz[1]).onCreateInputConnection(EditorInfo())!!
        ic.commitText("\n", 1)
        assertEquals("paragraph", estado.raiz[1].tipo)
        // En una lista con texto, Enter crea otro elemento de la lista.
        val c0 = campo(estado.raiz[0]).apply { setSelection(3) }
        c0.onCreateInputConnection(EditorInfo())!!.commitText("\n", 1)
        assertEquals(listOf("bulletListItem", "bulletListItem", "paragraph"), estado.raiz.map { it.tipo })
    }

    @Test
    fun retrocesoAlPrincipioComoGboard() {
        val (estado, campo) = montaje("paragraph" to "hola", "paragraph" to "mundo")
        val c = campo(estado.raiz[1]).apply { setSelection(0) }
        c.onCreateInputConnection(EditorInfo())!!.deleteSurroundingText(1, 0)
        assertEquals(listOf("holamundo"), estado.raiz.map { it.texto.toString() })
        assertEquals(PeticionFoco(estado.raiz[0].id, 4).let { it.id to it.pos }, estado.foco!!.let { it.id to it.pos })
    }

    @Test
    fun retrocesoEnTituloLoConvierteEnTexto() {
        val (estado, campo) = montaje("heading" to "Título")
        val c = campo(estado.raiz[0]).apply { setSelection(0) }
        // Con el campo vacío o al principio, otros teclados mandan la tecla.
        c.onCreateInputConnection(EditorInfo())!!.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL))
        assertEquals("paragraph", estado.raiz[0].tipo)
        assertEquals("Título", estado.raiz[0].texto.toString())
    }

    @Test
    fun atajosMarkdownAlEscribir() {
        val casos = mapOf("# " to "heading", "- " to "bulletListItem", "1. " to "numberedListItem", "[] " to "checkListItem", "> " to "quote")
        for ((atajo, tipo) in casos) {
            val (estado, campo) = montaje("paragraph" to "")
            val c = campo(estado.raiz[0])
            val ic = c.onCreateInputConnection(EditorInfo())!!
            // Tecla a tecla, como se escribe.
            for (ch in atajo) ic.commitText(ch.toString(), 1)
            assertEquals("«$atajo»", tipo, estado.raiz[0].tipo)
            assertEquals("", estado.raiz[0].texto.toString())
        }
        // «3. » empieza la lista en 3.
        val (estado, campo) = montaje("paragraph" to "")
        val ic = campo(estado.raiz[0]).onCreateInputConnection(EditorInfo())!!
        for (ch in "3. ") ic.commitText(ch.toString(), 1)
        assertEquals(JsonPrimitive(3), estado.raiz[0].props["start"])
    }

    @Test
    fun sangrarYEnviarOperaciones() {
        val (estado, _) = montaje("bulletListItem" to "a", "bulletListItem" to "b")
        val base = estado.json()
        estado.sangra(estado.raiz[1])
        assertEquals(1, estado.raiz.size)
        assertEquals("b", estado.raiz[0].hijos[0].texto.toString())
        val ops = Diff.ops(base, estado.json())
        assertTrue(ops.any { it["op"] == JsonPrimitive("move") && it["parentId"] == JsonPrimitive(estado.raiz[0].id) })
        assertEquals(estado.json(), Diff.aplica(base, ops))
    }
}
