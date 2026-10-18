package com.monrealperez.notiono.editor

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import android.text.style.BackgroundColorSpan
import android.text.style.CharacterStyle
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan
import android.text.style.ReplacementSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// Los estilos del texto como spans PROPIOS: así, al volver a JSON, se sabe qué es
// cada cosa (un StyleSpan cualquiera podría venir de pegar texto de otra app) y se
// conserva el nombre exacto del estilo de BlockNote ("bold", "textColor": "red"…).

/** Un estilo de BlockNote dentro del texto. `clave`/`valor` son los de `styles` en el JSON. */
interface EstiloBN {
    val clave: String
    val valor: JsonElement
}

private val VERDADERO = kotlinx.serialization.json.JsonPrimitive(true)

class NegritaSpan : StyleSpan(Typeface.BOLD), EstiloBN {
    override val clave = "bold"
    override val valor: JsonElement = VERDADERO
}

class CursivaSpan : StyleSpan(Typeface.ITALIC), EstiloBN {
    override val clave = "italic"
    override val valor: JsonElement = VERDADERO
}

class SubrayadoSpan : UnderlineSpan(), EstiloBN {
    override val clave = "underline"
    override val valor: JsonElement = VERDADERO
}

class TachadoSpan : StrikethroughSpan(), EstiloBN {
    override val clave = "strike"
    override val valor: JsonElement = VERDADERO
}

/** Código en línea: monoespaciada con fondo suave. */
class CodigoSpan(private val fondo: Int, private val tinta: Int) : MetricAffectingSpan(), EstiloBN {
    override val clave = "code"
    override val valor: JsonElement = VERDADERO
    override fun updateDrawState(tp: TextPaint) {
        tp.typeface = Typeface.MONOSPACE
        tp.bgColor = fondo
        tp.color = tinta
        tp.textSize = tp.textSize * 0.9f
    }

    override fun updateMeasureState(tp: TextPaint) {
        tp.typeface = Typeface.MONOSPACE
        tp.textSize = tp.textSize * 0.9f
    }
}

class ColorTextoSpan(val nombre: String, color: Int) : ForegroundColorSpan(color), EstiloBN {
    override val clave = "textColor"
    override val valor: JsonElement = kotlinx.serialization.json.JsonPrimitive(nombre)
}

class ColorFondoSpan(val nombre: String, color: Int) : BackgroundColorSpan(color), EstiloBN {
    override val clave = "backgroundColor"
    override val valor: JsonElement = kotlinx.serialization.json.JsonPrimitive(nombre)
}

/** Un estilo que la app no sabe pintar: no se ve, pero viaja intacto de vuelta. */
class EstiloRaroSpan(override val clave: String, override val valor: JsonElement) : CharacterStyle(), EstiloBN {
    override fun updateDrawState(tp: TextPaint) {}
}

/** Enlace: el texto de un `{type:"link", href, content}`. */
class EnlaceSpan(val href: String, private val color: Int) : CharacterStyle() {
    override fun updateDrawState(tp: TextPaint) {
        tp.color = color
        tp.isUnderlineText = true
    }
}

/**
 * Chip en línea (mención de página, persona o fecha, o un contenido que la app no
 * conoce): ocupa un carácter (U+FFFC) y guarda su JSON tal cual.
 */
class ChipSpan(val nodo: JsonObject, val etiqueta: String, private val fondo: Int, private val tinta: Int) : ReplacementSpan() {
    override fun getSize(paint: Paint, text: CharSequence?, start: Int, end: Int, fm: Paint.FontMetricsInt?): Int {
        if (fm != null) paint.getFontMetricsInt(fm)
        return (paint.measureText(etiqueta) + paint.textSize * 0.6f).toInt()
    }

    override fun draw(canvas: Canvas, text: CharSequence?, start: Int, end: Int, x: Float, top: Int, y: Int, bottom: Int, paint: Paint) {
        val ancho = paint.measureText(etiqueta) + paint.textSize * 0.6f
        val fmi = paint.fontMetrics
        val r = RectF(x, y + fmi.ascent - 2, x + ancho - paint.textSize * 0.15f, y + fmi.descent + 2)
        val color = paint.color
        paint.color = fondo
        canvas.drawRoundRect(r, 6f, 6f, paint)
        paint.color = tinta
        canvas.drawText(etiqueta, x + paint.textSize * 0.25f, y.toFloat(), paint)
        paint.color = color
    }
}

/** Carácter que ocupa un chip en el texto. */
const val OBJ = '￼'
