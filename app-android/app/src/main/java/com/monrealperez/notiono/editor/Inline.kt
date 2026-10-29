package com.monrealperez.notiono.editor

import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.Spanned
import com.monrealperez.notiono.red.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.LocalDate
import java.time.format.TextStyle

/** Colores con los que se pintan los spans (cambian con el tema claro/oscuro). */
data class Paleta(
    val oscuro: Boolean,
    val enlace: Int,
    val codigoFondo: Int,
    val codigoTinta: Int,
    val chipFondo: Int,
    val chipTinta: Int,
    val personaFondo: Int,
    val personaTinta: Int,
    val fechaFondo: Int,
    val fechaTinta: Int,
) {
    fun colorTexto(nombre: String): Int? = com.monrealperez.notiono.ui.tema.ColoresTexto.texto(nombre, oscuro)?.let { argb(it) }
    fun colorFondo(nombre: String): Int? = com.monrealperez.notiono.ui.tema.ColoresTexto.fondo(nombre, oscuro)?.let { argb(it) }

    private fun argb(c: androidx.compose.ui.graphics.Color): Int {
        val a = (c.alpha * 255).toInt()
        val r = (c.red * 255).toInt()
        val g = (c.green * 255).toInt()
        val b = (c.blue * 255).toInt()
        return (a shl 24) or (r shl 16) or (g shl 8) or b
    }

    companion object {
        val clara = Paleta(false, 0xFFFF5C28.toInt(), 0x14EB5757, 0xFFEB5757.toInt(), 0xFFFFF2EC.toInt(), 0xFFFF5C28.toInt(),
            0x260EA5E9, 0xFF0284C7.toInt(), 0x80E8E6E2.toInt(), 0xFF7A7872.toInt())
        val oscura = Paleta(true, 0xFFFF7A4F.toInt(), 0x26EB5757, 0xFFFF8A80.toInt(), 0xFF3A2015.toInt(), 0xFFFF7A4F.toInt(),
            0x330EA5E9, 0xFF38BDF8.toInt(), 0x802C2C29.toInt(), 0xFF9B9994.toInt())
    }
}

/**
 * El contenido en línea de BlockNote (texto con estilos, enlaces y chips) ↔ texto de
 * Android con spans. Tiene que ser una ida y vuelta EXACTA: lo que la app no toca debe
 * volver igual (si no, al guardar se reescribiría contenido ajeno). Lo comprueban las
 * pruebas con documentos reales del editor de la web.
 */
object Inline {

    /** El texto de un chip: «📄 Título», «@Ana», «Hoy». */
    fun etiquetaChip(nodo: JsonObject, hoy: LocalDate = LocalDate.now()): String {
        val p = nodo["props"] as? JsonObject ?: JsonObject(emptyMap())
        return when (nodo.str("type")) {
            "mention" -> (p.str("icon")?.takeIf { it.isNotBlank() && !it.startsWith("/") && !it.startsWith("http") && !it.startsWith("icono:") }?.let { "$it " } ?: "📄 ") +
                (p.str("title")?.ifBlank { null } ?: "Sin título")
            "personMention" -> "@" + (p.str("name")?.ifBlank { null } ?: "alguien")
            "dateMention" -> etiquetaFecha(p.str("fecha").orEmpty(), hoy)
            else -> "⟨${nodo.str("type") ?: "?"}⟩"
        }
    }

    /** «Hoy», «Mañana», «Ayer» o «25 dic» (con año si no es el actual), como el chip de la web. */
    /** Como la web: «Mañana», «25 dic»; con hora, «Mañana 9:00». */
    fun etiquetaFecha(fechaHora: String, hoy: LocalDate = LocalDate.now()): String {
        val hora = fechaHora.substringAfter('T', "").takeIf { it.isNotEmpty() }?.removePrefix("0")
        val dia = etiquetaDia(fechaHora.substringBefore('T'), hoy)
        return if (hora != null) "$dia $hora" else dia
    }

