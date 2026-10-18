package com.monrealperez.notiono.bd

import android.content.ClipData
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo as CampoTexto
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Etiquetas
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.ZoneOffset

// Operadores de filtro por tipo: los mismos (y con el mismo nombre) que `opsFor` de la
// web. El filtrado NO se hace aquí: la app guarda la condición en la vista y el servidor
// la aplica con el motor de la web.
private val VACIOS = listOf("is_empty" to "está vacío", "not_empty" to "no está vacío")
val SIN_VALOR = setOf(
    "is_empty", "not_empty", "today", "tomorrow", "yesterday", "this_week", "past_week", "next_week", "this_month",
    "past_month", "next_month", "this_year", "past_year", "next_year", "last_7_days", "next_7_days",
)

fun operadores(tipo: String): List<Pair<String, String>> = when (tipo) {
    "number", "id" -> listOf("eq" to "=", "neq" to "≠", "gt" to ">", "lt" to "<", "gte" to "≥", "lte" to "≤") + VACIOS
    "select", "status" -> listOf("is" to "es", "is_not" to "no es") + VACIOS
    "multiselect", "relation", "person", "created_by", "last_edited_by" -> listOf("contains" to "contiene", "not_contains" to "no contiene") + VACIOS
    "files" -> VACIOS
    "formula", "rollup" -> listOf("is" to "es", "is_not" to "no es", "contains" to "contiene", "not_contains" to "no contiene", "gt" to ">", "lt" to "<", "gte" to "≥", "lte" to "≤") + VACIOS
    "checkbox" -> listOf("is" to "es", "is_not" to "no es")
    "date", "created_time", "last_edited_time" -> listOf(
        "on" to "es el día", "before" to "es anterior a", "after" to "es posterior a", "on_or_before" to "en o antes de",
        "on_or_after" to "en o después de", "today" to "hoy", "tomorrow" to "mañana", "yesterday" to "ayer",
        "this_week" to "esta semana", "past_week" to "la semana pasada", "next_week" to "la próxima semana",
        "this_month" to "este mes", "past_month" to "el mes pasado", "next_month" to "el próximo mes",
        "this_year" to "este año", "past_year" to "el año pasado", "next_year" to "el próximo año",
    ) + VACIOS
    else -> listOf("is" to "es", "is_not" to "no es", "contains" to "contiene", "not_contains" to "no contiene", "starts_with" to "empieza por", "ends_with" to "termina por") + VACIOS
}

val ANCLAS = listOf(
    "today" to "Hoy", "tomorrow" to "Mañana", "yesterday" to "Ayer", "one_week_ago" to "Hace una semana",
    "one_week_from_now" to "Dentro de una semana", "one_month_ago" to "Hace un mes", "one_month_from_now" to "Dentro de un mes",
    "one_year_ago" to "Hace un año", "one_year_from_now" to "Dentro de un año",
)

private fun esGrupo(o: JsonObject) = o.str("type") == "group"

