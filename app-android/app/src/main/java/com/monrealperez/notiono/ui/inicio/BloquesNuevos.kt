package com.monrealperez.notiono.ui.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import com.monrealperez.notiono.ui.comun.Separador
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.bd.CajaCasilla
import com.monrealperez.notiono.editor.Inline
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.rememberAlcance
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.pagina.AtajosRecordar
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.ZoneOffset

/** Acciones rápidas: los botones del widget (Página, Lista de casillas, Tarea, Foto), como en la web. */
@Composable
fun AccionesRapidas(config: ConfigInicio, guarda: (ConfigInicio) -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    var tarea by remember { mutableStateOf(false) }
    @Composable
    fun Boton(texto: String, icono: String, modifier: Modifier, onClick: () -> Unit) {
        Column(
            modifier.clickable(onClick = onClick).padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icono(icono, tam = 22.dp, color = C.texto)
            Text(texto, fontSize = 13.sp, color = C.texto, modifier = Modifier.padding(top = 4.dp))
        }
    }
    // En una sola tarjeta, como las demás del Inicio.
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).tarjetaInicio().height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
        Boton("Página", "file-plus", Modifier.weight(1f)) { n.nuevaPagina(null, ubicar = true) }
        Divisor()
        Boton("Lista", "list-todo", Modifier.weight(1f)) {
            alcance.launch {
                try {
                    val id = s.repo.mutacion("pages.create", objeto("title" to ""), encolable = false, etiquetas = listOf("arbol"))?.comoObjeto?.str("id")!!
                    val casilla = objeto("id" to java.util.UUID.randomUUID().toString(), "type" to "checkListItem", "props" to objeto("checked" to false), "content" to emptyList<JsonElement>(), "children" to emptyList<JsonElement>())
                    s.repo.mutacion("app.aplicar", objeto("id" to id, "ops" to listOf(objeto("op" to "upsert", "block" to casilla))), encolable = false)
                    n.pagina(id, nueva = true)
                } catch (e: ErrorApi) {
                    Avisos.di(if (e.sinConexion) "Sin conexión: no se puede crear la lista" else e.message ?: "No se pudo crear")
                }
            }
        }
        Divisor()
        Boton("Tarea", "circle-check", Modifier.weight(1f)) { tarea = true }
        Divisor()
        Boton("Foto", "camera", Modifier.weight(1f)) { n.foto() }
    }
    if (tarea) DialogoTarea(config, guarda) { tarea = false }
}

@Composable
private fun Divisor() = Box(Modifier.fillMaxHeight().width(1.dp).background(C.borde))

/** Elegir la BD de las tareas rápidas (una vez; se cambia en Mis tareas). */
@Composable
fun HojaElegirBd(onCerrar: () -> Unit, onElegir: (String) -> Unit) {
    val bds = rememberConsulta("db.listDatabases", etiquetas = setOf("arbol")).datos?.comoLista?.map { it.comoObjeto }
    HojaLista(onCerrar, "¿Dónde van tus tareas?") {
        if (bds != null && bds.isEmpty()) Text("Aún no tienes ninguna base de datos. Crea una (la plantilla «Tareas» va bien) y vuelve.", color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(16.dp))
        for (b in bds.orEmpty()) FilaMenu(b.str("title")?.ifBlank { null } ?: "Sin título", "database") { onElegir(b.str("pageId")!!) }
    }
}

