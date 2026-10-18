package com.monrealperez.notiono.editor

import android.content.ClipData
import android.content.Context
import android.net.Uri
import android.text.Spanned
import android.view.inputmethod.InputMethodManager
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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.emoji2.emojipicker.EmojiPickerView
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Enlaces
import com.monrealperez.notiono.util.Imagenes
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File

/** Lenguajes del bloque de código (los habituales de la web). */
val LENGUAJES = listOf(
    "text", "javascript", "typescript", "python", "kotlin", "java", "json", "html", "css", "bash", "sql", "markdown",
    "yaml", "c", "cpp", "csharp", "go", "rust", "php", "ruby", "swift", "xml",
)

/**
 * Lo que el editor hace más allá del teclado: insertar bloques (con subidas, BD
 * embebidas, subpáginas…), menciones, abrir enlaces y los diálogos de cada bloque.
 */
class AccionesEditor(
    private val ctx: Context,
    private val s: Servicios,
    private val estado: EstadoEditor,
    private val pageId: String,
    private val alcance: CoroutineScope,
) {
    var navegador: Navegador? = null
    var convirtiendo by mutableStateOf(false)
    private var dialogo by mutableStateOf<String?>(null)
    private var objetivo by mutableStateOf<Bloque?>(null)
    private var tipoSubida by mutableStateOf("image")
    private var lanzaGaleria: (() -> Unit)? = null
    private var lanzaArchivo: (() -> Unit)? = null
    private var lanzaCamara: (() -> Unit)? = null

    private fun enfocadoOUltimo(): Bloque? = estado.enfocado?.let { estado.busca(it) } ?: estado.raiz.lastOrNull()

    /** Pone el bloque nuevo: sustituye al actual si es un párrafo vacío, si no va debajo. */
    private fun coloca(nuevo: Bloque, sustituir: Bloque? = enfocadoOUltimo()) {
        val ref = sustituir
        if (ref != null && ref.tipo == "paragraph" && ref.texto.isNullOrEmpty() && ref.hijos.isEmpty()) {
            estado.insertaDespues(ref, nuevo)
            estado.borra(ref)
            if (nuevo.esTexto) estado.foco = PeticionFoco(nuevo.id, 0)
        } else estado.insertaDespues(ref, nuevo)
        // Tras un bloque que no es texto, una línea para seguir escribiendo.
        if (!nuevo.esTexto && estado.siguienteVisible(nuevo) == null) estado.insertaDespues(nuevo, Bloque.nuevo(), enfocar = false)
    }

    fun eligeDelMenu(item: ItemBloque, m: MenuEscritura) {
        val b = estado.busca(m.bloqueId)
        val t = b?.texto
        if (t != null) {
            quitaConsulta(t, m, estado.seleccion.first)
            estado.texto(b)
        }
        estado.menu = null
        if (b != null && t != null && t.isEmpty() && item.clave in CONVERTIBLES) convierte(b, item.clave)
        else inserta(item)
    }

    private val CONVERTIBLES = setOf("paragraph", "h1", "h2", "h3", "th1", "th2", "th3", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote", "callout", "codeBlock")

    fun tipoDe(clave: String): Pair<String, Map<String, JsonElement>> = when (clave) {
        "h1", "h2", "h3" -> "heading" to mapOf("level" to JsonPrimitive(clave.last().digitToInt()), "isToggleable" to JsonPrimitive(false))
        "th1", "th2", "th3" -> "heading" to mapOf("level" to JsonPrimitive(clave.last().digitToInt()), "isToggleable" to JsonPrimitive(true))
        else -> clave to emptyMap()
    }

    fun convierte(b: Bloque, clave: String) {
        val (tipo, props) = tipoDe(clave)
        estado.convierte(b, tipo, props)
        if (b.esTexto) estado.foco = PeticionFoco(b.id, b.texto?.length ?: 0)
    }

    fun pideConvertir() {
        convirtiendo = true
    }

    fun inserta(item: ItemBloque) {
        when (item.clave) {
            in CONVERTIBLES -> {
                val (tipo, props) = tipoDe(item.clave)
                coloca(Bloque.nuevo(tipo, props))
            }
            "divider", "toc" -> coloca(Bloque.nuevo(item.clave))
            "table" -> coloca(Bloque.nuevo("table").also { it.crudo = Tabla.vacia(3, 3) })
            "columnas2", "columnas3" -> {
                val n = if (item.clave == "columnas2") 2 else 3
                val lista = Bloque.nuevo("columnList")
                repeat(n) { lista.hijos.add(Bloque.nuevo("column").also { c -> c.hijos.add(Bloque.nuevo()) }) }
                coloca(lista)
                estado.foco = PeticionFoco(lista.hijos[0].hijos[0].id, 0)
            }
            "equation" -> {
                val e = Bloque.nuevo("equation")
                coloca(e)
                objetivo = e
                dialogo = "tex"
            }
            "bookmark" -> { objetivo = null; dialogo = "url" }
            "image", "video", "audio", "file" -> { tipoSubida = item.clave; dialogo = "subir" }
            "bd" -> alcance.launch {
                try {
                    val r = s.repo.mutacion("db.createInline", encolable = false)?.comoObjeto ?: return@launch
                    coloca(Bloque.nuevo("database", mapOf("collectionId" to JsonPrimitive(r.str("collectionId")!!), "pageId" to JsonPrimitive(r.str("pageId")!!))))
                } catch (e: ErrorApi) {
                    Avisos.di(if (e.sinConexion) "Sin conexión: la base de datos se crea en el servidor" else e.message ?: "No se pudo crear")
                }
            }
            "bdEnlazada" -> dialogo = "enlazar"
            "subpagina" -> alcance.launch {
                try {
                    val r = s.repo.mutacion("pages.create", objeto("parentId" to pageId, "title" to ""), encolable = false, etiquetas = listOf("arbol"))?.comoObjeto ?: return@launch
                    val id = r.str("id")!!
                    val p = Bloque.nuevo("paragraph")
                    insertaChip(p, JsonObject(mapOf("type" to JsonPrimitive("mention"), "props" to JsonObject(mapOf("pageId" to JsonPrimitive(id), "title" to JsonPrimitive("Sin título"), "icon" to JsonPrimitive(""))))), 0, false)
                    coloca(p)
                    s.alcance.launch { kotlinx.coroutines.delay(1200); navegador?.pagina(id) }
                } catch (e: ErrorApi) {
                    Avisos.di(if (e.sinConexion) "Sin conexión: no se puede crear la subpágina" else e.message ?: "No se pudo crear")
                }
            }
        }
    }

    private fun insertaChip(b: Bloque, nodo: JsonObject, pos: Int, conEspacio: Boolean = true) {
        val t = b.texto ?: return
        val p = pos.coerceIn(0, t.length)
        t.insert(p, OBJ.toString() + if (conEspacio) " " else "")
        t.setSpan(Inline.chip(nodo, estado.pal), p, p + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    fun insertaMencion(m: Mencionable, menu: MenuEscritura) {
        val b = estado.busca(menu.bloqueId) ?: return
        val t = b.texto ?: return
        val donde = quitaConsulta(t, menu, estado.seleccion.first)
        val nodo = when (m) {
            is Mencionable.Pagina -> JsonObject(mapOf("type" to JsonPrimitive("mention"), "props" to JsonObject(mapOf("pageId" to JsonPrimitive(m.id), "title" to JsonPrimitive(m.titulo.ifBlank { "Sin título" }), "icon" to JsonPrimitive(m.icono ?: "")))))
            is Mencionable.Persona -> JsonObject(mapOf("type" to JsonPrimitive("personMention"), "props" to JsonObject(mapOf("userId" to JsonPrimitive(m.id), "name" to JsonPrimitive(m.nombre)))))
            is Mencionable.Fecha -> JsonObject(mapOf("type" to JsonPrimitive("dateMention"), "props" to JsonObject(mapOf("fecha" to JsonPrimitive(m.ymd)))))
        }
        insertaChip(b, nodo, donde)
        estado.menu = null
        estado.texto(b)
        estado.foco = PeticionFoco(b.id, donde + 2)
        estado.estructura(b)
        // Mencionar a alguien le avisa en su bandeja, como en la web.
        if (m is Mencionable.Persona) alcance.launch {
            runCatching { s.repo.mutacion("notifications.notifyMention", objeto("pageId" to pageId, "userId" to m.id)) }
        }
    }

    fun abreChip(nodo: JsonObject) {
        if (nodo.str("type") == "mention") (nodo["props"] as? JsonObject)?.str("pageId")?.takeIf { it.isNotBlank() }?.let { navegador?.pagina(it) }
    }

    fun abreUrl(url: String) = Enlaces.abre(ctx, s.api.absoluta(url))

    fun escribe(texto: String) {
        val b = estado.enfocado?.let { estado.busca(it) } ?: return
        val t = b.texto ?: return
        val p = estado.seleccion.first.coerceIn(0, t.length)
        val antes = if (p > 0 && !t[p - 1].isWhitespace()) " " else ""
        t.insert(p, antes + texto)
        estado.foco = PeticionFoco(b.id, p + antes.length + texto.length)
        estado.texto(b)
        estado.menu = MenuEscritura(texto.first(), b.id, p + antes.length, "")
        estado.estructura(b)
    }

    fun ocultaTeclado(activo: Activo) {
        val c = activo.campo ?: return
        ctx.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(c.windowToken, 0)
        c.clearFocus()
        estado.enfocado = null
    }

    fun copiaEnlaceBloque(b: Bloque) {
        ctx.getSystemService(android.content.ClipboardManager::class.java)
            .setPrimaryClip(ClipData.newPlainText("Notiono", "${BuildConfig.BASE_URL}/p/$pageId#${b.id}"))
        Avisos.di("Enlace del bloque copiado")
    }

    fun copiaTexto(b: Bloque) {
        ctx.getSystemService(android.content.ClipboardManager::class.java)
            .setPrimaryClip(ClipData.newPlainText("Notiono", b.texto.toString().replace(OBJ.toString(), "")))
        Avisos.di("Texto copiado")
    }

    fun eligeEmojiLlamada(b: Bloque) { objetivo = b; dialogo = "llamada" }
    fun eligeLenguaje(b: Bloque) { objetivo = b; dialogo = "lenguaje" }
    fun editaTex(b: Bloque) { objetivo = b; dialogo = "tex" }
    fun editaPie(b: Bloque) { objetivo = b; dialogo = "pie" }
    fun cambiaMedio(b: Bloque) { objetivo = b; tipoSubida = b.tipo; dialogo = "subir" }
    fun editaMarcador(b: Bloque) { objetivo = b; dialogo = "url" }

    private fun sube(uri: Uri) {
        val destino = objetivo
        alcance.launch {
            Avisos.di("Subiendo…")
            try {
                val (bytes, nombre, mime) = if (tipoSubida == "image") Imagenes.lee(ctx, uri) else Imagenes.leeArchivo(ctx, uri)
                val r = s.api.subir(bytes, nombre, mime)
                val props = mapOf("url" to JsonPrimitive(r.url), "name" to JsonPrimitive(r.name ?: nombre))
                if (destino != null && destino.tipo == tipoSubida) estado.props(destino, *props.map { (k, v) -> k to v }.toTypedArray())
                else coloca(Bloque.nuevo(tipoSubida, props))
                Avisos.di("Subido")
            } catch (e: Exception) {
                Avisos.di(if (e is ErrorApi && e.sinConexion) "Sin conexión: no se puede subir ahora" else e.message ?: "No se pudo subir")
            } finally {
                objetivo = null
            }
        }
    }

    /** Diálogos y lanzadores (galería, cámara, archivos): se montan dentro del editor. */
    @Composable
    fun Dialogos() {
        val galeria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(::sube) }
        val archivo = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(::sube) }
        // Guardada: con la cámara abierta, Android puede matar la app y la foto llega al volver.
        val fotoUri = androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<Uri?>(null) }
        val camara = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) fotoUri.value?.let(::sube) }
        lanzaGaleria = {
            galeria.launch(PickVisualMediaRequest(if (tipoSubida == "video") ActivityResultContracts.PickVisualMedia.VideoOnly else ActivityResultContracts.PickVisualMedia.ImageOnly))
        }
        lanzaArchivo = { archivo.launch(arrayOf(when (tipoSubida) { "image" -> "image/*"; "video" -> "video/*"; "audio" -> "audio/*"; else -> "*/*" })) }
        lanzaCamara = {
            val f = File(ctx.cacheDir, "foto-${System.currentTimeMillis()}.jpg")
            val u = FileProvider.getUriForFile(ctx, "${ctx.packageName}.ficheros", f)
            fotoUri.value = u
            Enlaces.lanza(camara, u, "No hay ninguna app de cámara")
        }
        if (convirtiendo) {
            val b = estado.enfocado?.let { estado.busca(it) }
            if (b != null) HojaAccionesBloque(b, estado, this, true) { convirtiendo = false } else convirtiendo = false
        }
        val b = objetivo
        when (dialogo) {
            "subir" -> Hoja({ dialogo = null }, when (tipoSubida) { "image" -> "Imagen"; "video" -> "Vídeo"; "audio" -> "Audio"; else -> "Archivo" }) {
                if (tipoSubida == "image" || tipoSubida == "video") FilaMenu("Galería", "image") { dialogo = null; lanzaGaleria?.invoke() }
                if (tipoSubida == "image") FilaMenu("Cámara", "camera") { dialogo = null; lanzaCamara?.invoke() }
                FilaMenu("Archivos", "folder-input") { dialogo = null; lanzaArchivo?.invoke() }
                FilaMenu("Enlace (URL)", "link") { dialogo = "urlMedio" }
            }
            "urlMedio" -> PideTexto("Enlace al archivo", "") { url ->
                dialogo = null
                if (url != null && url.isNotBlank()) {
                    val props = mapOf("url" to JsonPrimitive(url.trim()), "name" to JsonPrimitive(url.substringAfterLast('/')))
                    if (b != null && b.tipo == tipoSubida) estado.props(b, *props.map { (k, v) -> k to v }.toTypedArray()) else coloca(Bloque.nuevo(tipoSubida, props))
                }
            }
            "url" -> PideTexto("Enlace web", b?.prop("url") ?: "") { url ->
                dialogo = null
                if (url != null && url.isNotBlank()) {
                    val limpio = url.trim().let { if (!it.contains("://")) "https://$it" else it }
                    alcance.launch {
                        // La vista previa (título, imagen) la saca el servidor, como en la web.
                        val prev = runCatching { s.repo.mutacion("pages.linkPreview", objeto("url" to limpio), encolable = false)?.comoObjeto }.getOrNull()
                        val props = mapOf(
                            "url" to JsonPrimitive(limpio),
                            "title" to JsonPrimitive(prev?.str("title") ?: ""),
                            "description" to JsonPrimitive(prev?.str("description") ?: ""),
                            "image" to JsonPrimitive(prev?.str("image") ?: ""),
                            "siteName" to JsonPrimitive(prev?.str("siteName") ?: ""),
                        )
                        if (b != null && b.tipo == "bookmark") estado.props(b, *props.map { (k, v) -> k to v }.toTypedArray())
                        else coloca(Bloque.nuevo("bookmark", props))
                    }
                }
            }
            "tex" -> if (b != null) EditorTex(b.prop("tex") ?: "") { tex ->
                dialogo = null
                if (tex != null) estado.props(b, "tex" to JsonPrimitive(tex))
            }
            "pie" -> if (b != null) PideTexto("Pie de foto", b.prop("caption") ?: "") { t ->
                dialogo = null
                if (t != null) estado.props(b, "caption" to JsonPrimitive(t))
            }
            "lenguaje" -> if (b != null) HojaLista({ dialogo = null }, "Lenguaje") {
                for (l in LENGUAJES) FilaMenu(l, "code", derecha = { if (b.prop("language") == l) com.monrealperez.notiono.ui.comun.Icono("check", color = Marca) }) {
                    dialogo = null
                    estado.props(b, "language" to JsonPrimitive(l))
                }
            }
            "llamada" -> if (b != null) Hoja({ dialogo = null }, "Llamada", completa = true) {
                val colores = listOf("fondo", "gris", "marron", "naranja", "amarillo", "verde", "azul", "morado", "rosa", "rojo")
                LazyVerticalGrid(GridCells.Fixed(10), Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(40.dp)) {
                    items(colores) { c ->
                        Box(
                            Modifier.padding(3.dp).size(28.dp).clip(CircleShape).background(coloresLlamada(c, C.oscuro))
                                .border(2.dp, if (b.prop("color") == c) Marca else Color.Transparent, CircleShape)
                                .clickable { estado.props(b, "color" to JsonPrimitive(c)); dialogo = null },
                        )
                    }
                }
                AndroidView(
                    factory = { c -> EmojiPickerView(c).apply { emojiGridColumns = 8; setOnEmojiPickedListener { e -> estado.props(b, "emoji" to JsonPrimitive(e.emoji)); dialogo = null } } },
                    modifier = Modifier.fillMaxWidth().height(380.dp),
                )
            }
            "enlazar" -> HojaEnlazarBd { col, pag ->
                dialogo = null
                if (col != null && pag != null) coloca(Bloque.nuevo("database", mapOf("collectionId" to JsonPrimitive(col), "pageId" to JsonPrimitive(pag))))
            }
        }
    }

    @Composable
    private fun PideTexto(titulo: String, inicial: String, onListo: (String?) -> Unit) {
        com.monrealperez.notiono.ui.comun.PedirTexto(titulo, inicial, onOk = { onListo(it) }, onNo = { onListo(null) })
    }
}

