package com.monrealperez.notiono.editor

import android.view.inputmethod.EditorInfo
import androidx.test.core.app.ApplicationProvider
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Deshacer y rehacer en el editor, con el teclado como lo manda Gboard. */
@RunWith(RobolectricTestRunner::class)
class DeshacerTest {
    private val pal = Paleta.clara

    private fun montaje(vararg textos: Pair<String, String>): Pair<EstadoEditor, (Bloque) -> CampoBloque> {
        val estado = EstadoEditor(pal, true)
        estado.carga(textos.map { (tipo, t) -> Bloque.nuevo(tipo, texto = t).aJson() })
        val oyente = object : OyenteCampo {
            override fun enter(campo: CampoBloque, pos: Int) = estado.enter(campo.bloque!!, pos)
            override fun retrocesoAlInicio(campo: CampoBloque) = estado.retrocesoAlInicio(campo.bloque!!)
            override fun cambio(campo: CampoBloque, ini: Int, antes: Int, despues: Int) = estado.texto(campo.bloque!!)
            override fun seleccion(campo: CampoBloque, a: Int, b: Int) { estado.seleccion = a to b }
            override fun foco(campo: CampoBloque, tiene: Boolean) {}
            override fun tab(campo: CampoBloque, atras: Boolean) {}
            override fun antesDeCambiar(campo: CampoBloque) = estado.antesDeEscribir(campo.bloque!!)
        }
        val campo = { b: Bloque -> CampoBloque(ApplicationProvider.getApplicationContext()).also { it.oyente = oyente; it.pon(b) } }
        return estado to campo
    }

    private fun textos(e: EstadoEditor) = e.raiz.map { it.texto.toString() }

    @Test
    fun loTecleadoSeguidoSeDeshaceDeUnaVez() {
        val (estado, campo) = montaje("paragraph" to "")
        assertFalse(estado.puedeDeshacer)
        val ic = campo(estado.raiz[0]).onCreateInputConnection(EditorInfo())!!
        ic.commitText("Lista", 1)
        ic.commitText(" de la", 1)
        ic.commitText(" compra", 1)
        assertEquals(listOf("Lista de la compra"), textos(estado))
        assertTrue(estado.puedeDeshacer)
        estado.deshaz()
        assertEquals(listOf(""), textos(estado))
        assertTrue(estado.puedeRehacer)
        estado.rehaz()
        assertEquals(listOf("Lista de la compra"), textos(estado))
    }

    @Test
    fun cadaOperacionEsUnPasoYRehacerSeBorraAlCambiar() {
        val (estado, campo) = montaje("paragraph" to "holamundo")
        val c = campo(estado.raiz[0]).apply { setSelection(4) }
        c.onCreateInputConnection(EditorInfo())!!.commitText("\n", 1)
        assertEquals(listOf("hola", "mundo"), textos(estado))
        estado.convierte(estado.raiz[1], "checkListItem")
        estado.props(estado.raiz[1], "checked" to JsonPrimitive(true))
        estado.deshaz()
        assertEquals("checkListItem", estado.raiz[1].tipo)
        assertFalse(estado.raiz[1].propBool("checked"))
        estado.deshaz()
        assertEquals("paragraph", estado.raiz[1].tipo)
        estado.deshaz()
        assertEquals(listOf("holamundo"), textos(estado))
        // Se deshizo; si ahora se cambia algo, ya no se puede rehacer lo deshecho.
        assertTrue(estado.puedeRehacer)
        estado.mueve(estado.raiz[0], 0)
        estado.convierte(estado.raiz[0], "quote")
        assertFalse(estado.puedeRehacer)
    }

    @Test
    fun unaOperacionCompuestaEsUnSoloPaso() {
        // «# » convierte en encabezado: borrar el atajo y convertir se deshacen juntos.
        val (estado, _) = montaje("paragraph" to "")
        val b = estado.raiz[0]
        estado.antesDeEscribir(b)
        b.texto!!.append("# Viaje")
        estado.texto(b)
        estado.atajoMarkdown(b)
        assertEquals("heading", estado.raiz[0].tipo)
        assertEquals("Viaje", estado.raiz[0].texto.toString())
        estado.deshaz()
        assertEquals("paragraph", estado.raiz[0].tipo)
        assertEquals("# Viaje", estado.raiz[0].texto.toString())
        // Y varios cambios hechos desde un menú, también.
        estado.enUnPaso {
            estado.insertaDespues(estado.raiz[0], Bloque.nuevo("divider"))
            estado.insertaDespues(estado.raiz[1], Bloque.nuevo())
        }
        assertEquals(3, estado.raiz.size)
        estado.deshaz()
        assertEquals(1, estado.raiz.size)
    }

    @Test
    fun loTecleadoTrasUnaPausaEsOtroPaso() {
        val (estado, _) = montaje("paragraph" to "")
        val b = estado.raiz[0]
        estado.antes(b, ahora = 1_000)
        b.texto!!.append("uno")
        estado.antes(b, ahora = 1_000 + PAUSA_ESCRITURA + 1)
        b.texto!!.append(" dos")
        estado.deshaz()
        assertEquals("uno", estado.raiz[0].texto.toString())
        estado.deshaz()
        assertEquals("", estado.raiz[0].texto.toString())
    }

    @Test
    fun loDeFueraBorraElHistorial() {
        val (estado, _) = montaje("paragraph" to "uno")
        estado.convierte(estado.raiz[0], "quote")
        assertTrue(estado.puedeDeshacer)
        estado.olvidaHistorial()
        assertFalse(estado.puedeDeshacer)
        estado.deshaz()
        assertEquals("quote", estado.raiz[0].tipo)
    }
}