/** Editor del árbol de filtros: condiciones y grupos Y/O anidados (hasta 2 niveles, como la web). */
@Composable
fun HojaFiltros(est: EstadoBD, onCerrar: () -> Unit) {
    val cfg = est.vista?.cfg() ?: JsonObject(emptyMap())
    var nodos by remember { mutableStateOf((cfg.arr("filters") ?: JsonArray(emptyList())).mapNotNull { it as? JsonObject }) }
    var raizOp by remember { mutableStateOf(cfg.str("filterOp") ?: "and") }
    var eligiendoCampo by remember { mutableStateOf<((Campo) -> Unit)?>(null) }
    fun guarda(n: List<JsonObject> = nodos, op: String = raizOp) {
        nodos = n
        raizOp = op
        est.ponConfig(mapOf("filters" to JsonArray(n), "filterOp" to JsonPrimitive(op)))
    }
    fun condicion(c: Campo) = JsonObject(mapOf("fieldId" to JsonPrimitive(c.id), "op" to JsonPrimitive(operadores(c.type).first().first), "value" to JsonPrimitive("")))
    HojaLista(onCerrar, "Filtros") {
        if (nodos.isEmpty()) Text("Sin filtros: se ven todas las filas.", fontSize = 14.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
        nodos.forEachIndexed { i, nodo ->
            if (i > 0) ConectorOp(raizOp, i == 1) { guarda(op = it) }
            if (esGrupo(nodo)) {
                val hijos = nodo.arr("filters")?.mapNotNull { it as? JsonObject } ?: emptyList()
                val op = nodo.str("op") ?: "and"
                Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp)).padding(6.dp)) {
                    Text("Grupo", fontSize = 12.sp, color = C.apagado)
                    hijos.forEachIndexed { j, h ->
                        if (j > 0) ConectorOp(op, j == 1) { nuevo -> guarda(nodos.toMutableList().also { it[i] = JsonObject(nodo + ("op" to JsonPrimitive(nuevo))) }) }
                        FilaCondicion(est, h, onCambio = { nuevo ->
                            val hs = hijos.toMutableList().also { it[j] = nuevo }
                            guarda(nodos.toMutableList().also { it[i] = JsonObject(nodo + ("filters" to JsonArray(hs))) })
                        }, onQuitar = {
                            val hs = hijos.toMutableList().also { it.removeAt(j) }
                            guarda(nodos.toMutableList().also { if (hs.isEmpty()) it.removeAt(i) else it[i] = JsonObject(nodo + ("filters" to JsonArray(hs))) })
                        })
                    }
                    Text("+ Añadir condición", fontSize = 13.sp, color = C.apagado, modifier = Modifier.clickable {
                        eligiendoCampo = { c ->
                            guarda(nodos.toMutableList().also { it[i] = JsonObject(nodo + ("filters" to JsonArray(hijos + condicion(c)))) })
                        }
                    }.padding(6.dp))
                }
            } else FilaCondicion(est, nodo, onCambio = { nuevo -> guarda(nodos.toMutableList().also { it[i] = nuevo }) }, onQuitar = { guarda(nodos.toMutableList().also { it.removeAt(i) }) })
        }
        Separador(Modifier.padding(top = 8.dp))
        FilaMenu("Añadir filtro", "plus") { eligiendoCampo = { c -> guarda(nodos + condicion(c)) } }
        FilaMenu("Añadir grupo de filtros", "plus") {
            eligiendoCampo = { c -> guarda(nodos + JsonObject(mapOf("type" to JsonPrimitive("group"), "op" to JsonPrimitive("or"), "filters" to JsonArray(listOf(condicion(c)))))) }
        }
        if (nodos.isNotEmpty()) FilaMenu("Quitar todos", "x", color = C.apagado) { guarda(emptyList()) }
    }
    eligiendoCampo?.let { alElegir ->
        HojaLista({ eligiendoCampo = null }, "Filtrar por") {
            for (c in est.campos.filter { it.type != "button" }) FilaMenu(c.name.ifBlank { "Sin nombre" }, iconoCampo(c.type)) { alElegir(c); eligiendoCampo = null }
        }
    }
}

@Composable
private fun ConectorOp(op: String, editable: Boolean, onCambio: (String) -> Unit) {
    Text(
        if (op == "or") "o" else "y", fontSize = 13.sp, color = if (editable) Marca else C.apagado,
        modifier = Modifier.padding(start = 20.dp).clickable(enabled = editable) { onCambio(if (op == "or") "and" else "or") }.padding(4.dp),
    )
}

