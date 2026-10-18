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
    data class NuevaFila(val pageId: String) : Destino
    data class NotaRapida(val paginaDestino: String?) : Destino

    companion object {
        fun de(uri: Uri): Destino? {
            val seg = uri.pathSegments
            return when {
                uri.scheme == "notiono" && uri.host == "nueva" -> Nueva
                uri.scheme == "notiono" && uri.host == "buscar" -> Buscar
                uri.scheme == "notiono" && uri.host == "bandeja" -> Bandeja
                uri.scheme == "notiono" && uri.host == "foto" -> Foto
                uri.scheme == "notiono" && uri.host == "nuevafila" && seg.isNotEmpty() -> NuevaFila(seg[0])
                uri.scheme == "notiono" && uri.host == "rapida" -> NotaRapida(uri.getQueryParameter("en"))
                uri.scheme == "notiono" && uri.host == "pagina" && seg.isNotEmpty() -> Pagina(seg[0])
                uri.scheme == "notiono" && uri.host == "fila" && seg.size >= 2 -> Fila(seg[0], seg[1])
                (uri.scheme == "https" || uri.scheme == "http") && seg.size >= 2 && seg[0] == "p" ->
                    uri.getQueryParameter("r")?.let { Fila(seg[1], it) } ?: Pagina(seg[1], uri.getQueryParameter("v"))
                else -> null
            }
        }
    }
}
