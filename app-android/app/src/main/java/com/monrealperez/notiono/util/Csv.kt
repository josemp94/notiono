package com.monrealperez.notiono.util

/** El mismo parser CSV que la web (`src/lib/csv.ts`, RFC 4180): comillas, comas y saltos dentro de comillas. */
object Csv {
    fun lee(texto: String): List<List<String>> {
        val filas = ArrayList<List<String>>()
        var fila = ArrayList<String>()
        val celda = StringBuilder()
        var enComillas = false
        var i = 0
        while (i < texto.length) {
            val ch = texto[i]
            if (enComillas) {
                if (ch == '"') {
                    if (i + 1 < texto.length && texto[i + 1] == '"') {
                        celda.append('"'); i++
                    } else enComillas = false
                } else celda.append(ch)
            } else if (ch == '"') {
                enComillas = true
            } else if (ch == ',') {
                fila.add(celda.toString()); celda.clear()
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r' && i + 1 < texto.length && texto[i + 1] == '\n') i++
                fila.add(celda.toString()); celda.clear()
                filas.add(fila); fila = ArrayList()
            } else celda.append(ch)
            i++
        }
        if (celda.isNotEmpty() || fila.isNotEmpty()) {
            fila.add(celda.toString())
            filas.add(fila)
        }
        // Fuera las filas totalmente vacías (el salto de línea final).
        return filas.filter { f -> f.any { it.isNotEmpty() } }
    }

    private fun escapa(v: String) = if (v.any { it == '"' || it == ',' || it == '\n' || it == '\r' }) "\"" + v.replace("\"", "\"\"") + "\"" else v

    fun escribe(filas: List<List<String>>): String = filas.joinToString("\n") { f -> f.joinToString(",") { escapa(it) } }
}
