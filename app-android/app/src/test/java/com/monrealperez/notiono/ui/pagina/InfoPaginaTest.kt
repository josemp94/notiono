package com.monrealperez.notiono.ui.pagina

import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** El pie del menú en la app: el de Notion arriba y lo demás aparte, como `pieInfo` de la web (mismas pruebas). */
class InfoPaginaTest {
    private val ahora = Instant.parse("2026-10-29T09:51:00Z") // 10:51 en Madrid

    @Test
    fun comoNotionYLoDemasAparte() {
        val i = json.parseToJsonElement(
            """{"palabras":12345,"caracteres":1,"casillas":2,"hechas":1,"imagenes":1,"adjuntos":3,"creada":"2026-10-27T08:05:00.000Z","editada":"2026-10-29T08:51:00.000Z","creadaPor":null,"editadaPor":"Pablo"}""",
        ) as JsonObject
        val (principal, extra) = pieInfo(i, ahora)
        assertEquals(listOf("Recuento de palabras: 12.345", "Última edición por Pablo", "Hoy a las 09:51"), principal)
        assertEquals(listOf("1 carácter", "Casillas: 1 de 2 hechas", "1 imagen · 3 adjuntos", "Creada el 27 oct 2026, 09:05"), extra)
        assertEquals("Ayer a las 23:30", cuandoInfo("2026-10-28T22:30:00.000Z", ahora))
        val vacia = pieInfo(json.parseToJsonElement("""{"palabras":0,"caracteres":0,"casillas":0,"imagenes":0,"adjuntos":0,"creada":"2026-10-29T09:51:00.000Z","editada":"2026-10-29T09:51:00.000Z"}""") as JsonObject, ahora)
        assertEquals(listOf("Recuento de palabras: 0", "Última edición", "Hoy a las 10:51"), vacia.first)
        assertEquals(listOf("0 caracteres", "Creada hoy a las 10:51"), vacia.second)
    }
}
