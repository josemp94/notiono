package com.monrealperez.notiono.bd

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.datos.Fila
import com.monrealperez.notiono.red.num
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Etiquetas
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Fechas
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Píldora de una opción con su color de Notion. */
@Composable
fun Pildora(texto: String, color: String?, modifier: Modifier = Modifier, grupo: String? = null) {
    Row(
        modifier.clip(RoundedCornerShape(4.dp)).background(Etiquetas.fondo(color ?: "default", C.oscuro)).padding(horizontal = 6.dp, vertical = 1.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (grupo != null) {
            // Estado: el puntito del grupo (Por hacer / En curso / Hecho), como en Notion.
            Box(Modifier.size(7.dp).clip(CircleShape).background(when (grupo) { "done" -> Color(0xFF448361); "doing" -> Color(0xFF337EA9); else -> Color(0xFF9B9994) }))
            Box(Modifier.width(5.dp))
        }
        Text(texto, fontSize = 13.sp, color = Etiquetas.tinta(C.oscuro), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun Avatar(nombre: String, tam: Int = 20) {
    val iniciales = nombre.substringBefore('@').split(Regex("[\\s._-]+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }.ifBlank { "?" }
    Box(Modifier.size(tam.dp).clip(CircleShape).background(C.activo), contentAlignment = Alignment.Center) {
        Text(iniciales, fontSize = (tam * 0.42f).sp, fontWeight = FontWeight.SemiBold, color = C.texto)
    }
}

fun lista(e: JsonElement?): List<JsonElement> = (e as? JsonArray)?.toList() ?: if (e is JsonPrimitive && e.content.isNotEmpty() && e.isString) listOf(e) else emptyList()

/** Cómo se ve el valor de una celda (en tablas, tarjetas, listas y la ficha). */
@Composable
fun ValorCelda(
    est: EstadoBD,
    fila: Fila,
    campo: Campo,
    modifier: Modifier = Modifier,
    unaLinea: Boolean = true,
    enFicha: Boolean = false,
) {
    val celdas = est.celdas(fila)
    val v = celdas[campo.id]
    val texto = fila.textos[campo.id].orEmpty()
    val cfg = campo.cfg()
    val vacio: @Composable () -> Unit = { if (enFicha) Text("Vacío", fontSize = 14.sp, color = C.apagado.copy(alpha = 0.7f)) }
    when (campo.type) {
        "select", "status" -> {
            val id = (v as? JsonPrimitive)?.content
            val o = campo.opciones().firstOrNull { it.id == id }
            if (o != null) Pildora(o.label, o.color, modifier, if (campo.type == "status") (o.grupo ?: "todo") else null) else vacio()
        }
        "multiselect" -> {
            val ids = lista(v).map { (it as? JsonPrimitive)?.content }
            val ops = campo.opciones()
            if (ids.isEmpty()) vacio()
            else FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(3.dp), maxLines = if (unaLinea) 1 else Int.MAX_VALUE) {
                for (id in ids) ops.firstOrNull { it.id == id }?.let { Pildora(it.label, it.color) }
            }
        }
        "person", "created_by", "last_edited_by" -> {
            val ids = when (campo.type) {
                "created_by" -> listOfNotNull(fila.createdById)
                "last_edited_by" -> listOfNotNull(fila.updatedById)
                else -> lista(v).mapNotNull { (it as? JsonPrimitive)?.content }
            }
            if (ids.isEmpty()) vacio()
            else FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), maxLines = if (unaLinea) 1 else Int.MAX_VALUE) {
                for (id in ids) {
                    val nombre = est.nombrePersona(id) ?: "—"
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(nombre)
                        Text(nombre, fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(start = 4.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        "checkbox" -> CajaCasilla((v as? JsonPrimitive)?.content == "true", modifier)
        "files" -> {
            val adj = lista(v).mapNotNull { it as? JsonObject }
            if (adj.isEmpty()) vacio()
            else {
                val api = Servicios.de(LocalContext.current).api
                Row(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    for (a in adj.take(if (unaLinea) 3 else 12)) {
                        if ((a.str("mime") ?: "").startsWith("image/")) {
                            AsyncImage(api.absoluta(a.str("url").orEmpty()), null, contentScale = ContentScale.Crop, modifier = Modifier.size(24.dp).clip(RoundedCornerShape(3.dp)))
                        } else {
                            Row(Modifier.clip(RoundedCornerShape(4.dp)).background(C.hover).padding(horizontal = 4.dp, vertical = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icono("paperclip", tam = 12.dp, color = C.apagado)
                                Text(a.str("name") ?: "archivo", fontSize = 12.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 2.dp))
                            }
                        }
                    }
                }
            }
        }
        "relation" -> {
            val rel = fila.relaciones[campo.id] ?: emptyList()
            if (rel.isEmpty()) vacio()
            else FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), maxLines = if (unaLinea) 1 else Int.MAX_VALUE) {
                for (r in rel) Row(verticalAlignment = Alignment.CenterVertically) {
                    Icono("file-text", tam = 13.dp, color = C.apagado)
                    Text(r.title, fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(start = 2.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        "created_time", "last_edited_time" -> Text(Fechas.fechaHora(if (campo.type == "created_time") fila.createdAt else fila.updatedAt), fontSize = 14.sp, color = C.apagado, modifier = modifier)
        "number" -> {
            if (texto.isBlank()) vacio()
            else {
                val formato = cfg.str("format")
                val n = (v as? JsonPrimitive)?.content?.toDoubleOrNull()
                val max = cfg.num("max")?.takeIf { it > 0 } ?: 100.0
                Row(modifier, verticalAlignment = Alignment.CenterVertically) {
                    Text(texto, fontSize = 14.sp, color = C.texto)
                    if ((formato == "bar" || formato == "ring") && n != null) {
                        val pct = (n / max).coerceIn(0.0, 1.0).toFloat()
                        Box(Modifier.padding(start = 6.dp).width(54.dp).height(5.dp).clip(RoundedCornerShape(3.dp)).background(C.borde)) {
                            Box(Modifier.fillMaxWidth(pct).height(5.dp).background(Marca))
                        }
                    }
                }
            }
        }
        "url", "email", "phone" -> if (texto.isBlank()) vacio() else Text(texto, fontSize = 14.sp, color = C.texto, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline, maxLines = if (unaLinea) 1 else 4, overflow = TextOverflow.Ellipsis, modifier = modifier)
        "button" -> {
            val etiqueta = cfg.str("label")?.ifBlank { null } ?: "Hacer"
            Text(etiqueta, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Marca, modifier = modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, Marca.copy(alpha = 0.6f), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 2.dp))
        }
        else -> if (texto.isBlank()) vacio() else Text(
            texto, fontSize = 14.sp, color = if (campo.type in setOf("formula", "rollup", "id")) C.apagado else C.texto,
            maxLines = if (unaLinea) 1 else 50, overflow = TextOverflow.Ellipsis, modifier = modifier,
        )
    }
}

@Composable
fun CajaCasilla(si: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier.size(20.dp).clip(RoundedCornerShape(4.dp)).background(if (si) Marca else Color.Transparent)
            .let { if (!si) it.border(1.5.dp, C.apagado, RoundedCornerShape(4.dp)) else it },
        contentAlignment = Alignment.Center,
    ) { if (si) Icono("check", tam = 14.dp, color = Color.White, trazo = 3f) }
}

/**
 * Casilla de listas y tarjetas: tocarla la marca al momento (con su cola sin red)
 * y no abre la ficha. En solo lectura se ve pero no se toca.
 */
@Composable
fun CasillaTocable(est: EstadoBD, fila: Fila, campo: Campo, conNombre: Boolean = false) {
    val si = (est.celdas(fila)[campo.id] as? JsonPrimitive)?.content == "true"
    Row(
        Modifier.heightIn(min = 40.dp).widthIn(min = 40.dp).clip(RoundedCornerShape(6.dp))
            .let { if (est.editable) it.toggleable(si, role = Role.Checkbox) { v -> est.ponCelda(fila.id, campo.id, JsonPrimitive(v)) } else it }
            .semantics { contentDescription = campo.name },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        CajaCasilla(si)
        if (conNombre && campo.name.isNotBlank()) Text(campo.name, fontSize = 13.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp, end = 4.dp))
    }
}

/** Pulsar el botón de un campo Botón: aplica sus acciones a la fila (y abre su página si la tiene). */
fun pulsaBoton(est: EstadoBD, fila: Fila, campo: Campo, abrir: (String) -> Unit) {
    val cfg = campo.cfg()
    val hoy = Fechas.hoy()
    (cfg["acciones"] as? JsonArray)?.forEach { a ->
        val o = a as? JsonObject ?: return@forEach
        val fid = o.str("fieldId") ?: return@forEach
        val valor = o["value"].let { if ((it as? JsonPrimitive)?.content == "@hoy") JsonPrimitive(hoy) else it }
        est.ponCelda(fila.id, fid, valor)
    }
    cfg.str("abrePageId")?.takeIf { it.isNotBlank() }?.let(abrir)
}

/** Fondo de fila/tarjeta por color (reglas o etiqueta), o nada. */
@Composable
fun fondoFila(color: String?): Color? = color?.let { Etiquetas.fondo(it, C.oscuro).copy(alpha = if (C.oscuro) 0.55f else 0.6f) }
