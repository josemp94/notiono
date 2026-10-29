package com.monrealperez.notiono.bd

import androidx.compose.foundation.ExperimentalFoundationApi
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.datos.Fila
import com.monrealperez.notiono.red.int
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.PedirTexto
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.tema.C
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Ancho de cada columna: el guardado en la vista (`widths`, px de la web ≈ dp) o uno por tipo. */
fun anchoDe(est: EstadoBD, c: Campo): Dp {
    val guardado = est.vista?.cfg()?.obj("widths")?.int(c.id)
    if (guardado != null) return guardado.coerceAtLeast(32).dp
    return when (c.type) {
        "checkbox" -> 64.dp
        "number", "id" -> 110.dp
        "date", "created_time", "last_edited_time" -> 150.dp
        else -> if (c.id == est.titulo?.id) 220.dp else 160.dp
    }
}

/** Margen izquierdo de cada fila (desplegar subtareas, menú de la fila): el GUTTER_WIDTH de la web. */
private val MARGEN = 28.dp

private data class FilaTabla(val f: Fila, val nivel: Int, val hijos: Boolean)

/**
 * La Tabla: cabecera fija arriba, las primeras columnas congeladas (`frozen`, 1 por
 * defecto) y el resto con un scroll horizontal compartido por todas las filas.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun VistaTabla(est: EstadoBD, abrir: (String) -> Unit, nueva: (JsonObject?) -> Unit, embebida: Boolean) {
    val d = est.datos ?: return
    val n = LocalNavegador.current
    val campos = est.visibles()
    val cfg = est.vista?.cfg() ?: JsonObject(emptyMap())
    val congeladas = (cfg.int("frozen") ?: 1).coerceIn(0, campos.size)
    val fijos = campos.take(congeladas)
    val moviles = campos.drop(congeladas)
    val desplazamiento = rememberScrollState()
    var plegados by rememberSaveable { mutableStateOf(setOf<String>()) }
    var gruposPlegados by rememberSaveable { mutableStateOf(setOf<String>()) }
    var editando by remember { mutableStateOf<Pair<Fila, Campo>?>(null) }
    var menuFila by remember { mutableStateOf<Fila?>(null) }
    var menuCampo by remember { mutableStateOf<Campo?>(null) }
    var calculo by remember { mutableStateOf<Campo?>(null) }
    var renombrando by remember { mutableStateOf<Fila?>(null) }
    val porId = d.filas.associateBy { it.id }

    // Subtareas: bajo su madre si la madre está a la vista; si no, sueltas (como la web).
    val filasArbol = remember(d.filas, plegados) {
        val ids = d.filas.map { it.id }.toSet()
        val porPadre = d.filas.groupBy { if (it.parentId != null && it.parentId in ids) it.parentId else "" }
        val out = ArrayList<FilaTabla>()
        fun baja(padre: String, nivel: Int) {
            for (f in porPadre[padre] ?: emptyList()) {
                val tiene = porPadre.containsKey(f.id)
                out.add(FilaTabla(f, nivel, tiene))
                if (tiene && f.id !in plegados) baja(f.id, nivel + 1)
            }
        }
        baja("", 0)
        out
    }

    val celda: @Composable (Fila, Campo, Int) -> Unit = { f, c, nivel ->
        val esTitulo = c.id == est.titulo?.id
        Box(
            Modifier.width(anchoDe(est, c)).fillMaxHeight().padding(horizontal = 8.dp, vertical = 8.dp)
                .combinedClickable(
                    onClick = {
                        when {
                            esTitulo -> abrir(f.id)
                            c.type == "checkbox" && est.editable -> est.ponCelda(f.id, c.id, JsonPrimitive((est.celdas(f)[c.id] as? JsonPrimitive)?.content != "true"))
                            c.type == "button" -> pulsaBoton(est, f, c) { n.pagina(it) }
                            est.editable && c.type !in CAMPOS_AUTOMATICOS -> editando = f to c
                        }
                    },
                    onLongClick = { if (esTitulo && est.editable) renombrando = f else if (est.editable && c.type !in CAMPOS_AUTOMATICOS) editando = f to c },
                ),
        ) {
            if (esTitulo) Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width((nivel * 14).dp))
                com.monrealperez.notiono.ui.comun.BarraColor(f.colorPagina, Modifier.padding(end = 6.dp))
                Text(est.tituloDe(f), fontSize = 14.sp, fontWeight = FontWeight.Medium, color = C.texto, maxLines = 2, overflow = TextOverflow.Ellipsis)
            } else ValorCelda(est, f, c)
        }
    }

    val filaDe: @Composable (FilaTabla) -> Unit = { ft ->
        val fondo = fondoFila(ft.f.color)
        Row(
            Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 40.dp).let { if (fondo != null) it.background(fondo) else it },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.width(MARGEN).fillMaxHeight().combinedClickable(onClick = {
                    if (ft.hijos) plegados = if (ft.f.id in plegados) plegados - ft.f.id else plegados + ft.f.id else menuFila = ft.f
                }, onLongClick = { menuFila = ft.f }),
                contentAlignment = Alignment.Center,
            ) {
                if (ft.hijos) Icono(if (ft.f.id in plegados) "chevron-right" else "chevron-down", tam = 14.dp, color = C.apagado)
                else Icono("ellipsis-vertical", tam = 14.dp, color = C.borde)
            }
            for (c in fijos) {
                celda(ft.f, c, ft.nivel)
                Linea()
            }
            Row(Modifier.horizontalScroll(desplazamiento).fillMaxHeight()) {
                for (c in moviles) {
                    celda(ft.f, c, ft.nivel)
                    Linea()
                }
            }
        }
        Separador()
    }

    LazyColumn(Modifier.fillMaxSize()) {
        stickyHeader {
            CabeceraTabla(est, fijos, moviles, desplazamiento) { menuCampo = it }
        }
        val grupos = d.grupos
        if (grupos == null) {
            items(filasArbol, key = { it.f.id }) { filaDe(it) }
        } else {
            for (g in grupos) {
                item(key = "g:" + g.clave) {
                    Row(
                        Modifier.fillMaxWidth().clickable { gruposPlegados = if (g.clave in gruposPlegados) gruposPlegados - g.clave else gruposPlegados + g.clave }
                            .padding(horizontal = 8.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icono(if (g.clave in gruposPlegados) "chevron-right" else "chevron-down", tam = 15.dp, color = C.apagado)
                        Text(g.etiqueta, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(start = 6.dp))
                        Text("  ${g.ids.size}", fontSize = 13.sp, color = C.apagado)
                    }
                    Separador()
                }
                if (g.clave !in gruposPlegados) {
                    if (g.subgrupos != null) {
                        for (sg in g.subgrupos) {
                            item(key = "s:${g.clave}:${sg.clave}") {
                                Text("${sg.etiqueta}  ${sg.ids.size}", fontSize = 13.sp, color = C.apagado, fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(start = 30.dp, top = 8.dp, bottom = 4.dp))
                            }
                            items(sg.ids.mapNotNull { porId[it] }, key = { "${g.clave}:${sg.clave}:${it.id}" }) { filaDe(FilaTabla(it, 0, false)) }
                        }
                    } else items(g.ids.mapNotNull { porId[it] }, key = { "${g.clave}:${it.id}" }) { filaDe(FilaTabla(it, 0, false)) }
                    if (g.totales.isNotEmpty()) item(key = "t:" + g.clave) { FilaTotales(est, fijos, moviles, desplazamiento, g.totales) { calculo = it } }
                }
            }
        }
        if (est.editable) item(key = "__nueva") {
            Row(Modifier.fillMaxWidth().clickable { nueva(null) }.padding(horizontal = 10.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icono("plus", tam = 16.dp, color = C.apagado)
                Text("Nueva", color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(start = 8.dp))
            }
            Separador()
        }
        item(key = "__totales") {
            FilaTotales(est, fijos, moviles, desplazamiento, d.totales) { calculo = it }
            if (!embebida) Box(Modifier.height(80.dp))
        }
    }

    editando?.let { (f, c) -> EditorCelda(est, porId[f.id] ?: f, c) { editando = null } }
    menuFila?.let { f -> MenuFila(est, f, abrir) { menuFila = null } }
    menuCampo?.let { c -> HojaCampo(est, c) { menuCampo = null } }
    calculo?.let { c -> HojaCalculo(est, c) { calculo = null } }
    renombrando?.let { f ->
        val t = est.titulo
        PedirTexto("Nombre", est.tituloDe(f).takeIf { it != "Sin título" }.orEmpty(), onOk = { v ->
            if (t != null) est.ponCelda(f.id, t.id, if (v.isBlank()) null else JsonPrimitive(v))
            renombrando = null
        }, onNo = { renombrando = null })
    }
}

@Composable
private fun Linea() = Box(Modifier.width(1.dp).fillMaxHeight().background(C.borde.copy(alpha = 0.6f)))

@Composable
private fun CabeceraTabla(est: EstadoBD, fijos: List<Campo>, moviles: List<Campo>, desplazamiento: ScrollState, onCampo: (Campo) -> Unit) {
    val cab: @Composable (Campo) -> Unit = { c ->
        Row(
            Modifier.width(anchoDe(est, c)).fillMaxHeight().clickable { onCampo(c) }.padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icono(iconoCampo(c.type), tam = 14.dp, color = C.apagado)
            Text(c.name, fontSize = 13.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 4.dp))
        }
    }
    Row(Modifier.fillMaxWidth().height(36.dp).background(C.fondo), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(MARGEN))
        for (c in fijos) { cab(c); Linea() }
        Row(Modifier.horizontalScroll(desplazamiento).fillMaxHeight()) {
            for (c in moviles) { cab(c); Linea() }
            if (est.editable) Box(
                Modifier.width(48.dp).fillMaxHeight().clickable { onCampo(NUEVO_CAMPO) }
                    .semantics { contentDescription = "Añadir propiedad" },
                contentAlignment = Alignment.Center,
            ) {
                Icono("plus", tam = 16.dp, color = C.apagado)
            }
        }
    }
    Separador()
}

/** Marcador para «añadir columna» desde la cabecera. */
val NUEVO_CAMPO = Campo(id = "__nuevo", name = "", type = "__nuevo")

