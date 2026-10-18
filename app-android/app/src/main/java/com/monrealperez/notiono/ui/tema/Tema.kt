package com.monrealperez.notiono.ui.tema

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Typography

/** El naranja de la marca. Regla de la casa (globals.css): para lo seleccionado y la marca. */
val Marca = Color(0xFFFF5C28)

/** Los colores de la web (globals.css), claro y oscuro: grises cálidos que conviven con el naranja. */
@Immutable
data class Colores(
    val fondo: Color,
    val superficie: Color,
    val texto: Color,
    val apagado: Color,
    val borde: Color,
    val hover: Color,
    val activo: Color,
    val marcaSuave: Color,
    val oscuro: Boolean,
)

val ColoresClaros = Colores(
    fondo = Color(0xFFFFFFFF),
    superficie = Color(0xFFF7F6F3),
    texto = Color(0xFF1C1B19),
    apagado = Color(0xFF7A7872),
    borde = Color(0xFFE8E6E2),
    hover = Color(0x0E1C1B19),
    activo = Color(0x161C1B19),
    marcaSuave = Color(0xFFFFF2EC),
    oscuro = false,
)

val ColoresOscuros = Colores(
    fondo = Color(0xFF191918),
    superficie = Color(0xFF212120),
    texto = Color(0xFFEDEDEC),
    apagado = Color(0xFF9B9994),
    borde = Color(0xFF2C2C29),
    hover = Color(0x0FFFFFFF),
    activo = Color(0x18FFFFFF),
    marcaSuave = Color(0xFF3A2015),
    oscuro = true,
)

val LocalColores = staticCompositionLocalOf { ColoresClaros }

/** Atajo: `C.texto`, `C.apagado`… dentro de un @Composable. */
val C: Colores @Composable get() = LocalColores.current

/** Colores de las etiquetas (Selección/Estado), los 10 de Notion (globals.css, --tag-*). */
object Etiquetas {
    private val claro = mapOf(
        "default" to 0xFFECEAE4, "gray" to 0xFFE5E0D8, "brown" to 0xFFE8D8C9, "orange" to 0xFFFFD9C9,
        "yellow" to 0xFFFBEEC2, "green" to 0xFFC9EFD8, "blue" to 0xFFCFE0FF, "purple" to 0xFFE6D9F7,
        "pink" to 0xFFFFD7E6, "red" to 0xFFFFD2CD,
    )
    private val oscuro = mapOf(
        "default" to 0xFF37352F, "gray" to 0xFF4A463F, "brown" to 0xFF5D4535, "orange" to 0xFF74432A,
        "yellow" to 0xFF6B5A2B, "green" to 0xFF2E5741, "blue" to 0xFF2D456B, "purple" to 0xFF4A3466,
        "pink" to 0xFF63314B, "red" to 0xFF6E3630,
    )
    val nombres = listOf("default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red")
    val etiquetas = mapOf(
        "default" to "Predeterminado", "gray" to "Gris", "brown" to "Marrón", "orange" to "Naranja", "yellow" to "Amarillo",
        "green" to "Verde", "blue" to "Azul", "purple" to "Morado", "pink" to "Rosa", "red" to "Rojo",
    )

    fun fondo(nombre: String?, oscuro: Boolean): Color =
        Color((if (oscuro) this.oscuro else claro)[nombre ?: "default"] ?: (if (oscuro) this.oscuro else claro).getValue("default"))

    fun tinta(oscuro: Boolean) = if (oscuro) Color(0xFFEDEDEC) else Color(0xFF26241F)
}

/** Colores de los iconos de página (--ico-*), los tonos de texto de Notion. */
object ColoresIcono {
    private val claro = mapOf(
        "gray" to 0xFF787774, "brown" to 0xFF9F6B53, "orange" to 0xFFD9730D, "yellow" to 0xFFCB912F, "green" to 0xFF448361,
        "blue" to 0xFF337EA9, "purple" to 0xFF9065B0, "pink" to 0xFFC14C8A, "red" to 0xFFD44C47,
    )
    private val oscuro = mapOf(
        "gray" to 0xFF9B9B9B, "brown" to 0xFFBA856F, "orange" to 0xFFC77D48, "yellow" to 0xFFCA9849, "green" to 0xFF529E72,
        "blue" to 0xFF379AD3, "purple" to 0xFF9D68D3, "pink" to 0xFFD15796, "red" to 0xFFDF5452,
    )
    val nombres = listOf("gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red")
    fun de(nombre: String?, oscuro: Boolean): Color =
        Color((if (oscuro) this.oscuro else claro)[nombre] ?: (if (oscuro) this.oscuro else claro).getValue("gray"))
}