/** Editar el TeX de una ecuación con vista previa en vivo. */
@Composable
fun EditorTex(inicial: String, onListo: (String?) -> Unit) {
    var tex by remember { mutableStateOf(inicial) }
    AlertDialog(
        onDismissRequest = { onListo(null) },
        containerColor = C.fondo,
        title = { Text("Ecuación (TeX)") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Campo(tex, { tex = it }, placeholder = "c = \\sqrt{a^2 + b^2}", autofoco = true, unaLinea = false)
                Box(Modifier.fillMaxWidth().height(90.dp), contentAlignment = androidx.compose.ui.Alignment.Center) { Ecuacion(tex, 20f) }
            }
        },
        confirmButton = { TextButton({ onListo(tex) }) { Text("Guardar", color = Marca) } },
        dismissButton = { TextButton({ onListo(null) }) { Text("Cancelar", color = C.texto) } },
    )
}

/** Elegir una base de datos que ya existe para la vista enlazada. */
@Composable
fun HojaEnlazarBd(onListo: (String?, String?) -> Unit) {
    val q = com.monrealperez.notiono.ui.comun.rememberConsulta("db.listDatabases")
    val lista = q.datos?.comoLista?.map { it.comoObjeto } ?: emptyList()
    HojaLista({ onListo(null, null) }, "Enlazar una base de datos") {
        for (d in lista) {
            Row(Modifier.fillMaxWidth().clickable { onListo(d.str("collectionId"), d.str("pageId")) }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                IconoPagina(d.str("icon"), 18.dp, porDefecto = "database")
                Text(d.str("title")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 10.dp))
            }
        }
    }
}
