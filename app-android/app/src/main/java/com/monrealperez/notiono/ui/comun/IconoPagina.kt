package com.monrealperez.notiono.ui.comun

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.ColoresIcono

/** ¿El icono de página es una imagen subida (URL) y no un emoji? (esIconoImagen de la web) */
fun esIconoImagen(icon: String?) = icon != null && (icon.startsWith("/") || icon.startsWith("http://") || icon.startsWith("https://"))

/** ¿Es un icono dibujado, «icono:<nombre>:<color>»? */
fun esIconoLucide(icon: String?) = icon != null && icon.startsWith("icono:")

/** El emoji del icono para sitios de solo texto (vacío si es imagen o dibujo). */
fun emojiDe(icon: String?): String = if (icon == null || esIconoImagen(icon) || esIconoLucide(icon)) "" else icon

/**
 * El icono de una página donde sea (árbol, migas, buscador, cabecera): el emoji tal
 * cual, la imagen subida o el icono de color. Sin icono, el de documento (o el de BD).
 */
@Composable
fun IconoPagina(icon: String?, tam: Dp = 18.dp, modifier: Modifier = Modifier, porDefecto: String? = "file-text") {
    when {
        icon.isNullOrBlank() -> if (porDefecto != null) Icono(porDefecto, modifier, tam = tam, color = C.apagado)
        esIconoImagen(icon) -> {
            val api = Servicios.de(LocalContext.current).api
            AsyncImage(
                model = api.absoluta(icon),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = modifier.size(tam).clip(RoundedCornerShape(3.dp)),
            )
        }
        esIconoLucide(icon) -> {
            val partes = icon.split(":")
            Icono(
                partes.getOrElse(1) { "file-text" },
                modifier,
                tam = tam,
                color = ColoresIcono.de(partes.getOrNull(2), C.oscuro),
                trazo = if (tam >= 32.dp) 1.75f else 2f,
            )
        }
        else -> {
            val px = with(LocalDensity.current) { (tam * 0.86f).toSp() }
            Box(modifier.size(tam), contentAlignment = Alignment.Center) {
                Text(icon, fontSize = px, lineHeight = px, color = Color.Unspecified)
            }
        }
    }
}

/** Portadas: degradados de la web («gradient:<id>») o imagen («url:<src>|y=<0-100>»). */
object Portadas {
    val degradados: Map<String, Pair<Long, Long>> = linkedMapOf(
        "sunset" to (0xFFFF5C28 to 0xFFFFB347),
        "ocean" to (0xFF2193B0 to 0xFF6DD5ED),
        "berry" to (0xFF642B73 to 0xFFC6426E),
        "forest" to (0xFF134E5E to 0xFF71B280),
        "candy" to (0xFFFF9A9E to 0xFFFAD0C4),
        "night" to (0xFF232526 to 0xFF414345),
        "gold" to (0xFFF7971E to 0xFFFFD200),
        "lavender" to (0xFFA18CD1 to 0xFFFBC2EB),
    )

    /** Imagen y desplazamiento vertical (0–100) de una portada de imagen; null si es degradado. */
    fun imagen(cover: String): Pair<String, Int>? {
        if (!cover.startsWith("url:")) return null
        val raw = cover.removePrefix("url:")
        val m = Regex("^(.*)\\|y=(\\d{1,3})$").find(raw)
        return if (m != null) m.groupValues[1] to m.groupValues[2].toInt().coerceAtMost(100) else raw to 50
    }

    fun brocha(cover: String): Brush {
        val (a, b) = degradados[cover.removePrefix("gradient:")] ?: degradados.getValue("sunset")
        return Brush.linearGradient(listOf(Color(a), Color(b)))
    }
}

@Composable
fun BandaPortada(cover: String, modifier: Modifier = Modifier) {
    val img = Portadas.imagen(cover)
    if (img != null) {
        val api = Servicios.de(LocalContext.current).api
        AsyncImage(
            model = api.absoluta(img.first),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            alignment = androidx.compose.ui.BiasAlignment(0f, img.second / 50f - 1f),
            modifier = modifier,
        )
    } else {
        Box(modifier.background(Portadas.brocha(cover)))
    }
}
