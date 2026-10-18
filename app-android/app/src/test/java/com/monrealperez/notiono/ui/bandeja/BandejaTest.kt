package com.monrealperez.notiono.ui.bandeja

import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class BandejaTest {
    private fun aviso(s: String) = json.parseToJsonElement(s) as JsonObject

    @Test
    fun cadaAvisoAbreSuSitio() {
        // Un vencimiento, en la ficha de su fila (la clave es due:<fila>:<campo>:<día>).
        assertEquals("notiono://fila/bd1/r9", enlaceDeAviso(aviso("""{"type":"due","key":"due:r9:f2:2026-10-18","page":{"id":"bd1"}}""")))
        // Una mención o un comentario, en su página.
        assertEquals("notiono://pagina/p1", enlaceDeAviso(aviso("""{"type":"mention","page":{"id":"p1"}}""")))
        assertEquals("notiono://pagina/bd1", enlaceDeAviso(aviso("""{"type":"due","key":null,"page":{"id":"bd1"}}""")))
        // Sin página (se borró), a la bandeja.
        assertEquals("notiono://bandeja", enlaceDeAviso(aviso("""{"type":"comment"}""")))
    }
}
