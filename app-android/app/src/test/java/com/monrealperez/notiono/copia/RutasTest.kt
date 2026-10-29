package com.monrealperez.notiono.copia

import org.junit.Assert.assertEquals
import org.junit.Test

/** El árbol de páginas → carpetas y archivos del NAS (lógica pura). */
class RutasTest {
    @Test
    fun nombresLimpios() {
        assertEquals("ab cd", Rutas.limpia("a/b\\ c:d*?\"<>|"))
        assertEquals("Hola", Rutas.limpia("  ..Hola.. "))
        assertEquals("Sin título", Rutas.limpia(""))
        assertEquals("Sin título", Rutas.limpia(" ./ . "))
        assertEquals("ab", Rutas.limpia("a\u0000\tb\n"))
        assertEquals(100, Rutas.limpia("x".repeat(300)).length)
        // Un emoji partido por el corte no deja medio carácter.
        assertEquals("x".repeat(99), Rutas.limpia("x".repeat(99) + "😀"))
    }

    @Test
    fun repetidosConGuionBajo() {
        val usados = mutableSetOf<String>()
        assertEquals(listOf("Notas", "notas_2", "NOTAS_3", "Otra"), listOf("Notas", "notas", "NOTAS", "Otra").map { Rutas.unico(it, usados) })
    }

    @Test
    fun arbolARutas() {
        val arbol = ArbolCopia(
            paginas = listOf(
                PaginaCopia("p1", null, "Notas", "doc", "t1"),
                PaginaCopia("p2", null, "Proyecto", "doc", "t2"),
                PaginaCopia("p3", "p2", "Tareas", "database", "t3"),
                PaginaCopia("p5", "p2", "Proyecto", "doc", "t5"),
                PaginaCopia("p4", null, "notas", "doc", "t4"),
                PaginaCopia("p6", null, "Lista", "database", "t6"),
            ),
            filas = listOf(
                FilaCopia("r1", "p3", "Comprar pan", "f1"),
                FilaCopia("r2", "p3", "comprar pan", "f2"),
                FilaCopia("r3", "p3", "", "f3"),
                FilaCopia("r4", "p6", "Uno", "f4"),
            ),
        )
        val r = Rutas.planifica("home/Notiono/", listOf(EspacioCopia("w1", "Privado", arbol), EspacioCopia("w2", "privado", ArbolCopia(listOf(PaginaCopia("q1", null, "A", "doc", "x"))))))
        assertEquals(
            listOf(
                "p1" to "/home/Notiono/Privado/Notas.docx",
                "p2" to "/home/Notiono/Privado/Proyecto/Proyecto.docx",
                "p3/r1" to "/home/Notiono/Privado/Proyecto/Tareas/Comprar pan.docx",
                "p3/r2" to "/home/Notiono/Privado/Proyecto/Tareas/comprar pan_2.docx",
                "p3/r3" to "/home/Notiono/Privado/Proyecto/Tareas/Sin título.docx",
                // La hija que se llama como su madre no pisa el Word de la madre.
                "p5" to "/home/Notiono/Privado/Proyecto/Proyecto_2.docx",
                "p4" to "/home/Notiono/Privado/notas_2.docx",
                "p6/r4" to "/home/Notiono/Privado/Lista/Uno.docx",
                "q1" to "/home/Notiono/privado_2/A.docx",
            ),
            r.map { it.clave to it.ruta },
        )
        assertEquals("f2", r.first { it.clave == "p3/r2" }.editada)
        assertEquals("w2", r.last().espacio)
    }
}
