package com.monrealperez.notiono.ui.pagina

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.emoji2.emojipicker.EmojiPickerView
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Portadas
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.ColoresIcono
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Imagenes
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonPrimitive

/** Iconos de página dibujados: [nombre, palabras de búsqueda], en el orden de la web. */
private fun iconosPagina(ctx: android.content.Context): List<Pair<String, String>> =
    runCatching {
        val t = ctx.assets.open("iconos-pagina.json").bufferedReader().use { it.readText() }
        (json.parseToJsonElement(t) as JsonArray).map { (it as JsonArray).let { p -> p[0].jsonPrimitive.content to p[1].jsonPrimitive.content } }
    }.getOrDefault(emptyList())

/**
 * Selector de icono como el de la web: Emojis (el selector nativo de Android, con
 * búsqueda y recientes), Iconos (los dibujos de lucide en los colores de Notion) y
 * Subir una imagen. `null` = quitar el icono.
 */
@Composable
fun SelectorIcono(onElegir: (String?) -> Unit, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberCoroutineScope()
    var pestaña by remember { mutableIntStateOf(0) }
    var color by remember { mutableStateOf("gray") }
    var filtro by remember { mutableStateOf("") }
    val iconos = remember { iconosPagina(ctx) }
    val galeria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) alcance.launch {
            try {
                val (bytes, nombre, mime) = Imagenes.lee(ctx, uri, maxLado = 256)
                onElegir(s.api.subir(bytes, nombre, mime, soloImagen = true).url)
            } catch (e: Exception) {
                Avisos.di(e.message ?: "No se pudo subir la imagen")
            }
        }
    }
    Hoja(onCerrar, completa = true) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TabRow(
                pestaña, Modifier.weight(1f), containerColor = C.fondo, contentColor = C.texto,
                indicator = { p -> TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(p[pestaña]), color = Marca) },
                divider = {},
            ) {
                for ((i, t) in listOf("Emojis", "Iconos", "Subir").withIndex()) Tab(pestaña == i, { pestaña = i }, text = { Text(t, fontSize = 14.sp) })
            }
            TextButton({ onElegir(null) }) { Text("Quitar", color = C.apagado) }
        }
        when (pestaña) {
            0 -> AndroidView(
                factory = { c -> EmojiPickerView(c).apply { emojiGridColumns = 8; setOnEmojiPickedListener { onElegir(it.emoji) } } },
                modifier = Modifier.fillMaxWidth().height(420.dp),
            )
            1 -> Column {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (c in ColoresIcono.nombres) {
                        Box(
                            Modifier.size(26.dp).clip(CircleShape).background(ColoresIcono.de(c, C.oscuro))
                                .border(2.dp, if (c == color) C.texto else androidx.compose.ui.graphics.Color.Transparent, CircleShape)
                                .clickable { color = c },
                        )
                    }
                }
                Box(Modifier.padding(horizontal = 16.dp)) { Campo(filtro, { filtro = it }, placeholder = "Buscar icono…") }
                val lista = iconos.filter { (n, p) -> filtro.isBlank() || n.contains(filtro, true) || p.contains(filtro, true) }
                LazyVerticalGrid(GridCells.Adaptive(48.dp), Modifier.fillMaxWidth().height(360.dp).padding(8.dp)) {
                    items(lista, key = { it.first }) { (nombre, _) ->
                        Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(8.dp)).clickable { onElegir("icono:$nombre:$color") }, contentAlignment = Alignment.Center) {
                            Icono(nombre, tam = 26.dp, color = ColoresIcono.de(color, C.oscuro), trazo = 2f)
                        }
                    }
                }
            }
            else -> Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Una imagen de la galería como icono (se recorta cuadrada).", color = C.apagado, fontSize = 14.sp)
                TextButton({ galeria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                    Icono("upload", color = Marca)
                    Text("  Elegir imagen", color = Marca)
                }
            }
        }
    }
}

/** Portada: los degradados de la web o una imagen de la galería. */
@Composable
fun SelectorPortada(onElegir: (String?) -> Unit, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberCoroutineScope()
    var subiendo by remember { mutableStateOf(false) }
    val galeria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) alcance.launch {
            subiendo = true
            try {
                val (bytes, nombre, mime) = Imagenes.lee(ctx, uri, maxLado = 2000)
                onElegir("url:" + s.api.subir(bytes, nombre, mime, soloImagen = true).url)
            } catch (e: Exception) {
                Avisos.di(e.message ?: "No se pudo subir la imagen")
            } finally {
                subiendo = false
            }
        }
    }
    Hoja(onCerrar, "Portada") {
        LazyVerticalGrid(GridCells.Fixed(2), Modifier.fillMaxWidth().height(260.dp).padding(horizontal = 12.dp)) {
            items(Portadas.degradados.keys.toList()) { k ->
                Box(Modifier.padding(4.dp).fillMaxWidth().height(52.dp).clip(RoundedCornerShape(8.dp)).background(Portadas.brocha("gradient:$k")).clickable { onElegir("gradient:$k") })
            }
        }
        Row(Modifier.padding(horizontal = 8.dp)) {
            TextButton({ galeria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !subiendo) {
                Icono("image-plus", color = Marca)
                Text(if (subiendo) "  Subiendo…" else "  Subir imagen", color = Marca)
            }
            TextButton({ onElegir(null) }) { Text("Quitar portada", color = C.apagado) }
        }
    }
}