/**
 * Añadir rápido (Acciones rápidas y Mis tareas): título y, si se quiere, fecha, en la BD de
 * tareas elegida (`inicio.nuevaTarea`, asignada a mí). Sin BD elegida, primero se elige.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DialogoTarea(config: ConfigInicio, guarda: (ConfigInicio) -> Unit, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    var bd by remember { mutableStateOf(config.tareas) }
    var titulo by remember { mutableStateOf("") }
    var fecha by remember { mutableStateOf<String?>(null) }
    var eligeFecha by remember { mutableStateOf(false) }
    if (bd == null) {
        HojaElegirBd(onCerrar) { id -> bd = id; guarda(config.copy(tareas = id)) }
        return
    }
    fun anade() {
        val t = titulo.trim()
        if (t.isEmpty()) return
        onCerrar()
        // En el ámbito de la app: al cerrarse la hoja se cancela el suyo y la lista no se enteraba.
        s.alcance.launch {
            try {
                val r = s.repo.mutacion("inicio.nuevaTarea", objeto("titulo" to t, "fecha" to fecha), etiquetas = listOf("tareas"))
                Avisos.di("Tarea añadida")
                r?.comoObjeto?.str("pageId")?.let { s.repo.avisa("vista:$it") }
            } catch (e: ErrorApi) {
                Avisos.di(e.message ?: "No se pudo añadir")
            }
        }
    }
    // Una hoja (como «Nuevo espacio»): con el teclado abierto se ve entera.
    com.monrealperez.notiono.ui.comun.Hoja(onCerrar, "Nueva tarea") {
        Campo(titulo, { titulo = it.take(500) }, Modifier.padding(horizontal = 16.dp), placeholder = "¿Qué hay que hacer?", autofoco = true)
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton({ eligeFecha = true }) {
                Icono("calendar", tam = 16.dp, color = C.apagado)
                Text(fecha?.let { Fechas.relativa(it) } ?: "Sin fecha", color = C.apagado, modifier = Modifier.padding(start = 6.dp))
            }
            if (fecha != null) TextButton({ fecha = null }) { Text("Quitar", color = C.apagado) }
            Box(Modifier.weight(1f))
            TextButton(::anade, enabled = titulo.isNotBlank()) { Text("Añadir", color = Marca, fontWeight = FontWeight.SemiBold) }
        }
    }
    if (eligeFecha) {
        val st = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { eligeFecha = false },
            confirmButton = {
                TextButton({
                    fecha = st.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }
                    eligeFecha = false
                }) { Text("Aceptar", color = Marca) }
            },
            dismissButton = { TextButton({ eligeFecha = false }) { Text("Cancelar", color = C.texto) } },
        ) { DatePicker(st) }
    }
}

/**
 * Bloc de notas rápido: se guarda solo al dejar de escribir (`inicio.guardarBloc`, con la
 * cola si no hay red) y «Convertir en página» lo pasa a una página nueva y lo vacía.
 */
@Composable
fun BlocNotas(inicial: String) {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    // Lo guardado manda al llegar del servidor (otra pestaña, la web); lo escrito aquí se manda.
    var texto by remember(inicial) { mutableStateOf(inicial) }
    var guardado by remember(inicial) { mutableStateOf(inicial) }
    LaunchedEffect(texto) {
        if (texto == guardado) return@LaunchedEffect
        delay(800)
        runCatching { s.repo.mutacion("inicio.guardarBloc", objeto("texto" to texto)) }
        guardado = texto
    }
    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().tarjetaInicio()) {
        androidx.compose.material3.OutlinedTextField(
            texto, { texto = it.take(MAX_BLOC) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp).semantics { contentDescription = "Bloc de notas rápido" },
            placeholder = { Text("Apunta algo rápido… (- [ ] para casillas)", color = C.apagado) },
            colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                focusedBorderColor = androidx.compose.ui.graphics.Color.Transparent, unfocusedBorderColor = androidx.compose.ui.graphics.Color.Transparent, cursorColor = com.monrealperez.notiono.ui.tema.Marca,
            ),
        )
        Separador()
        Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (texto != guardado) "Guardando…" else if (texto.isNotEmpty()) "Guardado" else "", fontSize = 12.sp, color = C.apagado, modifier = Modifier.weight(1f))
            TextButton({
                alcance.launch {
                    try {
                        s.repo.mutacion("inicio.guardarBloc", objeto("texto" to texto), encolable = false)
                        guardado = texto
                        val id = s.repo.mutacion("inicio.blocAPagina", encolable = false, etiquetas = listOf("arbol", "inicio"))?.comoObjeto?.str("id")
                        texto = ""
                        guardado = ""
                        id?.let { n.pagina(it, nueva = true) }
                    } catch (e: ErrorApi) {
                        Avisos.di(if (e.sinConexion) "Sin conexión: la página se crea en el servidor" else e.message ?: "No se pudo")
                    }
                }
            }, enabled = texto.isNotBlank()) {
                Icono("file-plus", tam = 15.dp, color = C.apagado)
                Text("Convertir en página", color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}

/**
 * Nota fijada: el contenido de una página con sus casillas marcables ahí mismo (operación
 * de bloque, como el editor: llega en vivo a quien la tenga abierta).
 */
@Composable
fun NotaFijada(pageId: String, titulo: String) {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val q = rememberConsulta("app.bloques", objeto("id" to pageId), etiquetas = setOf("bloques:$pageId"))
    val bloques = q.datos?.comoObjeto?.arr("bloques")?.map { it.comoObjeto }
    val marcadas = remember { mutableStateMapOf<String, Boolean>() }
    var cuantos = 0
    @Composable
    fun Pinta(lista: List<JsonObject>, nivel: Int) {
        for (b in lista) {
            if (cuantos++ > 60) return
            val t = Inline.textoPlano(b["content"])
            val m = Modifier.padding(start = (nivel * 18).dp)
            when (b.str("type")) {
                "checkListItem" -> {
                    val id = b.str("id").orEmpty()
                    val hecha = marcadas[id] ?: (b.obj("props")?.get("checked") as? JsonPrimitive)?.content == "true"
                    Row(
                        m.fillMaxWidth().heightIn(min = 40.dp).toggleable(hecha, role = Role.Checkbox) { v ->
                            marcadas[id] = v
                            val props = JsonObject((b.obj("props") ?: JsonObject(emptyMap())) + ("checked" to JsonPrimitive(v)))
                            alcance.launch {
                                runCatching {
                                    s.repo.mutacion("app.aplicar", objeto("id" to pageId, "ops" to listOf(objeto("op" to "upsert", "block" to JsonObject(b + ("props" to props))))))
                                }.onFailure { marcadas[id] = !v; Avisos.di(it.message ?: "No se pudo marcar") }
                            }
                        }.semantics { contentDescription = t },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CajaCasilla(hecha)
                        Text(t, fontSize = 15.sp, color = if (hecha) C.apagado else C.texto, textDecoration = if (hecha) TextDecoration.LineThrough else null,
                            modifier = Modifier.padding(start = 10.dp))
                    }
                }
                "heading" -> Text(t, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = C.texto, modifier = m.padding(top = 4.dp))
                "bulletListItem", "numberedListItem" -> Text("• $t", fontSize = 15.sp, color = C.texto, modifier = m)
                else -> if (t.isNotBlank()) Text(t, fontSize = 15.sp, color = C.texto, modifier = m)
            }
            Pinta(b.arr("children")?.map { it.comoObjeto }.orEmpty(), nivel + 1)
        }
    }
    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().tarjetaInicio().padding(12.dp)) {
        Text(titulo.ifBlank { "Sin título" }, fontWeight = FontWeight.Medium, fontSize = 15.sp, color = C.texto, modifier = Modifier.clickable { n.pagina(pageId) }.padding(bottom = 4.dp))
        when {
            q.error != null && bloques == null -> Text("Esta página ya no existe o no la ves.", color = C.apagado, fontSize = 14.sp)
            bloques == null -> Text("Cargando…", color = C.apagado, fontSize = 14.sp)
            bloques.isEmpty() -> Text("Página vacía.", color = C.apagado, fontSize = 14.sp)
            else -> Pinta(bloques, 0)
        }
    }
}

