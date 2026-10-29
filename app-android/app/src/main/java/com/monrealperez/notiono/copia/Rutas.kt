package com.monrealperez.notiono.copia

import kotlinx.serialization.Serializable

// Lo que da `app.arbolCopia`: páginas visibles (sin contenido) y filas de cada BD.
@Serializable
data class PaginaCopia(val id: String, val parentId: String? = null, val titulo: String = "", val tipo: String = "doc", val editada: String = "")

@Serializable
data class FilaCopia(val id: String, val pageId: String, val titulo: String = "", val editada: String = "")

@Serializable
data class ArbolCopia(val paginas: List<PaginaCopia> = emptyList(), val filas: List<FilaCopia> = emptyList())

data class EspacioCopia(val id: String, val nombre: String, val arbol: ArbolCopia)

/** Un .docx de la copia: la página `id` (o su fila `recordId`), dónde va en el NAS y de cuándo es. */
data class Elemento(val espacio: String, val id: String, val recordId: String?, val ruta: String, val editada: String) {
    val clave get() = if (recordId == null) id else "$id/$recordId"
}

/**
 * El árbol de páginas convertido en carpetas y archivos del NAS (lógica pura, sin red):
 *
 * - Cada espacio, en su carpeta dentro de la base (siempre, aunque sea uno: así añadir otro
 *   espacio no mueve los archivos del primero).
 * - Página sin subpáginas → `<madre>/<Título>.docx`; con subpáginas → `<Título>/<Título>.docx`
 *   y sus hijas dentro.
 * - Base de datos → carpeta `<Título>/` con un `.docx` por fila (y sus subpáginas, si tiene).
 * - Nombres repetidos en la misma carpeta (sin mirar mayúsculas) → `Título_2`, `Título_3`…
 *   por el orden del árbol, que es estable.
 */
object Rutas {
    const val MAXIMO = 100
    private val PROHIBIDOS = Regex("""[/\\:*?"<>|\p{Cntrl}]""")

    /** Un nombre que vale en el NAS: sin `/ \ : * ? " < > |` ni controles, sin espacios ni puntos en los bordes. */
    fun limpia(nombre: String): String {
        val recorta = { s: String -> s.trim { it.isWhitespace() || it == '.' } }
        var t = recorta(nombre.replace(PROHIBIDOS, "")).take(MAXIMO)
        if (t.isNotEmpty() && t.last().isHighSurrogate()) t = t.dropLast(1)
        return recorta(t).ifEmpty { "Sin título" }
    }

    /** `nombre` o, si ya se usó en esa carpeta, `nombre_2`, `nombre_3`… (lo apunta en `usados`). */
    fun unico(nombre: String, usados: MutableSet<String>): String {
        var n = nombre
        var i = 2
        while (!usados.add(n.lowercase())) n = "${nombre}_${i++}"
        return n
    }

    /** La carpeta base tal cual la escribió la persona, con su `/` delante y sin el de detrás. */
    fun base(carpeta: String): String = "/" + carpeta.trim().trim('/').ifEmpty { "home/Notiono" }

    fun planifica(carpeta: String, espacios: List<EspacioCopia>): List<Elemento> {
        val out = mutableListOf<Elemento>()
        val nombresEspacio = mutableSetOf<String>()
        for (e in espacios) {
            val hijas = e.arbol.paginas.groupBy { it.parentId }
            val filas = e.arbol.filas.groupBy { it.pageId }
            val vistas = mutableSetOf<String>()
            fun baja(dir: String, paginas: List<PaginaCopia>, usados: MutableSet<String>) {
                for (p in paginas) {
                    if (!vistas.add(p.id)) continue // un ciclo en el árbol no cuelga la copia
                    val nombre = unico(limpia(p.titulo), usados)
                    val suyas = hijas[p.id].orEmpty()
                    when {
                        p.tipo == "database" -> {
                            val u = mutableSetOf<String>()
                            for (f in filas[p.id].orEmpty()) out += Elemento(e.id, p.id, f.id, "$dir/$nombre/${unico(limpia(f.titulo), u)}.docx", f.editada)
                            baja("$dir/$nombre", suyas, u)
                        }
                        suyas.isEmpty() -> out += Elemento(e.id, p.id, null, "$dir/$nombre.docx", p.editada)
                        else -> {
                            out += Elemento(e.id, p.id, null, "$dir/$nombre/$nombre.docx", p.editada)
                            // Su propio Word ya ocupa ese nombre dentro de su carpeta.
                            baja("$dir/$nombre", suyas, mutableSetOf(nombre.lowercase()))
                        }
                    }
                }
            }
            baja(base(carpeta) + "/" + unico(limpia(e.nombre), nombresEspacio), hijas[null].orEmpty(), mutableSetOf())
        }
        return out
    }
}
