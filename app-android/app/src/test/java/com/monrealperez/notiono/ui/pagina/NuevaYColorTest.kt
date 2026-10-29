package com.monrealperez.notiono.ui.pagina

import androidx.compose.ui.graphics.Color
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.comun.ColorPagina
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dónde caen las páginas nuevas («Añadir a ▾», como Notion en el móvil) y el color de página. */
class NuevaYColorTest {
    @Test
    fun laPaginaNuevaLlevaElIndicador() {
        assertEquals("pagina/p1?final=false&nueva=true", Navegador.rutaPagina("p1", nueva = true))
        assertEquals("pagina/p1?final=false", Navegador.rutaPagina("p1"))
        assertEquals("pagina/p1?final=true&v=v1", Navegador.rutaPagina("p1", alFinal = true, vista = "v1"))
    }

    @Test
    fun añadirASoloEnLaRecienCreadaMientrasSigaEnLaRaiz() {
        val raiz = PaginaInfo("p1", nivel = "full")
        assertTrue(ubicarNueva(true, raiz))
        assertFalse(ubicarNueva(false, raiz))
        // Ya movida a otra página, o sin poder editar: nada.
        assertFalse(ubicarNueva(true, raiz.copy(parentId = "madre")))
        assertFalse(ubicarNueva(true, raiz.copy(nivel = "view")))
    }

    @Test
    fun colorDePagina() {
        assertEquals("yellow", ColorPagina.normaliza("yellow"))
        assertNull(ColorPagina.normaliza("default"))
        assertNull(ColorPagina.normaliza("chartreuse"))
        assertNull(ColorPagina.normaliza(null))
        assertEquals(
            listOf("Predeterminado", "Gris", "Marrón", "Naranja", "Amarillo", "Verde", "Azul", "Morado", "Rosa", "Rojo"),
            ColorPagina.COLORES_PAGINA.map { it.nombre },
        )
        // Los de Notion: fondo claro y oscuro, y la barrita con el acento de cada modo.
        assertEquals(Color(0xFFFAF3DD), ColorPagina.fondo("yellow", oscuro = false))
        assertEquals(Color(0xFF372E20), ColorPagina.fondo("yellow", oscuro = true))
        assertEquals(Color(0xFF337EA9), ColorPagina.barra("blue", oscuro = false))
        assertEquals(Color(0xFF379AD3), ColorPagina.barra("blue", oscuro = true))
        assertNull(ColorPagina.fondo("default", oscuro = false))
        assertNull(ColorPagina.barra(null, oscuro = true))
    }
}