/** Colores del texto y del resaltado del editor (los de BlockNote, `defaultColors.ts`). */
object ColoresTexto {
    private val claro = mapOf(
        "gray" to (0xFF9B9A97 to 0xFFEBECED), "brown" to (0xFF64473A to 0xFFE9E5E3), "red" to (0xFFE03E3E to 0xFFFBE4E4),
        "orange" to (0xFFD9730D to 0xFFF6E9D9), "yellow" to (0xFFDFAB01 to 0xFFFBF3DB), "green" to (0xFF4D6461 to 0xFFDDEDEA),
        "blue" to (0xFF0B6E99 to 0xFFDDEBF1), "purple" to (0xFF6940A5 to 0xFFEAE4F2), "pink" to (0xFFAD1A72 to 0xFFF4DFEB),
    )
    private val oscuro = mapOf(
        "gray" to (0xFFBEBDB8 to 0xFF9B9A97), "brown" to (0xFF8E6552 to 0xFF64473A), "red" to (0xFFEC4040 to 0xFFBE3434),
        "orange" to (0xFFE3790D to 0xFFB7600A), "yellow" to (0xFFDFAB01 to 0xFFB58B00), "green" to (0xFF6B8B87 to 0xFF4D6461),
        "blue" to (0xFF0E87BC to 0xFF0B6E99), "purple" to (0xFF8552D7 to 0xFF6940A5), "pink" to (0xFFDA208F to 0xFFAD1A72),
    )
    val nombres = listOf("gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink")
    fun texto(nombre: String?, oscuro: Boolean): Color? = (if (oscuro) this.oscuro else claro)[nombre]?.first?.let { Color(it) }
    fun fondo(nombre: String?, oscuro: Boolean): Color? = (if (oscuro) this.oscuro else claro)[nombre]?.second?.let { Color(it) }
}

private val tipografia = Typography(
    // Altura de línea en em: si un Text cambia el tamaño, la línea se ajusta con él
    // (con sp, un texto de 14 heredaba los 24 sp de línea y quedaba a doble espacio).
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 1.45.em),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 1.43.em),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun TemaNotiono(oscuro: Boolean = esOscuro(), contenido: @Composable () -> Unit) {
    val c = if (oscuro) ColoresOscuros else ColoresClaros
    // `outline` es el pulgar y el borde de un interruptor apagado: con el color de los bordes,
    // en oscuro no se veía (el resto de bordes van con `outlineVariant` o con colores propios).
    val esquema = if (oscuro) {
        darkColorScheme(
            primary = Marca, onPrimary = Color.White, background = c.fondo, onBackground = c.texto,
            surface = c.fondo, onSurface = c.texto, surfaceVariant = c.superficie, onSurfaceVariant = c.apagado,
            outline = c.apagado, outlineVariant = c.borde, secondaryContainer = c.activo, onSecondaryContainer = c.texto,
            surfaceContainer = c.superficie, surfaceContainerHigh = Color(0xFF262625), surfaceContainerLow = c.superficie,
            surfaceContainerHighest = Color(0xFF2C2C2A), primaryContainer = c.marcaSuave, onPrimaryContainer = Marca,
        )
    } else {
        lightColorScheme(
            primary = Marca, onPrimary = Color.White, background = c.fondo, onBackground = c.texto,
            surface = c.fondo, onSurface = c.texto, surfaceVariant = c.superficie, onSurfaceVariant = c.apagado,
            outline = c.apagado, outlineVariant = c.borde, secondaryContainer = c.activo, onSecondaryContainer = c.texto,
            surfaceContainer = c.superficie, surfaceContainerHigh = Color(0xFFFFFFFF), surfaceContainerLow = c.superficie,
            surfaceContainerHighest = Color(0xFFF1EFEB), primaryContainer = c.marcaSuave, onPrimaryContainer = Marca,
        )
    }
    CompositionLocalProvider(LocalColores provides c) {
        MaterialTheme(colorScheme = esquema, typography = tipografia, content = contenido)
    }
}