/** Una condición: campo, operador y valor (con el editor del tipo de campo). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilaCondicion(est: EstadoBD, nodo: JsonObject, onCambio: (JsonObject) -> Unit, onQuitar: () -> Unit) {
    val campo = est.campo(nodo.str("fieldId"))
    val op = nodo.str("op") ?: "is"
    var eligeOp by remember { mutableStateOf(false) }
    var eligeValor by remember { mutableStateOf(false) }
    var texto by remember(nodo) { mutableStateOf((nodo["value"] as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()) }
    val ops = operadores(campo?.type ?: "text")
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(campo?.name ?: "(columna borrada)", fontSize = 14.sp, color = C.texto, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(ops.toMap()[op] ?: op, fontSize = 14.sp, color = Marca, modifier = Modifier.clickable { eligeOp = true }.padding(6.dp))
            Box(Modifier.size(32.dp).clickable(onClick = onQuitar), contentAlignment = Alignment.Center) { Icono("x", tam = 16.dp, color = C.apagado) }
        }
        if (campo != null && op !in SIN_VALOR) {
            when (campo.type) {
                "select", "status", "multiselect", "person", "created_by", "last_edited_by", "checkbox", "date", "created_time", "last_edited_time", "relation" ->
                    Text(etiquetaValor(est, campo, nodo["value"]), fontSize = 14.sp, color = C.texto,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(C.hover).clickable { eligeValor = true }.padding(10.dp))
                else -> {
                    CampoTexto(texto, { texto = it }, placeholder = "Valor")
                    LaunchedEffect(texto) {
                        kotlinx.coroutines.delay(500)
                        if (texto != ((nodo["value"] as? JsonPrimitive)?.content ?: "")) onCambio(JsonObject(nodo + ("value" to JsonPrimitive(texto))))
                    }
                }
            }
        }
    }
    if (eligeOp) HojaLista({ eligeOp = false }, "Condición") {
        for ((k, n) in ops) FilaMenu(n, null, derecha = { if (k == op) Icono("check", color = Marca) }) {
            onCambio(JsonObject(nodo + ("op" to JsonPrimitive(k))))
            eligeOp = false
        }
    }
    if (eligeValor && campo != null) {
        val pon: (JsonElement) -> Unit = { v -> onCambio(JsonObject(nodo + ("value" to v))); eligeValor = false }
        when (campo.type) {
            "date", "created_time", "last_edited_time" -> {
                var calendario by remember { mutableStateOf(false) }
                if (!calendario) HojaLista({ eligeValor = false }, "Fecha") {
                    FilaMenu("Elegir un día…", "calendar") { calendario = true }
                    for ((k, n) in ANCLAS) FilaMenu(n, "calendar-days") { pon(JsonObject(mapOf("rel" to JsonPrimitive(k)))) }
                } else {
                    val st = rememberDatePickerState()
                    DatePickerDialog({ eligeValor = false }, confirmButton = {
                        TextButton({ st.selectedDateMillis?.let { pon(JsonPrimitive(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString())) } ?: run { eligeValor = false } }) { Text("Aceptar", color = Marca) }
                    }) { DatePicker(st) }
                }
            }
            "checkbox" -> Hoja({ eligeValor = false }, "Valor") {
                FilaMenu("Marcada", "square-check") { pon(JsonPrimitive(true)) }
                FilaMenu("Sin marcar", "square") { pon(JsonPrimitive(false)) }
            }
            "person", "created_by", "last_edited_by" -> HojaLista({ eligeValor = false }, "Persona") {
                FilaMenu("Yo", "user") { pon(JsonPrimitive("me")) }
                for (p in est.datos?.personas ?: emptyList()) FilaMenu(p.nombre, "circle-user") { pon(JsonPrimitive(p.id)) }
            }
            "relation" -> {
                val s = Servicios.de(LocalContext.current)
                var opciones by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
                LaunchedEffect(campo.id) {
                    opciones = runCatching {
                        s.repo.consulta("db.relationOptions", objeto("collectionId" to campo.cfg().str("targetCollectionId"))).comoLista.map { it.comoObjeto.let { o -> o.str("id")!! to (o.str("title") ?: "") } }
                    }.getOrDefault(emptyList())
                }
                HojaLista({ eligeValor = false }, "Fila") { for ((id, t) in opciones) FilaMenu(t, "file-text") { pon(JsonPrimitive(id)) } }
            }
            else -> HojaLista({ eligeValor = false }, "Valor") {
                if (campo.type == "status") {
                    for ((g, n) in listOf("todo" to "Por hacer", "doing" to "En curso", "done" to "Hecho")) FilaMenu("Grupo: $n", "circle-dashed") { pon(JsonPrimitive("group:$g")) }
                    Separador()
                }
                for (o in campo.opciones()) {
                    Row(Modifier.fillMaxWidth().clickable { pon(JsonPrimitive(o.id)) }.padding(horizontal = 16.dp, vertical = 10.dp)) { Pildora(o.label, o.color) }
                }
            }
        }
    }
}

private fun etiquetaValor(est: EstadoBD, campo: Campo, v: JsonElement?): String {
    if (v == null || v is JsonNull || (v is JsonPrimitive && v.content.isEmpty())) return "Elegir…"
    (v as? JsonObject)?.str("rel")?.let { r -> return ANCLAS.toMap()[r] ?: r }
    val s = (v as? JsonPrimitive)?.content ?: return "Elegir…"
    return when (campo.type) {
        "checkbox" -> if (s == "true") "Marcada" else "Sin marcar"
        "person", "created_by", "last_edited_by" -> if (s == "me") "Yo" else est.nombrePersona(s) ?: s
        "date", "created_time", "last_edited_time" -> Fechas.largo(s)
        "status" -> if (s.startsWith("group:")) "Grupo: " + mapOf("todo" to "Por hacer", "doing" to "En curso", "done" to "Hecho")[s.removePrefix("group:")] else campo.opciones().firstOrNull { it.id == s }?.label ?: s
        "select", "multiselect" -> campo.opciones().firstOrNull { it.id == s }?.label ?: s
        else -> s
    }
}

/** Orden de la vista: varios criterios, en orden. */
@Composable
fun HojaOrden(est: EstadoBD, onCerrar: () -> Unit) {
    var criterios by remember { mutableStateOf((est.vista?.cfg()?.arr("sorts") ?: JsonArray(emptyList())).mapNotNull { it as? JsonObject }) }
    var eligiendo by remember { mutableStateOf(false) }
    fun guarda(n: List<JsonObject>) {
        criterios = n
        est.ponConfig(mapOf("sorts" to JsonArray(n)))
    }
    HojaLista(onCerrar, "Ordenar") {
        if (criterios.isEmpty()) Text("Sin orden: las filas van como están.", fontSize = 14.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
        criterios.forEachIndexed { i, s ->
            val c = est.campo(s.str("fieldId"))
            val asc = s.str("dir") != "desc"
            FilaMenu(c?.name ?: "(columna borrada)", iconoCampo(c?.type ?: "text"), derecha = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (asc) "Ascendente" else "Descendente", color = Marca, fontSize = 13.sp, modifier = Modifier.clickable {
                        guarda(criterios.toMutableList().also { it[i] = JsonObject(s + ("dir" to JsonPrimitive(if (asc) "desc" else "asc"))) })
                    }.padding(6.dp))
                    Box(Modifier.size(32.dp).clickable { guarda(criterios.toMutableList().also { it.removeAt(i) }) }, contentAlignment = Alignment.Center) { Icono("x", tam = 16.dp, color = C.apagado) }
                }
            }) {}
        }
        FilaMenu("Añadir criterio", "plus") { eligiendo = true }
        if (criterios.isNotEmpty()) FilaMenu("Quitar orden", "x", color = C.apagado) { guarda(emptyList()) }
    }
    if (eligiendo) HojaLista({ eligiendo = false }, "Ordenar por") {
        for (c in est.campos.filter { it.type != "button" }) FilaMenu(c.name.ifBlank { "Sin nombre" }, iconoCampo(c.type)) {
            guarda(criterios + JsonObject(mapOf("fieldId" to JsonPrimitive(c.id), "dir" to JsonPrimitive("asc"))))
            eligiendo = false
        }
    }
}

