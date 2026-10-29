package com.monrealperez.notiono.ui.pagina

import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** «Información de la página» en la app: las mismas líneas que la web, de `app.info`. */
class InfoPaginaTest {
    @Test
    fun lasLineasComoEnLaWeb() {
        val i = json.parseToJsonElement(
            """{"palabras":12345,"caracteres":1,"casillas":2,"hechas":1,"imagenes":1,"adjuntos":3,"creada":"2026-10-29T08:51:00.000Z","editada":"2026-10-29T08:51:00.000Z","creadaPor":null,"editadaPor":"Pablo"}""",
        ) as JsonObject
        val l = lineasInfo(i)
        assertEquals("12.345 palabras · 1 carácter", l[0])
        assertEquals("Casillas: 1 de 2 hechas", l[1])
        assertEquals("1 imagen · 3 adjuntos", l[2])
        assertEquals(true, l[3].startsWith("Creada el 29 oct 2026"))
        assertEquals(true, l[4].endsWith(" por Pablo"))
        // Sin casillas ni adjuntos, esas líneas no salen.
        assertEquals(3, lineasInfo(json.parseToJsonElement("""{"palabras":0,"caracteres":0,"casillas":0,"imagenes":0,"adjuntos":0,"creada":"2026-10-29T08:51:00.000Z","editada":"2026-10-29T08:51:00.000Z"}""") as JsonObject).size)
    }
}
