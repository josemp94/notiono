package com.monrealperez.notiono.ui.comun

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.LocalColores
import com.monrealperez.notiono.ui.tema.Marca

/**
 * Color de página (src/lib/colorPagina.ts): tiñe suave el fondo de la página y deja una
 * barrita de su color donde se lista. Los fondos son los de Notion (claro y oscuro) y la
 * barrita, los `--ico-*` de globals.css. `npm run check` mira que ids y nombres sean los de la web.
 */
object ColorPagina {
    class Tono(val id: String, val nombre: String, val fondoClaro: Long = 0, val fondoOscuro: Long = 0, val barraClara: Long = 0, val barraOscura: Long = 0)

    val COLORES_PAGINA = listOf(
        Tono("default", "Predeterminado"),
        Tono("gray", "Gris", 0xFFF1F1EF, 0xFF252525, 0xFF787774, 0xFF9B9B9B),
        Tono("brown", "Marrón", 0xFFF3EEEE, 0xFF2E2724, 0xFF9F6B53, 0xFFBA856F),
        Tono("orange", "Naranja", 0xFFF8ECDF, 0xFF36291F, 0xFFD9730D, 0xFFC77D48),
        Tono("yellow", "Amarillo", 0xFFFAF3DD, 0xFF372E20, 0xFFCB912F, 0xFFCA9849),
        Tono("green", "Verde", 0xFFEEF3ED, 0xFF242B26, 0xFF448361, 0xFF529E72),
        Tono("blue", "Azul", 0xFFE9F3F7, 0xFF1F282D, 0xFF337EA9, 0xFF379AD3),
        Tono("purple", "Morado", 0xFFF6F3F8, 0xFF2A2430, 0xFF9065B0, 0xFF9D68D3),
        Tono("pink", "Rosa", 0xFFF9F2F5, 0xFF2E2328, 0xFFC14C8A, 0xFFD15796),
        Tono("red", "Rojo", 0xFFFAECEC, 0xFF332523, 0xFFD44C47, 0xFFDF5452),
    )
    private val porId = COLORES_PAGINA.drop(1).associateBy { it.id }

    /** El color guardado, o null si no hay (o es «Predeterminado», o uno que ya no existe). */
    fun normaliza(v: String?): String? = v?.takeIf { it in porId }

    fun fondo(color: String?, oscuro: Boolean): Color? = porId[color]?.let { Color(if (oscuro) it.fondoOscuro else it.fondoClaro) }

    fun barra(color: String?, oscuro: Boolean): Color? = porId[color]?.let { Color(if (oscuro) it.barraOscura else it.barraClara) }
}

/** La barrita del color de página donde se lista (nada si no tiene color). */
@Composable
fun BarraColor(color: String?, modifier: Modifier = Modifier, alto: Dp = 16.dp) {
    val c = ColorPagina.barra(color, C.oscuro) ?: return
    Box(modifier.width(3.dp).height(alto).clip(RoundedCornerShape(2.dp)).background(c))
}

/** La muestra de un color en el selector (el cuadradito de los menús de color de Notion). */
@Composable
fun MuestraColorPagina(id: String) {
    val forma = RoundedCornerShape(4.dp)
    Box(Modifier.size(20.dp).clip(forma).background(ColorPagina.fondo(id, C.oscuro) ?: C.fondo).border(1.dp, C.borde, forma))
}

/** «Color de página» de ⋯ → Apariencia y diseño: los diez, con su muestra y una marca en el elegido. */
@Composable
fun SelectorColorPagina(valor: String?, onElegir: (String) -> Unit) {
    val actual = ColorPagina.normaliza(valor) ?: "default"
    TituloSeccion("Color de página")
    for (t in ColorPagina.COLORES_PAGINA) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable { onElegir(t.id) }.padding(horizontal = 16.dp, vertical = 8.dp)
                .semantics { selected = t.id == actual },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MuestraColorPagina(t.id)
            Text(t.nombre, color = C.texto, fontSize = 15.sp, modifier = Modifier.weight(1f))
            if (t.id == actual) Icono("check", color = Marca)
        }
    }
}

/** Lo de dentro, con el fondo teñido del color de la página (lo que pinta con `C.fondo` también, como `--background` en la web). */
@Composable
fun ConColorPagina(color: String?, contenido: @Composable () -> Unit) {
    val fondo = ColorPagina.fondo(color, C.oscuro) ?: return contenido()
    CompositionLocalProvider(LocalColores provides C.copy(fondo = fondo)) {
        Box(Modifier.background(fondo)) { contenido() }
    }
}