/** Ajustes de la vista: agrupar, propiedades, color, lo propio de cada tipo y la papelera de filas. */
@Composable
fun HojaAjustesVista(est: EstadoBD, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val alcance = rememberAlcance()
    val v = est.vista ?: return onCerrar()
    val cfg = v.cfg()
    var sub by remember { mutableStateOf<String?>(null) }
    var camposPara by remember { mutableStateOf(emptyList<Campo>()) }
    var ningunoPermitido by remember { mutableStateOf(true) }
    fun elegirCampo(titulo: String, clave: String, filtro: (Campo) -> Boolean, conNinguno: Boolean = true) {
        sub = "$clave|$titulo"
        camposPara = est.campos.filter(filtro)
        ningunoPermitido = conNinguno
    }
    val s = sub
    if (s != null && s.contains("|")) {
        val (clave, titulo) = s.split("|", limit = 2)
        HojaLista({ sub = null }, titulo) {
            if (ningunoPermitido) FilaMenu("Ninguno", "x") { est.ponConfig(mapOf(clave to null)); sub = null }
            for (c in camposPara) FilaMenu(c.name.ifBlank { "Sin nombre" }, iconoCampo(c.type), derecha = { if (cfg.str(clave) == c.id) Icono("check", color = Marca) }) {
                est.ponConfig(mapOf(clave to JsonPrimitive(c.id))); sub = null
            }
        }
        return
    }
    when (s) {
        "propiedades" -> {
            val ocultos = (cfg.arr("hiddenFields")?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList()).toMutableSet()
            HojaLista({ sub = null }, "Propiedades visibles") {
                for (c in est.campos) Interruptor(c.name.ifBlank { "Sin nombre" }, c.id !in ocultos) { visible ->
                    if (visible) ocultos.remove(c.id) else ocultos.add(c.id)
                    est.ponConfig(mapOf("hiddenFields" to JsonArray(ocultos.map(::JsonPrimitive))))
                }
            }
            return
        }
        "papelera" -> { PapeleraFilas(est) { sub = null }; return }
        "reglas" -> { ReglasColor(est) { sub = null }; return }
    }
    HojaLista(onCerrar, v.name) {
        val agrupables = { c: Campo -> c.type !in setOf("button", "files", "rollup", "formula", "relation") }
        when (v.type) {
            "table", "list", "gallery" -> {
                FilaMenu("Agrupar por", "group", detalle = est.campo(cfg.str("groupByFieldId"))?.name ?: "Nada") { elegirCampo("Agrupar por", "groupByFieldId", agrupables) }
                if (v.type == "table" && cfg.str("groupByFieldId") != null) FilaMenu("Subagrupar por", "group", detalle = est.campo(cfg.str("subGroupByFieldId"))?.name ?: "Nada") { elegirCampo("Subagrupar por", "subGroupByFieldId", agrupables) }
            }
            "kanban" -> {
                val kan = { c: Campo -> c.type in setOf("select", "status", "person", "checkbox") }
                FilaMenu("Columnas por", "columns-3", detalle = est.campo(cfg.str("groupByFieldId"))?.name ?: "—") { elegirCampo("Columnas por", "groupByFieldId", kan, false) }
                FilaMenu("Carriles por", "rows-3", detalle = est.campo(cfg.str("subGroupByFieldId"))?.name ?: "Nada") { elegirCampo("Carriles por", "subGroupByFieldId", kan) }
                Interruptor("Sumar en cada columna", cfg.bool("kanbanSum")) { est.ponConfig(mapOf("kanbanSum" to JsonPrimitive(it))) }
            }
            "calendar" -> {
                FilaMenu("Fecha", "calendar", detalle = est.campo(cfg.str("dateFieldId"))?.name ?: "—") { elegirCampo("Fecha del calendario", "dateFieldId", { it.type in setOf("date", "created_time", "last_edited_time") }, false) }
                Interruptor("Vista de semana", cfg.str("calMode") == "semana") { est.ponConfig(mapOf("calMode" to JsonPrimitive(if (it) "semana" else "mes"))) }
            }
            "timeline" -> {
                FilaMenu("Inicio", "calendar", detalle = est.campo(cfg.str("dateFieldId"))?.name ?: "—") { elegirCampo("Fecha de inicio", "dateFieldId", { it.type == "date" }, false) }
                FilaMenu("Fin", "calendar", detalle = est.campo(cfg.str("endFieldId"))?.name ?: "El final del rango") { elegirCampo("Fecha de fin", "endFieldId", { it.type == "date" }) }
            }
        }
        if (v.type in setOf("kanban", "gallery")) {
            FilaMenu("Vista previa de la tarjeta", "image", detalle = est.campo(cfg.str("cardPreview"))?.name ?: "Ninguna") { elegirCampo("Vista previa", "cardPreview", { it.type == "files" }) }
            TituloSeccion("Tamaño de tarjeta")
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((k, n) in listOf("small" to "Pequeña", "medium" to "Mediana", "large" to "Grande")) {
                    Text(n, fontSize = 13.sp, color = if ((cfg.str("cardSize") ?: "medium") == k) Marca else C.texto,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(C.hover).clickable { est.ponConfig(mapOf("cardSize" to JsonPrimitive(k))) }.padding(horizontal = 10.dp, vertical = 6.dp))
                }
            }
            if (v.type == "gallery") Interruptor("Ajustar la imagen (sin recortar)", cfg.str("imageFit") == "contain") { est.ponConfig(mapOf("imageFit" to JsonPrimitive(if (it) "contain" else "cover"))) }
        }
        if (v.type == "form") FormularioAjustes(est)
        if (v.type == "chart") GraficaAjustes(est)
        if (v.type != "chart" && v.type != "form") {
            FilaMenu("Propiedades visibles", "eye") { sub = "propiedades" }
            FilaMenu("Color de fila por", "palette", detalle = est.campo(cfg.str("rowColorFieldId"))?.name ?: "Nada") { elegirCampo("Color por", "rowColorFieldId", { it.type in setOf("select", "status", "multiselect") }) }
            FilaMenu("Reglas de color", "palette", detalle = "${cfg.arr("colorRules")?.size ?: 0} reglas") { sub = "reglas" }
        }
        if (v.type == "table") Interruptor("Envolver texto", cfg.bool("wrapText")) { est.ponConfig(mapOf("wrapText" to JsonPrimitive(it))) }
        Separador(Modifier.padding(vertical = 4.dp))
        FilaMenu("Copiar enlace a la vista", "link") {
            ctx.getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Notiono", "${BuildConfig.BASE_URL}/p/${est.pageId}?v=${v.id}"))
            Avisos.di("Enlace copiado")
            onCerrar()
        }
        FilaMenu("Exportar a CSV", "file-down") { est.lanza { com.monrealperez.notiono.util.Archivos.exportaCsv(ctx, est.pageId) }; onCerrar() }
        FilaMenu("Papelera de filas", "trash-2") { sub = "papelera" }
    }
}

