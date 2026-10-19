package com.monrealperez.notiono.ui

import android.net.Uri

/** A dónde lleva un enlace, un atajo o un widget. */
sealed interface Destino {
    data class Pagina(val id: String, val vista: String? = null) : Destino
    data class Fila(val pageId: String, val recordId: String) : Destino
    data object Nueva : Destino
    data object Buscar : Destino
    data object Bandeja : Destino
    /** Página nueva con una foto de la cámara (widget «Acciones rápidas»). */
    data object Foto : Destino
    /** Fila nueva en una BD; del Calendario, ya con su fecha (`campo` = el campo de fecha). */
    data class NuevaFila(val pageId: String, val campo: String? = null, val fecha: String? = null) : Destino
    data class NotaRapida(val paginaDestino: String?) : Destino

    companion object {
        private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")
        private val FECHA = Regex("^\\d{4}-\\d{2}-\\d{2}$")

        /**
         * ¿Sirve como id de página, fila o vista? Los enlaces llegan de cualquier app y de
         * documentos editados por otros: un id con «/», «?» o «&» haría que la navegación
         * no encontrara su ruta y la app se cerrara.
         */
        fun esId(s: String?): Boolean = s != null && ID.matches(s)

        private fun id(s: String?) = s?.takeIf(::esId)

        fun de(uri: Uri): Destino? {
            val seg = uri.pathSegments
            val s0 = id(seg.getOrNull(0))
            val s1 = id(seg.getOrNull(1))
            return when {
                uri.scheme == "notiono" && uri.host == "nueva" -> Nueva
                uri.scheme == "notiono" && uri.host == "buscar" -> Buscar
                uri.scheme == "notiono" && uri.host == "bandeja" -> Bandeja
                uri.scheme == "notiono" && uri.host == "foto" -> Foto
                uri.scheme == "notiono" && uri.host == "nuevafila" && s0 != null ->
                    NuevaFila(s0, id(uri.getQueryParameter("campo")), uri.getQueryParameter("fecha")?.takeIf { FECHA.matches(it) })
                uri.scheme == "notiono" && uri.host == "rapida" -> NotaRapida(id(uri.getQueryParameter("en")))
                uri.scheme == "notiono" && uri.host == "pagina" && s0 != null -> Pagina(s0)
                uri.scheme == "notiono" && uri.host == "fila" && s0 != null && s1 != null -> Fila(s0, s1)
                (uri.scheme == "https" || uri.scheme == "http") && seg.getOrNull(0) == "p" && s1 != null ->
                    id(uri.getQueryParameter("r"))?.let { Fila(s1, it) } ?: Pagina(s1, id(uri.getQueryParameter("v")))
                else -> null
            }
        }
    }
}
