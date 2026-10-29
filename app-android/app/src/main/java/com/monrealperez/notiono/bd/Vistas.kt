package com.monrealperez.notiono.bd

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.datos.Fila
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.tema.C
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Un grupo del Kanban (columna o carril). */
data class GrupoK(val id: String, val etiqueta: String, val color: String)

fun agrupable(c: Campo) = c.type in setOf("select", "status", "person", "checkbox")

/** Columnas de un campo, como `gruposDe` del Kanban de la web. */
fun gruposDe(est: EstadoBD, c: Campo): List<GrupoK> = when (c.type) {
    "person" -> (est.datos?.personas ?: emptyList()).map { GrupoK(it.id, it.nombre, "blue") } + GrupoK("", "Sin asignar", "gray")
    "checkbox" -> listOf(GrupoK("true", "Hecho", "green"), GrupoK("", "Sin hacer", "gray"))
    else -> c.opciones().map { GrupoK(it.id, it.label, it.color ?: "gray") } + GrupoK("", "Sin asignar", "gray")
}.distinctBy { it.id } // son las claves de las columnas: una opción repetida cerraría la vista

fun claveDe(est: EstadoBD, c: Campo, grupos: List<GrupoK>, f: Fila): String {
    val v = est.celdas(f)[c.id]
    val id = when (c.type) {
        "person" -> lista(v).firstOrNull()?.let { (it as? JsonPrimitive)?.content } ?: ""
        "checkbox" -> if ((v as? JsonPrimitive)?.content == "true") "true" else ""
        else -> (v as? JsonPrimitive)?.content ?: ""
    }
    return if (grupos.any { it.id == id }) id else ""
}

/** Lo que se guarda al soltar una tarjeta en un grupo (valorDeGrupo de la web). */
fun valorDeGrupo(c: Campo, id: String): JsonElement = when {
    id.isEmpty() -> JsonNull
    c.type == "person" -> JsonArray(listOf(JsonPrimitive(id)))
    c.type == "checkbox" -> JsonPrimitive(true)
    else -> JsonPrimitive(id)
}

/** La imagen de portada de una tarjeta (vista previa: primera imagen del campo de archivos elegido). */
fun portadaDe(est: EstadoBD, f: Fila): String? {
    val campo = est.campo(est.cfgStr("cardPreview")) ?: return null
    return lista(est.celdas(f)[campo.id]).mapNotNull { it as? JsonObject }.firstOrNull { (it.str("mime") ?: "").startsWith("image/") }?.str("url")
}