    private fun etiquetaDia(fecha: String, hoy: LocalDate): String {
        val d = runCatching { LocalDate.parse(fecha) }.getOrNull() ?: return fecha
        return when (d) {
            hoy -> "Hoy"
            hoy.plusDays(1) -> "Mañana"
            hoy.minusDays(1) -> "Ayer"
            else -> {
                val mes = d.month.getDisplayName(TextStyle.SHORT, com.monrealperez.notiono.util.Fechas.es).trimEnd('.')
                if (d.year == hoy.year) "${d.dayOfMonth} $mes" else "${d.dayOfMonth} $mes ${d.year}"
            }
        }
    }

    fun spanDeEstilo(clave: String, valor: JsonElement, pal: Paleta): Any {
        val v = (valor as? JsonPrimitive)?.takeIf { it.isString }?.content
        return when {
            clave == "bold" && valor == JsonPrimitive(true) -> NegritaSpan()
            clave == "italic" && valor == JsonPrimitive(true) -> CursivaSpan()
            clave == "underline" && valor == JsonPrimitive(true) -> SubrayadoSpan()
            clave == "strike" && valor == JsonPrimitive(true) -> TachadoSpan()
            clave == "code" && valor == JsonPrimitive(true) -> CodigoSpan(pal.codigoFondo, pal.codigoTinta)
            clave == "textColor" && v != null && pal.colorTexto(v) != null -> ColorTextoSpan(v, pal.colorTexto(v)!!)
            clave == "backgroundColor" && v != null && pal.colorFondo(v) != null -> ColorFondoSpan(v, pal.colorFondo(v)!!)
            else -> EstiloRaroSpan(clave, valor)
        }
    }

    fun chip(nodo: JsonObject, pal: Paleta): ChipSpan {
        val (fondo, tinta) = when (nodo.str("type")) {
            "personMention" -> pal.personaFondo to pal.personaTinta
            "dateMention" -> pal.fechaFondo to pal.fechaTinta
            else -> pal.chipFondo to pal.chipTinta
        }
        return ChipSpan(nodo, etiquetaChip(nodo), fondo, tinta)
    }

    private class Pendiente(val span: Any, val ini: Int, val fin: Int, val flags: Int)

    private fun añadeTexto(sb: SpannableStringBuilder, nodo: JsonObject, pal: Paleta, enlace: String?, spans: MutableList<Pendiente>) {
        val texto = nodo.str("text").orEmpty()
        if (texto.isEmpty()) return
        val ini = sb.length
        sb.append(texto)
        val fin = sb.length
        (nodo["styles"] as? JsonObject)?.forEach { (k, v) ->
            spans.add(Pendiente(spanDeEstilo(k, v, pal), ini, fin, Spanned.SPAN_EXCLUSIVE_INCLUSIVE))
        }
        if (enlace != null) spans.add(Pendiente(EnlaceSpan(enlace, pal.enlace), ini, fin, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE))
    }

