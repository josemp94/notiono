package com.monrealperez.notiono.ui.comun

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Los iconos de lucide, los mismos dibujos que la web (interfaz e iconos de página).
 * Salen de `assets/lucide.json`, que genera `scripts/iconos-android.mjs`.
 */
object Lucide {
    @Volatile private var trazos: Map<String, List<String>>? = null
    // Se usa desde la interfaz y desde los widgets (otro hilo).
    private val vectores = java.util.concurrent.ConcurrentHashMap<String, ImageVector>()

    fun carga(ctx: Context): Map<String, List<String>> = trazos ?: synchronized(this) {
        trazos ?: run {
            val texto = ctx.assets.open("lucide.json").bufferedReader().use { it.readText() }
            json.parseToJsonElement(texto).jsonObject.mapValues { (_, v) -> (v as JsonArray).map { it.jsonPrimitive.content } }
                .also { trazos = it }
        }
    }

    fun existe(ctx: Context, nombre: String) = carga(ctx).containsKey(nombre)

    fun vector(ctx: Context, nombre: String, trazo: Float = 1.75f): ImageVector? {
        val clave = "$nombre@$trazo"
        vectores[clave]?.let { return it }
        val ds = carga(ctx)[nombre] ?: return null
        val b = ImageVector.Builder(nombre, 24.dp, 24.dp, 24f, 24f)
        for (d in ds) {
            b.addPath(
                pathData = PathParser().parsePathString(d).toNodes(),
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = trazo,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return b.build().also { vectores[clave] = it }
    }
}

/** Icono de la interfaz: lucide a 18 dp y trazo 1,75, del color del contenido (como en la web). */
@Composable
fun Icono(
    nombre: String,
    modifier: Modifier = Modifier,
    tam: Dp = 18.dp,
    color: Color = LocalContentColor.current,
    trazo: Float = 1.75f,
) {
    val ctx = LocalContext.current
    val v = remember(nombre, trazo) { Lucide.vector(ctx, nombre, trazo) ?: Lucide.vector(ctx, "circle", trazo)!! }
    Image(
        painter = rememberVectorPainter(v),
        contentDescription = null,
        colorFilter = ColorFilter.tint(color),
        modifier = modifier.size(tam),
    )
}