/** Tarjeta (Kanban y Galería): portada, título y las propiedades visibles con valor. */
@Composable
fun Tarjeta(est: EstadoBD, f: Fila, modifier: Modifier = Modifier, conPortada: Boolean = true, alto: Int = 140) {
    val api = Servicios.de(LocalContext.current).api
    val visibles = est.visibles().filter { it.id != est.titulo?.id && it.id != est.cfgStr("cardPreview") }
    val portada = if (conPortada) portadaDe(est, f) else null
    val fondo = fondoFila(f.color) ?: C.fondo
    Column(modifier.clip(RoundedCornerShape(8.dp)).background(fondo).border(1.dp, C.borde, RoundedCornerShape(8.dp))) {
        if (portada != null) AsyncImage(
            api.absoluta(portada), null,
            contentScale = if (est.cfgStr("imageFit") == "contain") ContentScale.Fit else ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().height(alto.dp).background(C.hover),
        )
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(est.tituloDe(f), fontWeight = FontWeight.Medium, fontSize = 14.sp, color = C.texto, maxLines = 3, overflow = TextOverflow.Ellipsis)
            for (c in visibles) {
                val tiene = (f.textos[c.id]?.isNotBlank() == true) || (est.celdas(f)[c.id].let { it != null && it !is JsonNull && !(it is JsonArray && it.isEmpty()) }) ||
                    (c.type == "relation" && f.relaciones[c.id]?.isNotEmpty() == true)
                if (c.type == "checkbox") CasillaTocable(est, f, c, conNombre = true)
                else if (tiene && c.type !in setOf("created_time", "last_edited_time", "button")) ValorCelda(est, f, c)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun VistaKanban(est: EstadoBD, abrir: (String) -> Unit, nueva: (JsonObject?) -> Unit) {
    val d = est.datos ?: return
    val campoG = est.campo(est.cfgStr("groupByFieldId"))?.takeIf(::agrupable) ?: est.campos.firstOrNull(::agrupable)
    if (campoG == null) {
        Vacio("Añade un campo de tipo Selección, Estado, Persona o Casilla para usar la vista Kanban.", icono = "columns-3")
        return
    }
    val ocultos = est.vista?.cfg()?.arr("hiddenGroups")?.mapNotNull { (it as? JsonPrimitive)?.content }?.toSet() ?: emptySet()
    val columnas = gruposDe(est, campoG).filter { it.id !in ocultos }
    val campoS = est.campo(est.cfgStr("subGroupByFieldId"))?.takeIf { agrupable(it) && it.id != campoG.id }
    val carriles = campoS?.let { gruposDe(est, it) }
    val sumar = est.vista?.cfg()?.bool("kanbanSum") == true
    val numero = est.visibles().firstOrNull { it.type == "number" }
    val tam = when (est.cfgStr("cardSize")) { "small" -> 220; "large" -> 320; else -> 270 }
    // Arrastrar tarjetas: dónde está cada columna en pantalla. Se empieza de cero si cambia la
    // agrupación, y una columna que sale de la lista quita su zona: si no, la tarjeta podía
    // caer en una columna que ya no está y quedarse con un valor que no existe.
    val zonas = remember(campoG.id, campoS?.id) { mutableStateMapOf<String, Rect>() }
    var arrastre by remember { mutableStateOf<Pair<String, Offset>?>(null) }
    var menu by remember { mutableStateOf<Fila?>(null) }

    @Composable
    fun Columna(g: GrupoK, filas: List<Fila>, carril: GrupoK?, conScroll: Boolean) {
        val claveZona = "${carril?.id ?: "-"}|${g.id}"
        DisposableEffect(claveZona, zonas) { onDispose { zonas.remove(claveZona) } }
        Column(
            Modifier.width(tam.dp).padding(horizontal = 4.dp).clip(RoundedCornerShape(10.dp)).background(C.superficie)
                .onGloballyPositioned { zonas[claveZona] = it.boundsInRoot() }.padding(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
                Pildora(g.etiqueta, g.color)
                Text("  ${filas.size}", fontSize = 13.sp, color = C.apagado)
                if (sumar && numero != null) {
                    val suma = filas.sumOf { (est.celdas(it)[numero.id] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0 }
                    Text("  Σ ${"%.2f".format(suma).trimEnd('0').trimEnd(',', '.')}", fontSize = 12.sp, color = C.apagado)
                }
            }
            Column(if (conScroll) Modifier.verticalScroll(rememberScrollState()) else Modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (f in filas) key(f.id) {
                    val moviendo = arrastre?.first == f.id
                    var origen by remember { mutableStateOf(Offset.Zero) }
                    // El gesto vive más que una recomposición (se monta una vez por tarjeta): lee
                    // siempre lo último, no lo que había cuando empezó (una recarga lo cambia).
                    val fila by rememberUpdatedState(f)
                    val campoGrupo by rememberUpdatedState(campoG)
                    val columnasAhora by rememberUpdatedState(columnas)
                    val campoCarril by rememberUpdatedState(campoS)
                    val carrilesAhora by rememberUpdatedState(carriles)
                    Tarjeta(
                        est, f, alto = tam / 2,
                        modifier = Modifier.fillMaxWidth()
                            .onGloballyPositioned { origen = it.positionInRoot() }
                            .zIndex(if (moviendo) 1f else 0f)
                            // El bloque se repite al cambiar `arrastre`, antes de recomponer: leerlo aquí, sin `!!`.
                            .graphicsLayer { val a = arrastre; if (a != null && a.first == f.id) { translationX = a.second.x; translationY = a.second.y; alpha = 0.9f } }
                            .clickable { abrir(f.id) }
                            // Por dentro del clic: si no, el clic se queda el «soltar» y el arrastre se cancela.
                            .pointerInput(f.id) {
                                if (!est.editable) return@pointerInput
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { arrastre = f.id to Offset.Zero },
                                    onDrag = { c, delta -> c.consume(); arrastre = arrastre?.let { it.first to it.second + delta } },
                                    onDragEnd = {
                                        val a = arrastre
                                        arrastre = null
                                        if (a != null && a.second.getDistance() < 24f) { menu = fila; return@detectDragGesturesAfterLongPress }
                                        if (a != null) {
                                            val punto = origen + a.second + Offset(40f, 20f)
                                            val destino = zonas.entries.firstOrNull { it.value.contains(punto) }?.key ?: return@detectDragGesturesAfterLongPress
                                            val (carrilId, colId) = destino.split("|", limit = 2)
                                            if (columnasAhora.none { it.id == colId }) return@detectDragGesturesAfterLongPress
                                            val cg = campoGrupo
                                            if (colId != claveDe(est, cg, columnasAhora, fila)) est.ponCelda(fila.id, cg.id, valorDeGrupo(cg, colId))
                                            val cs = campoCarril
                                            val cars = carrilesAhora
                                            if (cs != null && cars != null && carrilId != "-" && carrilId != claveDe(est, cs, cars, fila)) est.ponCelda(fila.id, cs.id, valorDeGrupo(cs, carrilId))
                                        }
                                    },
                                    onDragCancel = { arrastre = null },
                                )
                            },
                    )
                }
                if (est.editable) Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).clickable {
                        val celdas = mutableMapOf<String, JsonElement>()
                        if (g.id.isNotEmpty()) celdas[campoG.id] = valorDeGrupo(campoG, g.id)
                        if (carril != null && carril.id.isNotEmpty() && campoS != null) celdas[campoS.id] = valorDeGrupo(campoS, carril.id)
                        nueva(JsonObject(celdas))
                    }.padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icono("plus", tam = 15.dp, color = C.apagado)
                    Text("Nueva", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(start = 4.dp))
                }
            }
        }
    }

    if (carriles == null) {
        LazyRow(Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
            items(columnas, key = { it.id }) { g -> Columna(g, d.filas.filter { claveDe(est, campoG, columnas, it) == g.id }, null, true) }
        }
    } else {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            for (carril in carriles) {
                val delCarril = d.filas.filter { claveDe(est, campoS, carriles, it) == carril.id }
                if (delCarril.isEmpty() && carril.id.isEmpty()) continue
                Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Pildora(carril.etiqueta, carril.color)
                    Text("  ${delCarril.size}", fontSize = 13.sp, color = C.apagado)
                }
                LazyRow(Modifier.padding(horizontal = 8.dp)) {
                    items(columnas, key = { carril.id + it.id }) { g -> Columna(g, delCarril.filter { claveDe(est, campoG, columnas, it) == g.id }, carril, false) }
                }
            }
        }
    }
    menu?.let { f ->
        HojaLista({ menu = null }, "Mover a…") {
            for (g in columnas) FilaMenu(g.etiqueta, "columns-3") { est.ponCelda(f.id, campoG.id, valorDeGrupo(campoG, g.id)); menu = null }
            Separador()
            FilaMenu("Abrir", "maximize-2") { menu = null; abrir(f.id) }
        }
    }
}

