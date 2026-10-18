package com.monrealperez.notiono.editor

import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.widget.EditText
import android.widget.ImageView
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.bd.BdEmbebida
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Enlaces
import kotlinx.serialization.json.JsonPrimitive
import ru.noties.jlatexmath.JLatexMathDrawable

/** Lo que no es texto: imagen, vídeo, audio, archivo, tabla, enlace web, ecuación, índice, BD… */
@Composable
fun BloqueVisual(b: Bloque, estado: EstadoEditor, editable: Boolean, acciones: AccionesEditor) {
    val ctx = LocalContext.current
    val api = Servicios.de(ctx).api
    when (b.tipo) {
        "divider" -> Box(Modifier.fillMaxWidth().padding(vertical = 14.dp).height(1.dp).background(C.borde))
        "image" -> {
            val url = b.prop("url").orEmpty()
            var grande by remember { mutableStateOf(false) }
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                if (url.isBlank()) Vacio("image", "Añadir una imagen", editable) { acciones.cambiaMedio(b) }
                else AsyncImage(
                    model = api.absoluta(url), contentDescription = b.prop("caption"),
                    contentScale = ContentScale.FillWidth,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).clip(RoundedCornerShape(6.dp)).clickable { grande = true },
                )
                Pie(b, editable, acciones)
            }
            if (grande) Dialog({ grande = false }, DialogProperties(usePlatformDefaultWidth = false)) {
                Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black).clickable { grande = false }, contentAlignment = Alignment.Center) {
                    AsyncImage(model = api.absoluta(url), contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
                    Row(Modifier.align(Alignment.TopEnd).padding(16.dp)) {
                        Box(Modifier.size(40.dp).clickable { Enlaces.descarga(ctx, api.absoluta(url), b.prop("name") ?: "imagen") }, contentAlignment = Alignment.Center) {
                            Icono("download", color = androidx.compose.ui.graphics.Color.White)
                        }
                    }
                }
            }
        }
        "video", "audio", "file" -> {
            val url = b.prop("url").orEmpty()
            val icono = when (b.tipo) { "video" -> "video"; "audio" -> "music"; else -> "paperclip" }
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                if (url.isBlank()) Vacio(icono, "Añadir ${nombreTipo(b.tipo).lowercase()}", editable) { acciones.cambiaMedio(b) }
                else Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp))
                        .clickable { Enlaces.abreArchivo(ctx, api.absoluta(url), b.tipo) }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icono(if (b.tipo == "file") "paperclip" else "play", color = Marca)
                    Text(b.prop("name")?.ifBlank { null } ?: url.substringAfterLast('/'), fontSize = 15.sp, color = C.texto, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
                    Box(Modifier.size(32.dp).clickable { Enlaces.descarga(ctx, api.absoluta(url), b.prop("name") ?: "archivo") }, contentAlignment = Alignment.Center) {
                        Icono("download", color = C.apagado)
                    }
                }
                Pie(b, editable, acciones)
            }
        }
        "bookmark" -> {
            val url = b.prop("url").orEmpty()
            if (url.isBlank()) Vacio("link-2", "Añadir un enlace web", editable) { acciones.editaMarcador(b) }
            else Row(
                Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, C.borde, RoundedCornerShape(10.dp))
                    .clickable { Enlaces.abre(ctx, url) },
            ) {
                Column(Modifier.weight(1f).padding(12.dp)) {
                    Text(b.prop("title")?.ifBlank { null } ?: url, fontWeight = FontWeight.Medium, fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    b.prop("description")?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 13.sp, color = C.apagado, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                    Text(b.prop("siteName")?.ifBlank { null } ?: url, fontSize = 12.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                b.prop("image")?.takeIf { it.isNotBlank() }?.let {
                    AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.width(96.dp).height(84.dp))
                }
            }
        }
        "equation" -> Box(
            Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(6.dp)).clickable(enabled = editable) { acciones.editaTex(b) }.padding(8.dp),
            contentAlignment = Alignment.Center,
        ) {
            val tex = b.prop("tex").orEmpty()
            if (tex.isBlank()) Text(if (editable) "Nueva ecuación: toca para escribir TeX" else "", color = C.apagado, fontSize = 14.sp)
            else Ecuacion(tex, 19f)
        }
        "toc" -> Column(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp)).padding(10.dp)) {
            Text("TABLA DE CONTENIDOS", fontSize = 11.sp, color = C.apagado, fontWeight = FontWeight.Medium)
            val titulos = remember(estado.version) { estado.titulos() }
            if (titulos.isEmpty()) Text("Esta página aún no tiene encabezados.", fontSize = 14.sp, color = C.apagado)
            for ((h, nivel) in titulos) {
                Text(
                    h.texto.toString().replace(OBJ.toString(), ""), fontSize = 14.sp, color = C.texto,
                    modifier = Modifier.padding(start = ((nivel - 1).coerceIn(0, 3) * 14).dp, top = 3.dp).clickable { estado.foco = PeticionFoco(h.id, 0) },
                )
            }
        }
        "table" -> TablaEditable(b, estado, editable)
        "database" -> BdEmbebida(
            pageId = b.prop("pageId").orEmpty(),
            viewId = b.prop("viewId")?.ifBlank { null },
            onVista = { v -> if (editable) estado.props(b, "viewId" to JsonPrimitive(v)) },
        )
        else -> Row(
            Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(6.dp)).background(C.hover).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Un bloque que la app no sabe pintar: se enseña y se conserva intacto.
            Icono("info", tam = 16.dp, color = C.apagado)
            Text("Bloque «${b.tipo}»: se ve en la web", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun Vacio(icono: String, texto: String, editable: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(C.hover).clickable(enabled = editable, onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icono(icono, color = C.apagado)
        Text(texto, color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(start = 10.dp))
    }
}

@Composable
private fun Pie(b: Bloque, editable: Boolean, acciones: AccionesEditor) {
    val pie = b.prop("caption").orEmpty()
    if (pie.isNotBlank() || editable) {
        Text(
            pie.ifBlank { if (editable) "Añadir pie…" else "" },
            fontSize = 13.sp, color = C.apagado,
            modifier = Modifier.padding(top = 4.dp).clickable(enabled = editable) { acciones.editaPie(b) },
        )
    }
}

/** Ecuación pintada de forma nativa (jlatexmath). Si el TeX no se entiende, se enseña tal cual. */
@Composable
fun Ecuacion(tex: String, tamSp: Float) {
    val ctx = LocalContext.current
    val color = C.texto.toArgb()
    val px = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, tamSp, ctx.resources.displayMetrics)
    val dibujo = remember(tex, color, px) {
        runCatching { JLatexMathDrawable.builder(tex).textSize(px).color(color).align(JLatexMathDrawable.ALIGN_CENTER).padding(4).build() }.getOrNull()
    }
    if (dibujo == null) Text(tex, fontSize = 14.sp, color = C.apagado, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
    else Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { c -> ImageView(c).apply { scaleType = ImageView.ScaleType.CENTER } },
            update = { it.setImageDrawable(dibujo) },
            modifier = Modifier.width((dibujo.intrinsicWidth / ctx.resources.displayMetrics.density).dp).height((dibujo.intrinsicHeight / ctx.resources.displayMetrics.density).dp),
        )
    }
}