/** Reglas de color («si vence antes de hoy, en rojo»): una condición por regla. */
@Composable
private fun ReglasColor(est: EstadoBD, onCerrar: () -> Unit) {
    var reglas by remember { mutableStateOf((est.vista?.cfg()?.arr("colorRules") ?: JsonArray(emptyList())).mapNotNull { it as? JsonObject }) }
    var editando by remember { mutableStateOf<Int?>(null) }
    fun guarda(n: List<JsonObject>) { reglas = n; est.ponConfig(mapOf("colorRules" to JsonArray(n))) }
    HojaLista(onCerrar, "Reglas de color") {
        Text("La primera que cumple una fila le pone su color.", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
        reglas.forEachIndexed { i, r ->
            val conds = r.arr("filters")?.mapNotNull { it as? JsonObject } ?: emptyList()
            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp)).padding(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(20.dp).clip(RoundedCornerShape(4.dp)).background(Etiquetas.fondo(r.str("color"), C.oscuro)).clickable { editando = i })
                    Text("Color", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(start = 6.dp).weight(1f))
                    Box(Modifier.size(32.dp).clickable { guarda(reglas.toMutableList().also { it.removeAt(i) }) }, contentAlignment = Alignment.Center) { Icono("trash-2", tam = 15.dp, color = C.apagado) }
                }
                conds.forEachIndexed { j, c ->
                    FilaCondicion(est, c, onCambio = { nuevo ->
                        guarda(reglas.toMutableList().also { it[i] = JsonObject(r + ("filters" to JsonArray(conds.toMutableList().also { l -> l[j] = nuevo }))) })
                    }, onQuitar = {
                        guarda(reglas.toMutableList().also { it[i] = JsonObject(r + ("filters" to JsonArray(conds.toMutableList().also { l -> l.removeAt(j) }))) })
                    })
                }
                val primero = est.campos.firstOrNull()
                if (conds.isEmpty() && primero != null) Text("+ Condición", fontSize = 13.sp, color = C.apagado, modifier = Modifier.clickable {
                    val cond = JsonObject(mapOf("fieldId" to JsonPrimitive(primero.id), "op" to JsonPrimitive(operadores(primero.type).first().first), "value" to JsonPrimitive("")))
                    guarda(reglas.toMutableList().also { it[i] = JsonObject(r + ("filters" to JsonArray(listOf(cond)))) })
                }.padding(6.dp))
            }
        }
        FilaMenu("Añadir regla", "plus") {
            guarda(reglas + JsonObject(mapOf("id" to JsonPrimitive("rule_" + java.util.UUID.randomUUID().toString().take(7)), "color" to JsonPrimitive("red"), "filters" to JsonArray(emptyList()))))
        }
    }
    editando?.let { i ->
        HojaLista({ editando = null }, "Color") {
            for (c in Etiquetas.nombres) Row(Modifier.fillMaxWidth().clickable {
                guarda(reglas.toMutableList().also { it[i] = JsonObject(it[i] + ("color" to JsonPrimitive(c))) }); editando = null
            }.padding(horizontal = 16.dp, vertical = 10.dp)) { Pildora(Etiquetas.etiquetas[c] ?: c, c) }
        }
    }
}

