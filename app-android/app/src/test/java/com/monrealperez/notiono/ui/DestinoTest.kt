package com.monrealperez.notiono.ui

import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Enlaces e intents de fuera: lo que no es un id no llega a la navegación (que se cerraría). */
@RunWith(RobolectricTestRunner::class)
class DestinoTest {
    private fun de(s: String) = Destino.de(Uri.parse(s))

    @Test
    fun enlacesBuenos() {
        assertEquals(Destino.Pagina("cmabc123"), de("notiono://pagina/cmabc123"))
        assertEquals(Destino.Fila("p1", "r_2"), de("notiono://fila/p1/r_2"))
        assertEquals(Destino.Pagina("p1", "v-1"), de("https://notiono.monrealperez.com/p/p1?v=v-1"))
        assertEquals(Destino.Fila("p1", "r1"), de("https://notiono.monrealperez.com/p/p1?r=r1"))
        assertEquals(Destino.NuevaFila("p1"), de("notiono://nuevafila/p1"))
        assertEquals(Destino.NotaRapida("p1"), de("notiono://rapida?en=p1"))
        assertEquals(Destino.Nueva, de("notiono://nueva"))
    }

    @Test
    fun idsRarosNoNavegan() {
        assertNull(de("notiono://pagina/a%2Fb"))
        assertNull(de("notiono://pagina/a%3Fv%3Dx"))
        assertNull(de("notiono://fila/p1/r%26x"))
        assertNull(de("notiono://nuevafila/%20"))
        assertNull(de("https://notiono.monrealperez.com/p/"))
        assertNull(de("https://notiono.monrealperez.com/p/" + "x".repeat(200)))
        // Una vista o una fila rara en un enlace bueno: se abre la página, sin ellas.
        assertEquals(Destino.Pagina("p1", null), de("https://notiono.monrealperez.com/p/p1?v=a%26b"))
        assertEquals(Destino.Pagina("p1", null), de("https://notiono.monrealperez.com/p/p1?r=a/b"))
        assertEquals(Destino.NotaRapida(null), de("notiono://rapida?en=..%2F"))
    }
}