    /** JSON de BlockNote → texto con spans. Acepta también el atajo `"content": "texto"`. */
    fun aSpannable(contenido: JsonElement?, pal: Paleta): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        // Los spans se ponen al final: uno «inclusivo» puesto antes de seguir añadiendo
        // texto se estiraría sobre el texto siguiente.
        val spans = ArrayList<Pendiente>()
        when (contenido) {
            is JsonPrimitive -> if (contenido.isString) sb.append(contenido.content)
            is JsonArray -> for (e in contenido) {
                val nodo = e as? JsonObject ?: continue
                when (nodo.str("type")) {
                    "text" -> añadeTexto(sb, nodo, pal, null, spans)
                    "link" -> {
                        val href = nodo.str("href").orEmpty()
                        val hijos = nodo["content"]
                        if (hijos is JsonPrimitive) {
                            añadeTexto(sb, JsonObject(mapOf("type" to JsonPrimitive("text"), "text" to hijos, "styles" to JsonObject(emptyMap()))), pal, href, spans)
                        } else (hijos as? JsonArray)?.forEach { h -> (h as? JsonObject)?.let { añadeTexto(sb, it, pal, href, spans) } }
                    }
                    else -> {
                        val ini = sb.length
                        sb.append(OBJ)
                        spans.add(Pendiente(chip(nodo, pal), ini, ini + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE))
                    }
                }
            }
            else -> {}
        }
        for (p in spans) sb.setSpan(p.span, p.ini, p.fin, p.flags)
        return sb
    }

    /** Estilos que cubren el tramo [a, b) (los de spans de longitud cero no cuentan). */
    private fun estilos(sp: Spanned, a: Int, b: Int): JsonObject {
        val m = LinkedHashMap<String, JsonElement>()
        for (s in sp.getSpans(a, b, EstiloBN::class.java)) {
            if (sp.getSpanStart(s) <= a && sp.getSpanEnd(s) >= b && sp.getSpanEnd(s) > sp.getSpanStart(s)) m[s.clave] = s.valor
        }
        return JsonObject(m)
    }

    /** Texto con spans → JSON de BlockNote (tramos con el mismo estilo, juntos; enlaces agrupados). */
    fun aJson(sp: Spanned): JsonArray {
        val n = sp.length
        if (n == 0) return JsonArray(emptyList())
        // Cortes en cada inicio/fin de span que importa.
        val cortes = sortedSetOf(0, n)
        for (s in sp.getSpans(0, n, Any::class.java)) {
            if (s is EstiloBN || s is EnlaceSpan || s is ChipSpan) {
                cortes.add(sp.getSpanStart(s).coerceIn(0, n))
                cortes.add(sp.getSpanEnd(s).coerceIn(0, n))
            }
        }
        for (i in 0 until n) if (sp[i] == OBJ) { cortes.add(i); cortes.add(i + 1) }
        val trozos = cortes.toList()
        val salida = ArrayList<JsonElement>()
        var enlaceAbierto: EnlaceSpan? = null
        var hijosEnlace = ArrayList<JsonObject>()
        fun cierraEnlace() {
            val e = enlaceAbierto ?: return
            salida.add(JsonObject(mapOf("type" to JsonPrimitive("link"), "href" to JsonPrimitive(e.href), "content" to JsonArray(junta(hijosEnlace)))))
            enlaceAbierto = null
            hijosEnlace = ArrayList()
        }
        val sueltos = ArrayList<JsonObject>()
        fun vuelcaSueltos() {
            salida.addAll(junta(sueltos))
            sueltos.clear()
        }
        for (k in 0 until trozos.size - 1) {
            val a = trozos[k]
            val b = trozos[k + 1]
            if (a >= b) continue
            val chip = sp.getSpans(a, b, ChipSpan::class.java).firstOrNull { sp.getSpanStart(it) == a }
            if (chip != null && b - a == 1) {
                vuelcaSueltos()
                cierraEnlace()
                salida.add(chip.nodo)
                continue
            }
            val texto = sp.subSequence(a, b).toString().replace(OBJ.toString(), "")
            if (texto.isEmpty()) continue
            val nodo = JsonObject(mapOf("type" to JsonPrimitive("text"), "text" to JsonPrimitive(texto), "styles" to estilos(sp, a, b)))
            val enlace = sp.getSpans(a, b, EnlaceSpan::class.java).firstOrNull { sp.getSpanStart(it) <= a && sp.getSpanEnd(it) >= b }
            if (enlace != null) {
                if (enlaceAbierto != null && enlaceAbierto !== enlace && enlaceAbierto!!.href != enlace.href) cierraEnlace()
                if (enlaceAbierto == null) vuelcaSueltos()
                enlaceAbierto = enlace
                hijosEnlace.add(nodo)
            } else {
                cierraEnlace()
                sueltos.add(nodo)
            }
        }
        vuelcaSueltos()
        cierraEnlace()
        return JsonArray(salida)
    }

    /** Une textos seguidos con los mismos estilos (BlockNote nunca deja dos así). */
    private fun junta(nodos: List<JsonObject>): List<JsonObject> {
        val out = ArrayList<JsonObject>()
        for (n in nodos) {
            val ult = out.lastOrNull()
            if (ult != null && ult["styles"] == n["styles"]) {
                out[out.size - 1] = JsonObject(ult + ("text" to JsonPrimitive(ult.str("text").orEmpty() + n.str("text").orEmpty())))
            } else out.add(n)
        }
        return out
    }

    /** Solo el texto (para buscar, índices y el widget): chips con su etiqueta. */
    fun textoPlano(contenido: JsonElement?): String = when (contenido) {
        is JsonPrimitive -> if (contenido.isString) contenido.content else ""
        is JsonArray -> contenido.joinToString("") { e ->
            val o = e as? JsonObject ?: return@joinToString ""
            when (o.str("type")) {
                "text" -> o.str("text").orEmpty()
                "link" -> textoPlano(o["content"])
                else -> etiquetaChip(o)
            }
        }
        JsonNull, null -> ""
        else -> ""
    }

    /** Pone o quita un estilo en [a, b). */
    fun alterna(sp: Spannable, clave: String, valor: JsonElement, a: Int, b: Int, pal: Paleta, poner: Boolean) {
        if (a >= b) return
        // Recorta los spans de esa clave que pisan el tramo y conserva lo de fuera.
        for (s in sp.getSpans(a, b, EstiloBN::class.java).filter { it.clave == clave }) {
            val ini = sp.getSpanStart(s)
            val fin = sp.getSpanEnd(s)
            sp.removeSpan(s)
            if (ini < a) sp.setSpan(spanDeEstilo(clave, s.valor, pal), ini, a, Spanned.SPAN_EXCLUSIVE_INCLUSIVE)
            if (fin > b) sp.setSpan(spanDeEstilo(clave, s.valor, pal), b, fin, Spanned.SPAN_EXCLUSIVE_INCLUSIVE)
        }
        if (poner) sp.setSpan(spanDeEstilo(clave, valor, pal), a, b, Spanned.SPAN_EXCLUSIVE_INCLUSIVE)
    }

    /** ¿Todo [a, b) tiene ese estilo? (para encender el botón de la barra) */
    fun tiene(sp: Spanned, clave: String, a: Int, b: Int): Boolean {
        if (a >= b) return sp.getSpans((a - 1).coerceAtLeast(0), a, EstiloBN::class.java).any { it.clave == clave && sp.getSpanEnd(it) >= a && sp.getSpanStart(it) < a }
        return estilos(sp, a, b).containsKey(clave)
    }

    fun ponEnlace(sp: Spannable, href: String?, a: Int, b: Int, pal: Paleta) {
        for (s in sp.getSpans(a, b, EnlaceSpan::class.java)) {
            val ini = sp.getSpanStart(s)
            val fin = sp.getSpanEnd(s)
            sp.removeSpan(s)
            if (ini < a) sp.setSpan(EnlaceSpan(s.href, pal.enlace), ini, a, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (fin > b) sp.setSpan(EnlaceSpan(s.href, pal.enlace), b, fin, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        if (!href.isNullOrBlank() && a < b) sp.setSpan(EnlaceSpan(href, pal.enlace), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    /** Quita todos los estilos del tramo (el «limpiar formato»). */
    fun limpia(sp: Spannable, a: Int, b: Int, pal: Paleta) {
        for (clave in sp.getSpans(a, b, EstiloBN::class.java).map { it.clave }.toSet()) alterna(sp, clave, JsonNull, a, b, pal, false)
    }
}
