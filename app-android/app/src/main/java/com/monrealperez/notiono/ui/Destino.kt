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
    /** El Inicio de otro espacio (el aviso «te han añadido a…»). */
    data class Espacio(val id: String) : Destino
    /** Lo de `destino`, pero en ese espacio (un aviso o un enlace de otro espacio): se pasa a él antes. */
    data class EnEspacio(val espacio: String, val destino: Destino) : Destino

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

        /** Con `?ws=<espacio>`, lo mismo pero en ese espacio. */
        fun de(uri: Uri): Destino? {
            val d = sinEspacio(uri) ?: return null
            val ws = id(runCatching { uri.getQueryParameter("ws") }.getOrNull())
            return if (ws != null && d !is Espacio) EnEspacio(ws, d) else d
        }

        private fun sinEspacio(uri: Uri): Destino? {
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
                uri.scheme == "notiono" && uri.host == "espacio" && s0 != null -> Espacio(s0)
                // El enlace del push de la web: /api/espacio/<id>?a=/p/<página> (pasa a ese espacio y la abre).
                (uri.scheme == "https" || uri.scheme == "http") && seg.getOrNull(0) == "api" && seg.getOrNull(1) == "espacio" && id(seg.getOrNull(2)) != null -> {
                    val ws = id(seg.getOrNull(2))!!
                    val a = uri.getQueryParameter("a")?.takeIf { it.startsWith("/p/") }
                    val dentro = a?.let { sinEspacio(Uri.parse("https://${uri.host ?: "x"}$it")) }
                    if (dentro != null) EnEspacio(ws, dentro) else Espacio(ws)
                }
                (uri.scheme == "https" || uri.scheme == "http") && seg.getOrNull(0) == "p" && s1 != null ->
                    id(uri.getQueryParameter("r"))?.let { Fila(s1, it) } ?: Pagina(s1, id(uri.getQueryParameter("v")))
                else -> null
            }
        }
    }
}
