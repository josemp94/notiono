package com.monrealperez.notiono.bd

import android.content.Intent
import com.monrealperez.notiono.ui.comun.rememberAlcance
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.datos.Fila
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.num
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo as CampoTexto
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.PedirTexto
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Etiquetas
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Enlaces
import com.monrealperez.notiono.util.Fechas
import com.monrealperez.notiono.util.Imagenes
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

val COLORES_OPCION = listOf("gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red", "default")

/**
 * El editor de cada tipo de celda, como hoja inferior (así edita la app de Notion las
 * propiedades en el móvil). La casilla se marca sin hoja y los campos calculados no
 * se editan.
 */
@Composable
fun EditorCelda(est: EstadoBD, fila: Fila, campo: Campo, onCerrar: () -> Unit) {
    val v = est.celdas(fila)[campo.id]
    val pon: (JsonElement?) -> Unit = { est.ponCelda(fila.id, campo.id, it) }
    when (campo.type) {
        "text", "url", "email", "phone", "number" -> EditorTexto(campo, v, pon, onCerrar)
        "select", "status", "multiselect" -> EditorOpciones(est, campo, v, pon, onCerrar)
        "person" -> EditorPersonas(est, campo, v, pon, onCerrar)
        "date" -> EditorFecha(campo, v, pon, onCerrar)
        "files" -> EditorArchivos(campo, v, pon, onCerrar)
        "relation" -> EditorRelacion(est, fila, campo, v, pon, onCerrar)
        "location" -> EditorLugar(v, pon, onCerrar)
        else -> onCerrar()
    }
}

@Composable
private fun EditorTexto(campo: Campo, v: JsonElement?, pon: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val inicial = (v as? JsonPrimitive)?.content ?: ""
    var t by remember { mutableStateOf(inicial) }
    val teclado = when (campo.type) {
        "number" -> KeyboardOptions(keyboardType = KeyboardType.Decimal)
        "url" -> KeyboardOptions(keyboardType = KeyboardType.Uri)
        "email" -> KeyboardOptions(keyboardType = KeyboardType.Email)
        "phone" -> KeyboardOptions(keyboardType = KeyboardType.Phone)
        else -> KeyboardOptions.Default
    }
    fun guarda() {
        val limpio = t.trim()
        if (limpio == inicial.trim()) return onCerrar()
        if (campo.type == "number") {
            val n = limpio.replace(',', '.').toDoubleOrNull()
            pon(if (limpio.isEmpty()) null else if (n != null) JsonPrimitive(if (n % 1.0 == 0.0 && kotlin.math.abs(n) < 1e15) n.toLong() as Number else n) else JsonPrimitive(limpio))
        } else pon(if (limpio.isEmpty()) null else JsonPrimitive(if (campo.type == "text") t else limpio))
        onCerrar()
    }
    Hoja({ guarda() }, campo.name.ifBlank { "Sin nombre" }) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            CampoTexto(t, { t = it }, autofoco = true, unaLinea = campo.type != "text", teclado = teclado)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) {
                if (campo.type in setOf("url", "email", "phone") && t.isNotBlank()) {
                    TextButton({
                        when (campo.type) {
                            "url" -> Enlaces.abre(ctx, t.trim().let { if (it.contains("://")) it else "https://$it" })
                            "email" -> Enlaces.lanza(ctx, Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${t.trim()}")), "No hay ninguna app de correo")
                            else -> Enlaces.lanza(ctx, Intent(Intent.ACTION_DIAL, Uri.parse("tel:${t.trim()}")), "Este móvil no puede llamar")
                        }
                    }) { Text(when (campo.type) { "url" -> "Abrir"; "email" -> "Escribir"; else -> "Llamar" }, color = Marca) }
                }
                TextButton({ guarda() }) { Text("Hecho", color = Marca) }
            }
        }
    }
}

