package com.monrealperez.notiono.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Miembro
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.ColoresTexto
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.LocalDate
import java.time.format.TextStyle

/** Una entrada del menú «/»: qué bloque crea (o qué hace). */
data class ItemBloque(val clave: String, val titulo: String, val icono: String, val grupo: String, val palabras: String = "")

val ITEMS_BLOQUE = listOf(
    ItemBloque("paragraph", "Texto", "letter-text", "Bloques básicos", "texto parrafo p"),
    ItemBloque("h1", "Encabezado 1", "heading-1", "Bloques básicos", "titulo h1 #"),
    ItemBloque("h2", "Encabezado 2", "heading-2", "Bloques básicos", "titulo h2 ##"),
    ItemBloque("h3", "Encabezado 3", "heading-3", "Bloques básicos", "titulo h3 ###"),
    ItemBloque("th1", "Encabezado plegable 1", "heading-1", "Bloques básicos", "toggle plegable titulo"),
    ItemBloque("th2", "Encabezado plegable 2", "heading-2", "Bloques básicos", "toggle plegable titulo"),
    ItemBloque("th3", "Encabezado plegable 3", "heading-3", "Bloques básicos", "toggle plegable titulo"),
    ItemBloque("bulletListItem", "Lista con viñetas", "list", "Bloques básicos", "lista viñetas ul -"),
    ItemBloque("numberedListItem", "Lista numerada", "list-ordered", "Bloques básicos", "lista numerada ol 1."),
    ItemBloque("checkListItem", "Lista de tareas", "list-todo", "Bloques básicos", "tareas casilla checklist todo"),
    ItemBloque("toggleListItem", "Lista desplegable", "chevron-right", "Bloques básicos", "desplegable toggle"),
    ItemBloque("quote", "Cita", "quote", "Bloques básicos", "cita quote >"),
    ItemBloque("callout", "Llamada", "lightbulb", "Bloques básicos", "llamada callout aviso"),
    ItemBloque("divider", "Separador", "minus", "Bloques básicos", "separador linea divider ---"),
    ItemBloque("codeBlock", "Código", "code", "Bloques básicos", "codigo code ```"),
    ItemBloque("subpagina", "Subpágina", "file-text", "Bloques básicos", "subpagina pagina page"),
    ItemBloque("table", "Tabla", "table", "Avanzados", "tabla rejilla"),
    ItemBloque("columnas2", "2 columnas", "columns-2", "Avanzados", "columnas"),
    ItemBloque("columnas3", "3 columnas", "columns-3", "Avanzados", "columnas"),
    ItemBloque("toc", "Tabla de contenidos", "list-tree", "Avanzados", "indice contenidos toc"),
    ItemBloque("equation", "Ecuación", "sigma", "Avanzados", "ecuacion latex tex matematicas"),
    ItemBloque("bookmark", "Enlace web", "link-2", "Avanzados", "enlace web marcador bookmark youtube video"),
    ItemBloque("image", "Imagen", "image", "Multimedia", "imagen foto"),
    ItemBloque("video", "Vídeo", "video", "Multimedia", "video"),
    ItemBloque("audio", "Audio", "music", "Multimedia", "audio sonido"),
    ItemBloque("file", "Archivo", "paperclip", "Multimedia", "archivo fichero adjunto"),
    ItemBloque("bd", "Base de datos", "database", "Bases de datos", "base de datos bd tabla database"),
    ItemBloque("bdEnlazada", "Vista enlazada de una base de datos", "link", "Bases de datos", "enlazar vista bd database"),
)

private fun sinTildes(s: String) = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()

/** Menú «/» mientras se escribe: filtra por lo que va detrás de la barra. */
@Composable
fun MenuBloques(consulta: String, onElegir: (ItemBloque) -> Unit, onCerrar: () -> Unit) {
    val q = sinTildes(consulta)
    val lista = ITEMS_BLOQUE.filter { q.isEmpty() || sinTildes(it.titulo).contains(q) || it.palabras.contains(q) }
    if (lista.isEmpty()) {
        LaunchedEffect(consulta) { delay(1500); onCerrar() }
        return
    }
    Desplegable {
        LazyColumn(Modifier.heightIn(max = 280.dp)) {
            items(lista, key = { it.clave }) { item ->
                FilaMenu(item.titulo, item.icono, detalle = item.grupo) { onElegir(item) }
            }
        }
    }
}

