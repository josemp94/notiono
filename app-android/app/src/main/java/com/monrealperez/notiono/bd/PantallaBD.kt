package com.monrealperez.notiono.bd

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.datos.Vista
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Confirmar
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.PedirTexto
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.pagina.Cabecera
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** El estado de la BD de una página, con su recarga automática (cada 10 s y al cambiar algo). */
@Composable
fun rememberEstadoBD(pageId: String, vistaInicial: String? = null): EstadoBD {
    val s = Servicios.de(LocalContext.current)
    val alcance = rememberCoroutineScope()
    val est = remember(pageId) { EstadoBD(pageId, s, alcance).apply { vistaId = vistaInicial; cacheada() } }
    LaunchedEffect(pageId, est.vistaId, est.q) {
        if (est.q.isNotEmpty()) delay(250)
        est.carga()
    }
    LaunchedEffect(pageId) {
        while (true) {
            delay(10_000)
            est.carga()
        }
    }
    LaunchedEffect(pageId) { s.repo.cambios.collect { if (it == "vista:$pageId") est.recarga() } }
    return est
}

/** Una página de base de datos: cabecera, vistas y la vista elegida, como en la web. */
@Composable
fun PantallaBD(info: PaginaInfo) {
    val est = rememberEstadoBD(info.id)
    Column(Modifier.fillMaxSize()) {
        CuerpoBD(est, info, embebida = false, modifier = Modifier.weight(1f))
    }
}

/** Una BD dentro de una página (bloque «database»): sus vistas en una caja de alto fijo. */
@Composable
fun BdEmbebida(pageId: String, viewId: String?, onVista: (String) -> Unit) {
    if (pageId.isBlank()) {
        Text("Base de datos no disponible.", color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(8.dp))
        return
    }
    val n = LocalNavegador.current
    val est = rememberEstadoBD(pageId, viewId)
    LaunchedEffect(est.vistaId) { est.vistaId?.let { if (it != viewId) onVista(it) } }
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp))) {
        Row(Modifier.fillMaxWidth().clickable { n.pagina(pageId) }.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icono("database", tam = 16.dp, color = C.apagado)
            Text(est.datos?.collection?.name?.ifBlank { null } ?: "Base de datos", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = C.texto,
                modifier = Modifier.weight(1f).padding(start = 6.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icono("maximize-2", tam = 15.dp, color = C.apagado)
        }
        CuerpoBD(est, null, embebida = true, modifier = Modifier.height(380.dp))
    }
}

@Composable
fun CuerpoBD(est: EstadoBD, info: PaginaInfo?, embebida: Boolean, modifier: Modifier = Modifier) {
    val n = LocalNavegador.current
    val alcance = rememberCoroutineScope()
    val d = est.datos
    var buscando by remember { mutableStateOf(false) }
    var hoja by remember { mutableStateOf<String?>(null) }
    val abrir: (String) -> Unit = { id -> n.fila(est.pageId, id) }
    val nueva: (JsonObject?) -> Unit = { celdas ->
        alcance.launch { est.nuevaFila(celdas)?.let(abrir) }
    }
    if (info != null) Cabecera(info, info.puedeEditar && !info.locked, compacta = true)
    if (info != null && d?.collection?.description?.isNotBlank() == true) {
        Text(d.collection.description, fontSize = 14.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp))
    }
    if (d == null) {
        if (est.error != null) Vacio(if (est.error?.sinConexion == true) "Sin conexión y sin copia guardada de esta base de datos." else est.error?.message ?: "No se pudo cargar")
        else Esqueleto(5)
        return
    }
    val vista = d.view
    // Barra: vista, buscar, filtrar, ordenar, ajustes y nueva fila.
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (buscando) {
            Box(Modifier.weight(1f)) { Campo(est.q, { est.q = it }, placeholder = "Buscar en la base de datos…", autofoco = true) }
            BotonIcono("x", { est.q = ""; buscando = false })
        } else {
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).clickable { hoja = "vistas" }.padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icono(VISTAS.toMap()[vista?.type]?.second ?: "table", tam = 16.dp, color = C.texto)
                Text(vista?.name ?: "Vista", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp))
                Icono("chevron-down", tam = 14.dp, color = C.apagado, modifier = Modifier.padding(start = 4.dp))
            }
            BotonIcono("search", { buscando = true })
            val nFiltros = contarFiltros(vista?.cfg()?.arr("filters"))
            Box {
                BotonIcono("list-filter", { hoja = "filtros" }, color = if (nFiltros > 0) Marca else C.apagado)
                if (nFiltros > 0) Box(Modifier.align(Alignment.TopEnd).padding(6.dp).size(14.dp).clip(CircleShape).background(Marca), contentAlignment = Alignment.Center) {
                    Text("$nFiltros", fontSize = 9.sp, color = Color.White)
                }
            }
            BotonIcono("arrow-up-down", { hoja = "orden" }, color = if ((vista?.cfg()?.arr("sorts")?.size ?: 0) > 0) Marca else C.apagado)
            BotonIcono("sliders-horizontal", { hoja = "ajustes" })
            if (est.editable && vista?.type !in setOf("chart", "form")) {
                Row(
                    Modifier.padding(start = 4.dp).clip(RoundedCornerShape(6.dp)).background(Marca)
                        .combinedClickable(onClick = { nueva(null) }, onLongClick = { if (est.plantillas().isNotEmpty()) hoja = "plantillas" })
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Nueva", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    if (est.plantillas().isNotEmpty()) Box(Modifier.clickable { hoja = "plantillas" }) { Icono("chevron-down", tam = 14.dp, color = Color.White) }
                }
            }
        }
    }
    if (est.q.isNotBlank()) Text("${d.filas.size} de ${d.total} filas", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
    Box(modifier.fillMaxWidth()) {
        when (vista?.type) {
            "kanban" -> VistaKanban(est, abrir, nueva)
            "list" -> VistaLista(est, abrir)
            "gallery" -> VistaGaleria(est, abrir)
            "calendar" -> VistaCalendario(est, abrir, nueva)
            "timeline" -> VistaCronograma(est, abrir)
            "chart" -> VistaGrafica(est)
            "form" -> VistaFormulario(est)
            null -> Vacio("Esta base de datos no tiene vistas.")
            else -> VistaTabla(est, abrir, nueva, embebida)
        }
    }
    when (hoja) {
        "vistas" -> HojaVistas(est) { hoja = null }
        "filtros" -> HojaFiltros(est) { hoja = null }
        "orden" -> HojaOrden(est) { hoja = null }
        "ajustes" -> HojaAjustesVista(est) { hoja = null }
        "plantillas" -> HojaLista({ hoja = null }, "Nueva desde plantilla") {
            FilaMenu("Fila vacía", "plus") { hoja = null; alcance.launch { est.nuevaFila(JsonObject(emptyMap()))?.let(abrir) } }
            for (t in est.plantillas()) {
                FilaMenu((t["name"] as? JsonPrimitive)?.content ?: "Plantilla", "file-text") {
                    hoja = null
                    nueva(t["cells"] as? JsonObject ?: JsonObject(emptyMap()))
                }
            }
        }
    }
}

