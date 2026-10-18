package com.monrealperez.notiono.ui.pagina

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TituloTest {
    @Test
    fun loQueSeSigueEscribiendoNoLoPisaLaRespuestaDelGuardado() = runBlocking {
        val t = TituloEnEdicion("")
        t.texto = "Hola"
        // El guardado de «Hola» viaja y, mientras, se sigue escribiendo (y llega una recarga vieja).
        t.guarda { t.texto = "Hola mundo"; t.remoto("") }
        // La recarga que sigue al guardado trae «Hola»: lo escrito después se queda.
        t.remoto("Hola")
        assertEquals("Hola mundo", t.texto)
        assertTrue(t.pendiente)
        t.guarda { }
        t.remoto("Hola mundo")
        assertEquals("Hola mundo", t.texto)
        // Otra persona la renombra mientras aquí no se toca: se adopta.
        t.remoto("Lista de la compra")
        assertEquals("Lista de la compra", t.texto)
    }
}