@Composable
private fun FilaTotales(est: EstadoBD, fijos: List<Campo>, moviles: List<Campo>, desplazamiento: ScrollState, totales: Map<String, String>, onCalculo: (Campo) -> Unit) {
    val celda: @Composable (Campo) -> Unit = { c ->
        Box(Modifier.width(anchoDe(est, c)).clickable(enabled = est.editable) { onCalculo(c) }.padding(8.dp), contentAlignment = Alignment.CenterEnd) {
            val t = totales[c.id]
            val nombre = CALCULOS.firstOrNull { it.first == calcDe(est, c) }?.second
            if (t != null) Text("${nombre ?: ""} $t".trim(), fontSize = 12.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
    Row(Modifier.fillMaxWidth().height(36.dp)) {
        Box(Modifier.width(MARGEN))
        for (c in fijos) celda(c)
        Row(Modifier.horizontalScroll(desplazamiento)) { for (c in moviles) celda(c) }
    }
}

/** Cálculos de columna (CALC_OPTS de la web). */
val CALCULOS = listOf(
    "" to "Ninguno", "count" to "Contar todo", "filled" to "No vacías", "empty" to "Vacías", "percent_filled" to "% no vacías",
    "sum" to "Suma", "avg" to "Media", "min" to "Mín", "max" to "Máx",
)

fun calcDe(est: EstadoBD, c: Campo) = (est.vista?.cfg()?.obj("calcs")?.get(c.id) as? JsonPrimitive)?.content ?: ""

@Composable
private fun HojaCalculo(est: EstadoBD, c: Campo, onCerrar: () -> Unit) {
    Hoja(onCerrar, "Calcular «${c.name}»") {
        for ((k, nombre) in CALCULOS) {
            FilaMenu(nombre, "sigma", derecha = { if (calcDe(est, c) == k) Icono("check", color = com.monrealperez.notiono.ui.tema.Marca) }) {
                val actuales = est.vista?.cfg()?.obj("calcs") ?: JsonObject(emptyMap())
                val nuevos = if (k.isEmpty()) JsonObject(actuales - c.id) else JsonObject(actuales + (c.id to JsonPrimitive(k)))
                est.ponConfig(mapOf("calcs" to nuevos))
                onCerrar()
            }
        }
    }
}

/** Menú de una fila: abrir, subtarea, duplicar, mover, plantilla y borrar. */
@Composable
fun MenuFila(est: EstadoBD, f: Fila, abrir: (String) -> Unit, onCerrar: () -> Unit) {
    val alcance = rememberAlcance()
    var plantilla by remember { mutableStateOf(false) }
    val ordenada = (est.vista?.cfg()?.get("sorts") as? kotlinx.serialization.json.JsonArray)?.isNotEmpty() == true || est.datos?.grupos != null
    Hoja(onCerrar, est.tituloDe(f)) {
        FilaMenu("Abrir", "maximize-2") { onCerrar(); abrir(f.id) }
        if (est.editable) {
            FilaMenu("Añadir subtarea", "corner-down-right") {
                onCerrar()
                alcance.launch { est.subtarea(f.id)?.let(abrir) }
            }
            FilaMenu("Duplicar", "copy-plus") { est.duplicaFila(f.id); onCerrar() }
            if (!ordenada) {
                val hermanas = est.datos?.filas?.filter { it.parentId == f.parentId } ?: emptyList()
                val i = hermanas.indexOfFirst { it.id == f.id }
                if (i > 0) FilaMenu("Subir", "arrow-up") { est.mueveFila(f.id, antesDe = hermanas[i - 1].id); onCerrar() }
                if (i in 0 until hermanas.size - 1) FilaMenu("Bajar", "arrow-down") { est.mueveFila(f.id, despuesDe = hermanas[i + 1].id); onCerrar() }
            }
            FilaMenu("Guardar como plantilla", "file-plus") { plantilla = true }
            Separador()
            FilaMenu("Borrar", "trash-2", color = androidx.compose.ui.graphics.Color(0xFFD44C47)) { est.borraFila(f.id); onCerrar() }
        }
    }
    if (plantilla) PedirTexto("Nombre de la plantilla", est.tituloDe(f), onOk = { t -> if (t.isNotBlank()) est.guardaPlantilla(f.id, t.trim()); plantilla = false; onCerrar() }, onNo = { plantilla = false })
}