/** Algo que se puede mencionar con «@». */
sealed interface Mencionable {
    data class Pagina(val id: String, val titulo: String, val icono: String?) : Mencionable
    data class Persona(val id: String, val nombre: String) : Mencionable
    data class Fecha(val ymd: String, val etiqueta: String) : Mencionable
}

/** Menú «@»: fechas, personas del espacio y páginas (como el de la web). */
@Composable
fun MenuMenciones(consulta: String, pageId: String, onElegir: (Mencionable) -> Unit, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    var paginas by remember { mutableStateOf<List<Mencionable.Pagina>>(emptyList()) }
    var personas by remember { mutableStateOf<List<Mencionable.Persona>>(emptyList()) }
    LaunchedEffect(consulta) {
        delay(150)
        val q = consulta.trim()
        paginas = runCatching {
            if (q.isEmpty()) s.repo.consulta("pages.tree").comoLista.take(8).map { it.comoObjeto }
            else s.repo.consulta("pages.search", objeto("query" to q), cachear = false).comoLista.map { it.comoObjeto }
        }.getOrDefault(emptyList()).filter { it.str("id") != null && it.str("id") != pageId }.distinctBy { it.str("id") }
            .map { Mencionable.Pagina(it.str("id")!!, it.str("title").orEmpty(), it.str("icon")) }
        personas = runCatching {
            s.repo.consulta("workspace.members").comoObjeto.objs("members").map { json.decodeFromJsonElement(Miembro.serializer(), it) }
        }.getOrDefault(emptyList()).filter { q.isEmpty() || it.nombre.contains(q, true) || it.email.contains(q, true) }
            .distinctBy { it.userId }.map { Mencionable.Persona(it.userId, it.nombre) }
    }
    val fechas = remember(consulta) { fechasPara(consulta.trim().lowercase()) }
    Desplegable {
        LazyColumn(Modifier.heightIn(max = 300.dp)) {
            if (fechas.isNotEmpty()) item { TituloSeccion("Fechas") }
            items(fechas, key = { "f" + it.ymd }) { f -> FilaMenu(f.etiqueta, "calendar-days", detalle = f.ymd) { onElegir(f) } }
            if (personas.isNotEmpty()) item { TituloSeccion("Personas") }
            items(personas, key = { "u" + it.id }) { p -> FilaMenu("@${p.nombre}", "circle-user") { onElegir(p) } }
            if (paginas.isNotEmpty()) item { TituloSeccion("Páginas") }
            items(paginas, key = { "p" + it.id }) { p ->
                Row(Modifier.fillMaxWidth().clickable { onElegir(p) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconoPagina(p.icono, 18.dp)
                    Text(p.titulo.ifBlank { "Sin título" }, fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 10.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
    // Nada que proponer con lo escrito: se cierra solo.
    if (fechas.isEmpty() && personas.isEmpty() && paginas.isEmpty() && consulta.length > 2) {
        LaunchedEffect(consulta) { delay(1500); onCerrar() }
    }
}

/** Hoy/Mañana si casan con lo escrito, y «25/12» o «25/12/2027» tal cual (como la web). */
fun fechasPara(q: String, hoy: LocalDate = LocalDate.now()): List<Mencionable.Fecha> {
    val out = ArrayList<Mencionable.Fecha>()
    if (q.isEmpty() || "hoy".startsWith(q)) out.add(Mencionable.Fecha(hoy.toString(), "Hoy"))
    if (q.isEmpty() || "mañana".startsWith(q) || "manana".startsWith(q)) out.add(Mencionable.Fecha(hoy.plusDays(1).toString(), "Mañana"))
    Regex("^(\\d{1,2})[/\\-.](\\d{1,2})(?:[/\\-.](\\d{2,4}))?$").find(q)?.let { m ->
        val año = m.groupValues[3].takeIf { it.isNotEmpty() }?.let { if (it.length == 2) 2000 + it.toInt() else it.toInt() } ?: hoy.year
        runCatching { LocalDate.of(año, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()?.let { d ->
            val mes = d.month.getDisplayName(TextStyle.FULL, com.monrealperez.notiono.util.Fechas.es)
            out.add(Mencionable.Fecha(d.toString(), "${d.dayOfMonth} de $mes de ${d.year}"))
        }
    }
    return out
}

@Composable
private fun Desplegable(contenido: @Composable () -> Unit) {
    Box(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).shadow(8.dp, RoundedCornerShape(10.dp))
            .clip(RoundedCornerShape(10.dp)).background(C.fondo).border(1.dp, C.borde, RoundedCornerShape(10.dp)),
    ) { contenido() }
}

/** Barra de formato sobre el teclado, como la de la app de Notion. */
@Composable
fun BarraFormato(
    estado: EstadoEditor,
    activo: Activo,
    acciones: AccionesEditor,
    pal: Paleta,
    onInsertar: () -> Unit,
    onBloque: () -> Unit,
    onEnlace: () -> Unit,
) {
    var colores by remember { mutableStateOf(false) }
    val b = estado.enfocado?.let { estado.busca(it) }
    val (a, z) = estado.seleccion
    val t = b?.texto
    fun tiene(clave: String) = t != null && (if (a == z) estado.pendientes.containsKey(clave) || Inline.tiene(t, clave, a, z) else Inline.tiene(t, clave, a, z))
    fun alterna(clave: String) {
        val campo = activo.campo ?: return
        val txt = campo.text ?: return
        val bl = campo.bloque ?: return
        if (a == z) {
            // Sin selección: lo próximo que se escriba (como en cualquier editor).
            estado.pendientes = if (estado.pendientes.containsKey(clave)) estado.pendientes - clave else estado.pendientes + (clave to JsonPrimitive(true))
        } else {
            Inline.alterna(txt, clave, JsonPrimitive(true), a, z, pal, !Inline.tiene(txt, clave, a, z))
            estado.texto(bl)
            campo.invalidate()
        }
    }
    Column(Modifier.fillMaxWidth().background(C.superficie)) {
        if (colores) FilaColores(estado, activo, pal) { colores = false }
        Separador()
        Row(
            Modifier.fillMaxWidth().height(46.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BotonBarra("plus", onClick = onInsertar)
            BotonBarra("type-outline", onClick = { acciones.pideConvertir() })
            BotonBarra("bold", tiene("bold")) { alterna("bold") }
            BotonBarra("italic", tiene("italic")) { alterna("italic") }
            BotonBarra("underline", tiene("underline")) { alterna("underline") }
            BotonBarra("strikethrough", tiene("strike")) { alterna("strike") }
            BotonBarra("code", tiene("code")) { alterna("code") }
            BotonBarra("link", t != null && t.getSpans(a, z, EnlaceSpan::class.java).isNotEmpty(), onClick = onEnlace)
            BotonBarra("palette", colores) { colores = !colores }
            BotonBarra("at-sign") { acciones.escribe("@") }
            BotonBarra("indent-increase") { b?.let { estado.sangra(it) } }
            BotonBarra("indent-decrease") { b?.let { estado.desangra(it) } }
            BotonBarra("arrow-up") { b?.let { estado.mueve(it, -1) } }
            BotonBarra("arrow-down") { b?.let { estado.mueve(it, 1) } }
            BotonBarra("ellipsis", onClick = onBloque)
            BotonBarra("chevron-down") { acciones.ocultaTeclado(activo) }
        }
    }
}

@Composable
private fun BotonBarra(icono: String, activo: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp).padding(2.dp).clip(RoundedCornerShape(8.dp)).background(if (activo) C.activo else Color.Transparent).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icono(icono, tam = 19.dp, color = if (activo) Marca else C.texto) }
}

/** Colores de texto y de fondo del tramo seleccionado (o del bloque entero si no hay selección). */
@Composable
private fun FilaColores(estado: EstadoEditor, activo: Activo, pal: Paleta, onListo: () -> Unit) {
    val oscuro = C.oscuro
    fun aplica(clave: String, nombre: String?) {
        val campo = activo.campo ?: return
        val b = campo.bloque ?: return
        val (a, z) = estado.seleccion
        val txt = campo.text ?: return
        if (a != z) {
            Inline.alterna(txt, clave, JsonPrimitive(nombre ?: "default"), a, z, pal, nombre != null)
            estado.texto(b)
            campo.invalidate()
        } else {
            estado.props(b, clave to JsonPrimitive(nombre ?: "default"))
        }
        onListo()
    }
    Column(Modifier.padding(8.dp)) {
        Text("Texto", fontSize = 12.sp, color = C.apagado)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Muestra("A", C.texto, C.fondo) { aplica("textColor", null) }
            for (c in ColoresTexto.nombres) Muestra("A", ColoresTexto.texto(c, oscuro)!!, C.fondo) { aplica("textColor", c) }
        }
        Text("Fondo", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(top = 6.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Muestra("A", C.texto, C.fondo) { aplica("backgroundColor", null) }
            for (c in ColoresTexto.nombres) Muestra("A", C.texto, ColoresTexto.fondo(c, oscuro)!!) { aplica("backgroundColor", c) }
        }
    }
}

@Composable
private fun Muestra(letra: String, tinta: Color, fondo: Color, onClick: () -> Unit) {
    Box(
        Modifier.size(32.dp).clip(RoundedCornerShape(6.dp)).background(fondo).border(1.dp, C.borde, RoundedCornerShape(6.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(letra, color = tinta, fontWeight = FontWeight.SemiBold) }
}

/** «+»: todos los bloques que se pueden insertar debajo del actual. */
@Composable
fun HojaInsertar(acciones: AccionesEditor, onCerrar: () -> Unit) {
    var filtro by remember { mutableStateOf("") }
    HojaLista(onCerrar, "Insertar bloque") {
        Box(Modifier.padding(horizontal = 16.dp)) { Campo(filtro, { filtro = it }, placeholder = "Buscar bloque…") }
        val q = sinTildes(filtro)
        var grupo = ""
        for (item in ITEMS_BLOQUE.filter { q.isEmpty() || sinTildes(it.titulo).contains(q) || it.palabras.contains(q) }) {
            if (item.grupo != grupo) {
                grupo = item.grupo
                TituloSeccion(grupo)
            }
            FilaMenu(item.titulo, item.icono) { onCerrar(); acciones.inserta(item) }
        }
    }
}

/** Acciones sobre un bloque: convertir, color, duplicar, mover, borrar… */
@Composable
fun HojaAccionesBloque(b: Bloque, estado: EstadoEditor, acciones: AccionesEditor, editable: Boolean, onCerrar: () -> Unit) {
    var convertir by remember { mutableStateOf(false) }
    if (convertir || acciones.convirtiendo) {
        HojaLista({ convertir = false; acciones.convirtiendo = false; onCerrar() }, "Convertir en") {
            for (item in ITEMS_BLOQUE.filter { it.grupo == "Bloques básicos" && it.clave !in setOf("divider", "subpagina") }) {
                FilaMenu(item.titulo, item.icono) {
                    acciones.convierte(b, item.clave)
                    convertir = false
                    acciones.convirtiendo = false
                    onCerrar()
                }
            }
        }
        return
    }
    Hoja(onCerrar, nombreTipo(b.tipo)) {
        if (editable) {
            if (b.esTexto) FilaMenu("Convertir en…", "type-outline") { convertir = true }
            FilaMenu("Duplicar", "copy-plus") { estado.duplica(b); onCerrar() }
            FilaMenu("Subir", "arrow-up") { estado.mueve(b, -1); onCerrar() }
            FilaMenu("Bajar", "arrow-down") { estado.mueve(b, 1); onCerrar() }
            FilaMenu("Sangrar", "indent-increase") { estado.sangra(b); onCerrar() }
            FilaMenu("Quitar sangría", "indent-decrease") { estado.desangra(b); onCerrar() }
        }
        FilaMenu("Copiar enlace al bloque", "link") { acciones.copiaEnlaceBloque(b); onCerrar() }
        if (b.esTexto) FilaMenu("Copiar texto", "copy") { acciones.copiaTexto(b); onCerrar() }
        if (editable) {
            Separador()
            FilaMenu("Eliminar", "trash-2", color = Color(0xFFD44C47)) { estado.borra(b); onCerrar() }
        }
    }
}

fun nombreTipo(tipo: String) = when (tipo) {
    "paragraph" -> "Texto"
    "heading" -> "Encabezado"
    "bulletListItem" -> "Lista con viñetas"
    "numberedListItem" -> "Lista numerada"
    "checkListItem" -> "Lista de tareas"
    "toggleListItem" -> "Lista desplegable"
    "quote" -> "Cita"
    "callout" -> "Llamada"
    "codeBlock" -> "Código"
    "divider" -> "Separador"
    "image" -> "Imagen"
    "video" -> "Vídeo"
    "audio" -> "Audio"
    "file" -> "Archivo"
    "table" -> "Tabla"
    "bookmark" -> "Enlace web"
    "equation" -> "Ecuación"
    "toc" -> "Tabla de contenidos"
    "database" -> "Base de datos"
    "columnList" -> "Columnas"
    else -> "Bloque «$tipo»"
}

/** Pedir el enlace del texto seleccionado (vacío = quitarlo). */
@Composable
fun PedirEnlace(activo: Activo, estado: EstadoEditor, pal: Paleta, onCerrar: () -> Unit) {
    val campo = activo.campo
    val txt = campo?.text
    val (a0, z0) = estado.seleccion
    val actual = txt?.getSpans(a0, z0.coerceAtLeast(a0), EnlaceSpan::class.java)?.firstOrNull()
    // Sin selección y dentro de un enlace: se edita el enlace entero.
    val (a, z) = if (a0 == z0 && actual != null && txt != null) txt.getSpanStart(actual) to txt.getSpanEnd(actual) else a0 to z0
    var url by remember { mutableStateOf(actual?.href ?: "") }
    val ctx = LocalContext.current
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onCerrar,
        containerColor = C.fondo,
        title = { Text("Enlace") },
        text = {
            Column {
                if (a == z) Text("Selecciona antes el texto que quieres enlazar.", color = C.apagado, fontSize = 13.sp)
                Campo(url, { url = it }, placeholder = "https://…", autofoco = true)
                if (actual != null) TextButton({ com.monrealperez.notiono.util.Enlaces.abre(ctx, actual.href); onCerrar() }) { Text("Abrir enlace", color = Marca) }
            }
        },
        confirmButton = {
            TextButton({
                if (campo != null && txt != null && a < z) {
                    val limpio = url.trim().let { if (it.isNotEmpty() && !it.contains("://") && !it.startsWith("mailto:")) "https://$it" else it }
                    Inline.ponEnlace(txt, limpio.ifBlank { null }, a, z, pal)
                    campo.bloque?.let { estado.texto(it) }
                    campo.invalidate()
                }
                onCerrar()
            }) { Text("Guardar", color = Marca) }
        },
        dismissButton = { TextButton(onCerrar) { Text("Cancelar", color = C.texto) } },
    )
}

/** Celdas de una tabla de BlockNote: lee y escribe el JSON `tableContent`. */
object Tabla {
    /** Filas × celdas, cada celda como su contenido en línea (acepta el formato viejo de celdas-lista). */
    fun celdas(contenido: JsonElement?): List<List<JsonElement>> =
        ((contenido as? JsonObject)?.get("rows") as? JsonArray)?.map { fila ->
            ((fila as? JsonObject)?.get("cells") as? JsonArray)?.map { c -> (c as? JsonObject)?.get("content") ?: c } ?: emptyList()
        } ?: emptyList()

    /**
     * Cambia el contenido de una celda conservando sus props y el formato (objeto o lista).
     * Todo con `as?` y comprobando índices: la tabla puede venir de otra versión de la web
     * o de la API con otra forma, y una celda que no existe no puede cerrar la app.
     */
    fun conCelda(contenido: JsonElement?, fila: Int, col: Int, nuevo: JsonArray): JsonObject {
        val o = contenido as? JsonObject ?: vacia(1, 1)
        val filas = (o["rows"] as? JsonArray)?.toMutableList() ?: return o
        val f = filas.getOrNull(fila) as? JsonObject ?: return o
        val cs = (f["cells"] as? JsonArray)?.toMutableList() ?: return o
        val vieja = cs.getOrNull(col) ?: return o
        cs[col] = if (vieja is JsonObject) JsonObject(vieja + ("content" to nuevo)) else nuevo
        filas[fila] = JsonObject(f + ("cells" to JsonArray(cs)))
        return JsonObject(o + ("rows" to JsonArray(filas)))
    }

    private fun filasDe(contenido: JsonElement?): Pair<JsonObject, MutableList<JsonElement>> {
        val o = contenido as? JsonObject ?: vacia(1, 1)
        return o to ((o["rows"] as? JsonArray)?.toMutableList() ?: mutableListOf())
    }

    private fun celdasDe(f: JsonElement): MutableList<JsonElement> = ((f as? JsonObject)?.get("cells") as? JsonArray)?.toMutableList() ?: mutableListOf()

    private fun conCeldas(f: JsonElement, cs: List<JsonElement>): JsonElement =
        (f as? JsonObject)?.let { JsonObject(it + ("cells" to JsonArray(cs))) } ?: f

    private fun celdaVacia() = JsonObject(mapOf(
        "type" to JsonPrimitive("tableCell"), "content" to JsonArray(emptyList()),
        "props" to JsonObject(mapOf("colspan" to JsonPrimitive(1), "rowspan" to JsonPrimitive(1), "backgroundColor" to JsonPrimitive("default"), "textColor" to JsonPrimitive("default"), "textAlignment" to JsonPrimitive("left"))),
    ))

    fun vacia(filas: Int, cols: Int) = JsonObject(mapOf(
        "type" to JsonPrimitive("tableContent"),
        "columnWidths" to JsonArray(List(cols) { kotlinx.serialization.json.JsonNull }),
        "rows" to JsonArray(List(filas) { JsonObject(mapOf("cells" to JsonArray(List(cols) { celdaVacia() }))) }),
    ))

    fun añadeFila(contenido: JsonElement?, en: Int): JsonObject {
        val (o, filas) = filasDe(contenido)
        val cols = filas.maxOfOrNull { celdasDe(it).size }?.coerceAtLeast(1) ?: 1
        filas.add(en.coerceIn(0, filas.size), JsonObject(mapOf("cells" to JsonArray(List(cols) { celdaVacia() }))))
        return JsonObject(o + ("rows" to JsonArray(filas)))
    }

    fun quitaFila(contenido: JsonElement?, i: Int): JsonObject {
        val (o, filas) = filasDe(contenido)
        if (filas.size > 1 && i in filas.indices) filas.removeAt(i)
        return JsonObject(o + ("rows" to JsonArray(filas)))
    }

    fun añadeColumna(contenido: JsonElement?, en: Int): JsonObject {
        val (o, filas) = filasDe(contenido)
        val nuevas = filas.map { f ->
            val cs = celdasDe(f)
            cs.add(en.coerceIn(0, cs.size), celdaVacia())
            conCeldas(f, cs)
        }
        val anchos = (o["columnWidths"] as? JsonArray)?.toMutableList()?.also { it.add(en.coerceIn(0, it.size), kotlinx.serialization.json.JsonNull) }
        return JsonObject(o + ("rows" to JsonArray(nuevas)) + (anchos?.let { mapOf("columnWidths" to JsonArray(it)) } ?: emptyMap()))
    }

    fun quitaColumna(contenido: JsonElement?, j: Int): JsonObject {
        val (o, filas) = filasDe(contenido)
        val nuevas = filas.map { f ->
            val cs = celdasDe(f)
            if (cs.size > 1 && j in cs.indices) cs.removeAt(j)
            conCeldas(f, cs)
        }
        val anchos = (o["columnWidths"] as? JsonArray)?.toMutableList()?.also { if (it.size > 1 && j in it.indices) it.removeAt(j) }
        return JsonObject(o + ("rows" to JsonArray(nuevas)) + (anchos?.let { mapOf("columnWidths" to JsonArray(it)) } ?: emptyMap()))
    }
}