@Composable
private fun EditorOpciones(est: EstadoBD, campo: Campo, v: JsonElement?, pon: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    val multi = campo.type == "multiselect"
    val estado = campo.type == "status"
    var q by remember { mutableStateOf("") }
    var elegidos by remember { mutableStateOf(lista(v).mapNotNull { (it as? JsonPrimitive)?.content }.toSet()) }
    var editando by remember { mutableStateOf<Opcion?>(null) }
    // Las opciones de ahora: la hoja se abrió con el campo de entonces, y las que se acaban de
    // crear aún no han vuelto del servidor (si no, crear dos seguidas perdía la primera).
    val actual = est.campo(campo.id) ?: campo
    var creadas by remember { mutableStateOf(listOf<JsonObject>()) }
    var borradas by remember { mutableStateOf(setOf<String>()) }
    val delServidor = (actual.cfg()["options"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
    val opcionesJson = (delServidor + creadas.filter { c -> delServidor.none { it.str("id") == c.str("id") } }).filter { it.str("id") !in borradas }
    val conTodas = actual.copy(config = JsonObject(actual.cfg() + ("options" to JsonArray(opcionesJson))))
    val ops = conTodas.opciones()
    val filtradas = ops.filter { q.isBlank() || it.label.contains(q.trim(), true) }
    fun elige(id: String) {
        if (multi) {
            elegidos = if (id in elegidos) elegidos - id else elegidos + id
            pon(if (elegidos.isEmpty()) null else JsonArray(elegidos.map(::JsonPrimitive)))
        } else {
            pon(if (id in elegidos) null else JsonPrimitive(id))
            onCerrar()
        }
    }
    fun crea() {
        val label = q.trim()
        if (label.isEmpty()) return
        ops.firstOrNull { it.label.equals(label, true) }?.let { elige(it.id); q = ""; return }
        val id = "opt_" + java.util.UUID.randomUUID().toString().replace("-", "").take(7)
        val color = COLORES_OPCION[ops.size % COLORES_OPCION.size]
        val nueva = JsonObject(mapOf("id" to JsonPrimitive(id), "label" to JsonPrimitive(label), "color" to JsonPrimitive(color)) + (if (estado) mapOf("group" to JsonPrimitive("todo")) else emptyMap()))
        creadas = creadas + nueva
        est.configCampo(campo.id, JsonObject(actual.cfg() + ("options" to JsonArray(opcionesJson + nueva))))
        q = ""
        if (multi) {
            elegidos = elegidos + id
            pon(JsonArray(elegidos.map(::JsonPrimitive)))
        } else {
            pon(JsonPrimitive(id))
            onCerrar()
        }
    }
    HojaLista(onCerrar, campo.name.ifBlank { "Sin nombre" }) {
        Box(Modifier.padding(horizontal = 16.dp)) { CampoTexto(q, { q = it }, placeholder = if (est.editable) "Busca o crea una opción…" else "Buscar…") }
        val grupos = if (estado) listOf("todo" to "Por hacer", "doing" to "En curso", "done" to "Hecho") else listOf<Pair<String?, String?>>(null to null)
        for ((g, nombre) in grupos) {
            val enGrupo = filtradas.filter { !estado || (it.grupo ?: "todo") == g }
            if (nombre != null) TituloSeccion(nombre)
            for (o in enGrupo) {
                Row(
                    Modifier.fillMaxWidth().combinedClickable(onClick = { elige(o.id) }, onLongClick = { if (est.editable) editando = o })
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Pildora(o.label, o.color, Modifier.weight(1f, fill = false))
                    Box(Modifier.weight(1f))
                    if (o.id in elegidos) Icono("check", color = Marca)
                    if (est.editable) Box(Modifier.size(32.dp).clickable { editando = o }, contentAlignment = Alignment.Center) { Icono("ellipsis", tam = 16.dp, color = C.apagado) }
                }
            }
        }
        if (est.editable && q.isNotBlank() && ops.none { it.label.equals(q.trim(), true) }) {
            FilaMenu("Crear «${q.trim()}»", "plus") { crea() }
        }
        if (elegidos.isNotEmpty()) FilaMenu("Quitar", "x", color = C.apagado) { pon(null); onCerrar() }
    }
    editando?.let { o -> EditorOpcion(est, conTodas, o, onBorrada = { borradas = borradas + it }) { editando = null } }
}

/** Renombrar, recolorear, cambiar de grupo (Estado) o borrar una opción. */
@Composable
private fun EditorOpcion(est: EstadoBD, campo: Campo, o: Opcion, onBorrada: (String) -> Unit, onCerrar: () -> Unit) {
    var nombre by remember { mutableStateOf(o.label) }
    fun guarda(cambio: (JsonObject) -> JsonObject?) {
        val nuevas = ((campo.cfg()["options"] as? JsonArray) ?: JsonArray(emptyList())).mapNotNull { e ->
            val x = e as? JsonObject ?: return@mapNotNull e
            if (x.str("id") == o.id) cambio(x) else x
        }
        est.configCampo(campo.id, JsonObject(campo.cfg() + ("options" to JsonArray(nuevas))))
    }
    Hoja({ if (nombre.isNotBlank() && nombre != o.label) guarda { JsonObject(it + ("label" to JsonPrimitive(nombre.trim()))) }; onCerrar() }, "Opción") {
        Box(Modifier.padding(horizontal = 16.dp)) { CampoTexto(nombre, { nombre = it }) }
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (c in Etiquetas.nombres) {
                Box(
                    Modifier.size(30.dp).clip(CircleShape).background(Etiquetas.fondo(c, C.oscuro))
                        .border(2.dp, if ((o.color ?: "default") == c) Marca else Color.Transparent, CircleShape)
                        .clickable { guarda { JsonObject(it + ("color" to JsonPrimitive(c))) }; onCerrar() },
                )
            }
        }
        if (campo.type == "status") {
            for ((g, n) in listOf("todo" to "Por hacer", "doing" to "En curso", "done" to "Hecho")) {
                FilaMenu("Mover a «$n»", "circle-dashed", derecha = { if ((o.grupo ?: "todo") == g) Icono("check", color = Marca) }) {
                    guarda { JsonObject(it + ("group" to JsonPrimitive(g))) }; onCerrar()
                }
            }
        }
        Separador()
        FilaMenu("Borrar opción", "trash-2", color = Color(0xFFD44C47)) { guarda { null }; onBorrada(o.id); onCerrar() }
    }
}

@Composable
private fun EditorPersonas(est: EstadoBD, campo: Campo, v: JsonElement?, pon: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    var elegidos by remember { mutableStateOf(lista(v).mapNotNull { (it as? JsonPrimitive)?.content }.toSet()) }
    val una = (campo.cfg()["single"] as? JsonPrimitive)?.content == "true"
    HojaLista(onCerrar, campo.name.ifBlank { "Persona" }) {
        for (p in est.datos?.personas ?: emptyList()) {
            FilaMenu(p.nombre, null, derecha = { if (p.id in elegidos) Icono("check", color = Marca) }) {
                elegidos = if (p.id in elegidos) elegidos - p.id else if (una) setOf(p.id) else elegidos + p.id
                pon(if (elegidos.isEmpty()) null else JsonArray(elegidos.map(::JsonPrimitive)))
                if (una) onCerrar()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditorFecha(campo: Campo, v: JsonElement?, pon: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    val cfg = campo.cfg()
    val conHora = (cfg["time"] as? JsonPrimitive)?.content == "true"
    val rango = (cfg["range"] as? JsonPrimitive)?.content == "true"
    val actual = valorFecha(v)
    var inicio by remember { mutableStateOf(actual?.first) }
    var fin by remember { mutableStateOf(actual?.second) }
    var eligiendo by remember { mutableStateOf<String?>(null) }
    var hora by remember { mutableStateOf<String?>(null) }
    fun guarda() {
        val a = inicio
        pon(when {
            a.isNullOrBlank() -> null
            rango -> JsonObject(mapOf("start" to JsonPrimitive(a)) + (fin?.takeIf { it.isNotBlank() }?.let { mapOf("end" to JsonPrimitive(it)) } ?: emptyMap()))
            else -> JsonPrimitive(a)
        })
    }
    Hoja({ guarda(); onCerrar() }, campo.name.ifBlank { "Fecha" }) {
        FilaMenu("Inicio", "calendar", detalle = inicio?.let { Fechas.relativa(it) } ?: "Sin fecha") { eligiendo = "inicio" }
        if (conHora && inicio != null) FilaMenu("Hora de inicio", "clock", detalle = inicio!!.drop(11).take(5).ifBlank { "Sin hora" }) { hora = "inicio" }
        if (rango) {
            FilaMenu("Fin", "calendar", detalle = fin?.let { Fechas.relativa(it) } ?: "Sin fin") { eligiendo = "fin" }
            if (conHora && fin != null) FilaMenu("Hora de fin", "clock", detalle = fin!!.drop(11).take(5).ifBlank { "Sin hora" }) { hora = "fin" }
        }
        Row(Modifier.padding(horizontal = 8.dp)) {
            TextButton({ inicio = Fechas.hoy(); guarda() }) { Text("Hoy", color = Marca) }
            TextButton({ inicio = LocalDate.now().plusDays(1).toString(); guarda() }) { Text("Mañana", color = Marca) }
            TextButton({ inicio = null; fin = null; pon(null); onCerrar() }) { Text("Borrar", color = C.apagado) }
            TextButton({ guarda(); onCerrar() }) { Text("Hecho", color = Marca) }
        }
    }
    eligiendo?.let { cual ->
        val base = (if (cual == "inicio") inicio else fin)?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now()
        val st = rememberDatePickerState(initialSelectedDateMillis = base.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { eligiendo = null },
            confirmButton = {
                TextButton({
                    st.selectedDateMillis?.let { ms ->
                        val d = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString()
                        val viejo = if (cual == "inicio") inicio else fin
                        val conH = if (conHora && viejo != null && viejo.length > 10) d + viejo.drop(10) else d
                        if (cual == "inicio") inicio = conH else fin = conH
                        guarda()
                    }
                    eligiendo = null
                }) { Text("Aceptar", color = Marca) }
            },
            dismissButton = { TextButton({ eligiendo = null }) { Text("Cancelar", color = C.texto) } },
        ) { DatePicker(st) }
    }
    hora?.let { cual ->
        val viejo = (if (cual == "inicio") inicio else fin).orEmpty()
        val h = viejo.drop(11).take(2).toIntOrNull() ?: 9
        val m = viejo.drop(14).take(2).toIntOrNull() ?: 0
        val st = rememberTimePickerState(h, m, is24Hour = (campo.cfg()["hour12"] as? JsonPrimitive)?.content != "true")
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { hora = null },
            containerColor = C.fondo,
            text = { TimePicker(st) },
            confirmButton = {
                TextButton({
                    val dia = viejo.take(10).ifBlank { Fechas.hoy() }
                    val nuevo = "%sT%02d:%02d".format(dia, st.hour, st.minute)
                    if (cual == "inicio") inicio = nuevo else fin = nuevo
                    guarda()
                    hora = null
                }) { Text("Aceptar", color = Marca) }
            },
            dismissButton = { TextButton({ hora = null }) { Text("Cancelar", color = C.texto) } },
        )
    }
}

/** (inicio, fin) de una celda de fecha (cadena suelta o {start, end}). */
fun valorFecha(v: JsonElement?): Pair<String, String?>? = when (v) {
    is JsonPrimitive -> v.content.takeIf { v.isString && it.isNotBlank() }?.let { it to null }
    is JsonObject -> v.str("start")?.takeIf { it.isNotBlank() }?.let { it to v.str("end")?.ifBlank { null } }
    else -> null
}

@Composable
private fun EditorArchivos(campo: Campo, v: JsonElement?, pon: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberAlcance()
    var adjuntos by remember { mutableStateOf(lista(v).mapNotNull { it as? JsonObject }) }
    var renombrando by remember { mutableStateOf<JsonObject?>(null) }
    var subiendo by remember { mutableStateOf(false) }
    val elige = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        alcance.launch {
            subiendo = true
            try {
                val nuevos = uris.map { uri ->
                    val (bytes, nombre, mime) = Imagenes.leeArchivo(ctx, uri)
                    val r = s.api.subir(bytes, nombre, mime)
                    JsonObject(mapOf("id" to JsonPrimitive(r.id), "url" to JsonPrimitive(r.url), "name" to JsonPrimitive(r.name ?: nombre), "mime" to JsonPrimitive(r.mime ?: mime)))
                }
                adjuntos = adjuntos + nuevos
                pon(JsonArray(adjuntos))
            } catch (e: Exception) {
                Avisos.di(if (e is ErrorApi && e.sinConexion) "Sin conexión: no se puede subir ahora" else e.message ?: "No se pudo subir")
            } finally {
                subiendo = false
            }
        }
    }
    HojaLista(onCerrar, campo.name.ifBlank { "Archivos" }) {
        for (a in adjuntos) {
            FilaMenu(a.str("name") ?: "archivo", "paperclip", derecha = {
                Row {
                    Box(Modifier.size(36.dp).clickable { renombrando = a }, contentAlignment = Alignment.Center) { Icono("pencil", tam = 16.dp, color = C.apagado) }
                    Box(Modifier.size(36.dp).clickable {
                        adjuntos = adjuntos - a
                        pon(if (adjuntos.isEmpty()) null else JsonArray(adjuntos))
                    }, contentAlignment = Alignment.Center) { Icono("x", tam = 16.dp, color = C.apagado) }
                }
            }) { Enlaces.abre(ctx, s.api.absoluta(a.str("url").orEmpty())) }
        }
        FilaMenu(if (subiendo) "Subiendo…" else "Añadir archivos", "plus") { if (!subiendo) elige.launch(arrayOf("*/*")) }
    }
    renombrando?.let { a ->
        PedirTexto("Renombrar", a.str("name").orEmpty(), onOk = { t ->
            adjuntos = adjuntos.map { if (it === a) JsonObject(it + ("name" to JsonPrimitive(t))) else it }
            pon(JsonArray(adjuntos))
            renombrando = null
        }, onNo = { renombrando = null })
    }
}

@Composable
private fun EditorRelacion(est: EstadoBD, fila: Fila, campo: Campo, v: JsonElement?, pon: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val destino = campo.cfg().str("targetCollectionId")
    var opciones by remember { mutableStateOf<List<Pair<String, String>>?>(null) }
    var elegidos by remember { mutableStateOf(lista(v).mapNotNull { (it as? JsonPrimitive)?.content }.toSet()) }
    var q by remember { mutableStateOf("") }
    LaunchedEffect(destino) {
        opciones = runCatching {
            s.repo.consulta("db.relationOptions", objeto("collectionId" to destino)).comoLista.map { it.comoObjeto.let { o -> o.str("id")!! to (o.str("title") ?: "Sin título") } }
        }.getOrDefault(emptyList())
    }
    HojaLista(onCerrar, campo.name.ifBlank { "Relación" }) {
        Box(Modifier.padding(horizontal = 16.dp)) { CampoTexto(q, { q = it }, placeholder = "Buscar filas…") }
        val lista = (opciones ?: emptyList()).filter { (id, t) -> id != fila.id && (q.isBlank() || t.contains(q, true)) }.sortedByDescending { it.first in elegidos }
        if (opciones == null) Text("Cargando…", color = C.apagado, modifier = Modifier.padding(16.dp))
        for ((id, titulo) in lista.take(200)) {
            FilaMenu(titulo, "file-text", derecha = { if (id in elegidos) Icono("check", color = Marca) }) {
                elegidos = if (id in elegidos) elegidos - id else elegidos + id
                pon(if (elegidos.isEmpty()) null else JsonArray(elegidos.map(::JsonPrimitive)))
            }
        }
    }
}

@Composable
private fun EditorLugar(v: JsonElement?, pon: (JsonElement?) -> Unit, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    var q by remember { mutableStateOf((v as? JsonObject)?.str("nombre").orEmpty()) }
    var lugares by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    LaunchedEffect(q) {
        if (q.trim().length < 3) return@LaunchedEffect
        delay(400)
        lugares = runCatching { s.api.getJson("/api/geo?q=" + Uri.encode(q.trim())).comoObjeto.objs("lugares") }.getOrDefault(emptyList())
    }
    HojaLista(onCerrar, "Lugar") {
        Box(Modifier.padding(horizontal = 16.dp)) { CampoTexto(q, { q = it }, placeholder = "Busca una dirección…", autofoco = true) }
        for (l in lugares) FilaMenu(l.str("nombre").orEmpty(), "map-pin") { pon(l); onCerrar() }
        (v as? JsonObject)?.let { actual ->
            val lat = actual.num("lat")
            val lng = actual.num("lng")
            if (lat != null && lng != null) FilaMenu("Cómo llegar", "map-pin") {
                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:$lat,$lng?q=$lat,$lng(${Uri.encode(actual.str("nombre").orEmpty())})"))) }
            }
            FilaMenu("Quitar", "x", color = C.apagado) { pon(JsonNull); onCerrar() }
        }
    }
}