/** Recordatorios: mis próximos avisos (de `inicio.recordatorios`). */
@Composable
fun ListaRecordatorios(lista: List<JsonObject>) {
    val n = LocalNavegador.current
    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().tarjetaInicio()) {
        for (r in lista.take(8)) {
            Row(
                Modifier.fillMaxWidth().clickable { val rid = r.str("recordId"); if (rid != null) n.fila(r.str("pageId")!!, rid) else n.pagina(r.str("pageId")!!) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icono("bell", tam = 15.dp, color = C.apagado)
                Text(r.str("titulo")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
                Text(AtajosRecordar.cuando(r.str("inicio").orEmpty().let { if (it.length == 10) "${it}T09:00" else it }), fontSize = 12.sp, color = C.apagado)
            }
        }
    }
}

/** El círculo de una tarea (Mis tareas): tocarlo la marca hecha o pendiente, con su `marca`. */
@Composable
fun CirculoTarea(t: JsonObject, onCambio: (Boolean) -> Unit) {
    if (t.obj("marca") == null) {
        Box(Modifier.size(40.dp))
        return
    }
    val hecha = (t["hecha"] as? JsonPrimitive)?.content == "true"
    Box(
        Modifier.size(40.dp).toggleable(hecha, role = Role.Checkbox) { onCambio(it) }
            .semantics { contentDescription = if (hecha) "Marcar pendiente" else "Marcar hecha" },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(22.dp).clip(CircleShape).background(if (hecha) Marca else Color.Transparent)
                .let { if (!hecha) it.border(1.5.dp, C.apagado, CircleShape) else it },
            contentAlignment = Alignment.Center,
        ) { if (hecha) Icono("check", tam = 14.dp, color = Color.White, trazo = 3f) }
    }
}

/** El valor que pone el círculo: el de «hecha» o el de «pendiente» de su `marca` (JsonNull = vaciar). */
fun valorMarca(t: JsonObject, hecha: Boolean): Pair<String, JsonElement>? {
    val m = t.obj("marca") ?: return null
    val fid = m.str("fieldId") ?: return null
    return fid to ((if (hecha) m["si"] else m["no"]) ?: JsonNull)
}