@Composable
fun VistaLista(est: EstadoBD, abrir: (String) -> Unit) {
    val d = est.datos ?: return
    val porId = d.filas.associateBy { it.id }
    val visibles = est.visibles().filter { it.id != est.titulo?.id }
    // Como en Notion: una casilla es una propiedad más, en su sitio, que se marca ahí
    // mismo sin abrir la ficha; el título no se tacha ni se apaga.
    val fila: @Composable (Fila) -> Unit = { f ->
        Column(Modifier.fillMaxWidth().background(fondoFila(f.color) ?: C.fondo).clickable { abrir(f.id) }.padding(horizontal = 16.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icono("file-text", tam = 16.dp, color = C.apagado)
                Text(
                    est.tituloDe(f), fontSize = 15.sp, fontWeight = FontWeight.Medium, color = C.texto,
                    modifier = Modifier.padding(start = 8.dp), maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            FlowRow(Modifier.padding(start = 24.dp, top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                for (c in visibles) {
                    val v = est.celdas(f)[c.id]
                    val tiene = f.textos[c.id]?.isNotBlank() == true || (v != null && v !is JsonNull && !(v is JsonArray && v.isEmpty())) || f.relaciones[c.id]?.isNotEmpty() == true
                    if (c.type == "checkbox") CasillaTocable(est, f, c, conNombre = true)
                    else if (tiene && c.type !in setOf("created_time", "last_edited_time", "button")) ValorCelda(est, f, c)
                }
            }
        }
        Separador()
    }
    LazyColumn(Modifier.fillMaxSize()) {
        val grupos = d.grupos
        if (grupos == null) items(d.filas, key = { it.id }) { fila(it) }
        else for (g in grupos) {
            item(key = "g" + g.clave) { Text("${g.etiqueta}  ${g.ids.size}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(16.dp, 12.dp, 16.dp, 4.dp)) }
            items(g.ids.mapNotNull { porId[it] }, key = { g.clave + it.id }) { fila(it) }
        }
        item { androidx.compose.foundation.layout.Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
fun VistaGaleria(est: EstadoBD, abrir: (String) -> Unit) {
    val d = est.datos ?: return
    val porId = d.filas.associateBy { it.id }
    val columnas = when (est.cfgStr("cardSize")) { "small" -> 3; "large" -> 1; else -> 2 }
    LazyVerticalGrid(GridCells.Fixed(columnas), Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
        val grupos = d.grupos
        val tarjeta: @Composable (Fila) -> Unit = { f ->
            Tarjeta(est, f, Modifier.padding(4.dp).fillMaxWidth().clickable { abrir(f.id) }, alto = if (columnas == 1) 200 else 120)
        }
        if (grupos == null) items(d.filas, key = { it.id }) { tarjeta(it) }
        else for (g in grupos) {
            item(key = "g" + g.clave, span = { GridItemSpan(maxLineSpan) }) {
                Text("${g.etiqueta}  ${g.ids.size}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(8.dp, 12.dp, 8.dp, 4.dp))
            }
            items(g.ids.mapNotNull { porId[it] }, key = { g.clave + it.id }) { tarjeta(it) }
        }
        item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.height(80.dp)) }
    }
}