/** La papelera de filas de esta BD: restaurar o borrar para siempre (se purga a los 30 días). */
@Composable
private fun PapeleraFilas(est: EstadoBD, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val alcance = rememberAlcance()
    var filas by remember { mutableStateOf<List<JsonObject>?>(null) }
    val col = est.datos?.collection?.id
    suspend fun carga() {
        filas = runCatching { s.repo.consulta("db.archivedRecords", objeto("collectionId" to col), cachear = false).comoLista.map { it.comoObjeto } }.getOrDefault(emptyList())
    }
    LaunchedEffect(col) {
        runCatching { s.repo.mutacion("db.purgeExpiredRecords", objeto("collectionId" to col), encolable = false) }
        carga()
    }
    HojaLista(onCerrar, "Papelera de filas") {
        if (filas?.isEmpty() == true) Text("No hay filas borradas.", color = C.apagado, modifier = Modifier.padding(16.dp))
        for (f in filas ?: emptyList()) {
            FilaMenu(f.str("title").orEmpty(), "file-text", detalle = "Borrada " + Fechas.haceCuanto(f.str("archivedAt")), derecha = {
                Row {
                    Box(Modifier.size(36.dp).clickable { alcance.launch { s.repo.mutacion("db.restoreRecord", objeto("id" to f.str("id")), etiquetas = listOf("vista:${est.pageId}")); carga() } }, contentAlignment = Alignment.Center) { Icono("undo-2", tam = 16.dp, color = Marca) }
                    Box(Modifier.size(36.dp).clickable { alcance.launch { runCatching { s.repo.mutacion("db.purgeRecord", objeto("id" to f.str("id")), encolable = false) }; carga() } }, contentAlignment = Alignment.Center) { Icono("trash-2", tam = 16.dp, color = Color(0xFFD44C47)) }
                }
            }) {}
        }
    }
}