/** La tabla de BlockNote como rejilla editable: celdas, y añadir o quitar filas y columnas. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TablaEditable(b: Bloque, estado: EstadoEditor, editable: Boolean) {
    val celdas = Tabla.celdas(b.crudo)
    var menu by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val pal = estado.pal
    val tinta = C.texto.toArgb()
    val cabecera = ((b.crudo as? kotlinx.serialization.json.JsonObject)?.get("headerRows") as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
    // En columna: quien la pinta la mete en un Box y, sueltas, tabla y botones se pisaban.
    Column(Modifier.fillMaxWidth()) {
    Box(Modifier.fillMaxWidth().padding(vertical = 6.dp).horizontalScroll(rememberScrollState())) {
        Column(Modifier.border(1.dp, C.borde)) {
            celdas.forEachIndexed { i, fila ->
                Row {
                    fila.forEachIndexed { j, celda ->
                        Box(
                            Modifier.width(140.dp).heightIn(min = 40.dp).border(0.5.dp, C.borde)
                                .background(if (i < cabecera) C.superficie else C.fondo)
                                .combinedClickable(enabled = editable, onClick = {}, onLongClick = { menu = i to j })
                                .padding(6.dp),
                        ) {
                            // Cada celda es su propio texto con estilos; al cambiar se reescribe su JSON.
                            val sp = remember(b, i, j, celdas.size, fila.size) { Inline.aSpannable(celda, pal) }
                            AndroidView(
                                factory = { c ->
                                    EditText(c).apply {
                                        background = null
                                        setPadding(0, 0, 0, 0)
                                        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                                    }
                                },
                                update = { et ->
                                    et.setTextColor(tinta)
                                    if (et.tag !== sp) {
                                        et.tag = sp
                                        (et.getTag(com.monrealperez.notiono.R.id.oyente_celda) as? TextWatcher)?.let { et.removeTextChangedListener(it) }
                                        et.setText(sp)
                                        val w = object : TextWatcher {
                                            override fun beforeTextChanged(s: CharSequence?, a: Int, c: Int, d: Int) {}
                                            override fun onTextChanged(s: CharSequence?, a: Int, c: Int, d: Int) {}
                                            override fun afterTextChanged(s: Editable) {
                                                b.crudo = Tabla.conCelda(b.crudo, i, j, Inline.aJson(s))
                                                estado.texto(b)
                                            }
                                        }
                                        et.addTextChangedListener(w)
                                        et.setTag(com.monrealperez.notiono.R.id.oyente_celda, w)
                                    }
                                    et.isFocusable = editable
                                    et.isFocusableInTouchMode = editable
                                    if (i < cabecera) et.setTypeface(null, android.graphics.Typeface.BOLD)
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }
    if (editable) Row {
        Text("+ Fila", fontSize = 13.sp, color = C.apagado, modifier = Modifier.clickable { estado.contenido(b, Tabla.añadeFila(b.crudo, celdas.size)) }.padding(6.dp))
        Text("+ Columna", fontSize = 13.sp, color = C.apagado, modifier = Modifier.clickable { estado.contenido(b, Tabla.añadeColumna(b.crudo, celdas.firstOrNull()?.size ?: 0)) }.padding(6.dp))
    }
    }
    menu?.let { (i, j) ->
        Hoja({ menu = null }, "Fila ${i + 1}, columna ${j + 1}") {
            FilaMenu("Insertar fila encima", "arrow-up") { estado.contenido(b, Tabla.añadeFila(b.crudo, i)); menu = null }
            FilaMenu("Insertar fila debajo", "arrow-down") { estado.contenido(b, Tabla.añadeFila(b.crudo, i + 1)); menu = null }
            FilaMenu("Insertar columna a la izquierda", "arrow-left") { estado.contenido(b, Tabla.añadeColumna(b.crudo, j)); menu = null }
            FilaMenu("Insertar columna a la derecha", "arrow-right") { estado.contenido(b, Tabla.añadeColumna(b.crudo, j + 1)); menu = null }
            FilaMenu("Borrar fila", "trash-2") { estado.contenido(b, Tabla.quitaFila(b.crudo, i)); menu = null }
            FilaMenu("Borrar columna", "trash-2") { estado.contenido(b, Tabla.quitaColumna(b.crudo, j)); menu = null }
        }
    }
}