/** Nº de condiciones de un árbol de filtros (countFilters de la web). */
fun contarFiltros(nodos: kotlinx.serialization.json.JsonArray?): Int = nodos?.sumOf { e ->
    val o = e as? JsonObject ?: return@sumOf 0
    if ((o["type"] as? JsonPrimitive)?.content == "group") contarFiltros(o.arr("filters")) else 1
} ?: 0

/** Elegir, crear, renombrar, duplicar, reordenar y borrar vistas. */
@Composable
private fun HojaVistas(est: EstadoBD, onCerrar: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var opciones by remember { mutableStateOf<Vista?>(null) }
    var nueva by remember { mutableStateOf(false) }
    var renombrar by remember { mutableStateOf<Vista?>(null) }
    var borrar by remember { mutableStateOf<Vista?>(null) }
    val vistas = est.datos?.views ?: emptyList()
    val o = opciones
    if (o != null) {
        Hoja({ opciones = null }, o.name) {
            FilaMenu("Renombrar", "pencil") { renombrar = o; opciones = null }
            FilaMenu("Duplicar", "copy-plus") { est.duplicaVista(o.id); opciones = null; onCerrar() }
            val i = vistas.indexOf(o)
            if (i > 0) FilaMenu("Mover a la izquierda", "arrow-left") { est.mueveVista(o.id, vistas[i - 1].id); opciones = null }
            if (i < vistas.size - 1) FilaMenu("Mover a la derecha", "arrow-right") { est.mueveVista(o.id, vistas.getOrNull(i + 2)?.id); opciones = null }
            TituloSeccion("Mostrar como")
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((tipo, par) in VISTAS) {
                    Row(
                        Modifier.clip(RoundedCornerShape(8.dp)).background(if (o.type == tipo) C.activo else C.hover)
                            .clickable { est.tipoVista(o.id, tipo); opciones = null; onCerrar() }.padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icono(par.second, tam = 15.dp)
                        Text(par.first, fontSize = 13.sp, modifier = Modifier.padding(start = 4.dp))
                    }
                }
            }
            if (vistas.size > 1) {
                Separador(Modifier.padding(top = 8.dp))
                FilaMenu("Borrar vista", "trash-2", color = Color(0xFFD44C47)) { borrar = o; opciones = null }
            }
        }
    } else if (nueva) {
        HojaLista({ nueva = false }, "Nueva vista") {
            for ((tipo, par) in VISTAS) FilaMenu(par.first, par.second) {
                nueva = false
                onCerrar()
                alcance.launch { est.nuevaVista(tipo) }
            }
        }
    } else {
        HojaLista(onCerrar, "Vistas") {
            for (v in vistas) {
                FilaMenu(
                    v.name, VISTAS.toMap()[v.type]?.second ?: "table",
                    derecha = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (v.id == est.vista?.id) Icono("check", color = Marca)
                            if (est.editable) Box(Modifier.size(36.dp).clickable { opciones = v }, contentAlignment = Alignment.Center) { Icono("ellipsis", tam = 16.dp, color = C.apagado) }
                        }
                    },
                    onLongClick = { if (est.editable) opciones = v },
                ) { est.vistaId = v.id; onCerrar() }
            }
            if (est.editable) FilaMenu("Nueva vista", "plus") { nueva = true }
        }
    }
    renombrar?.let { v -> PedirTexto("Renombrar vista", v.name, onOk = { t -> if (t.isNotBlank()) est.renombraVista(v.id, t.trim()); renombrar = null }, onNo = { renombrar = null }) }
    borrar?.let { v -> Confirmar("¿Borrar la vista «${v.name}»?", "Las filas no se borran: solo esta forma de verlas.", onSi = { est.borraVista(v.id); borrar = null; onCerrar() }, onNo = { borrar = null }) }
}
