package com.monrealperez.notiono.compartir

import android.content.Intent
import com.monrealperez.notiono.ui.comun.rememberAlcance
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.MainActivity
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.ui.tema.TemaNotiono
import com.monrealperez.notiono.util.Imagenes
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.UUID

/**
 * «Compartir con Notiono»: texto, enlace o imagen de otra app → página nueva o al final
 * de una página que ya existe (como el «Save to Notion» de la app de Notion).
 */
class CompartirActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val texto = textoCompartido(intent, Intent.EXTRA_TEXT)
        val asunto = textoCompartido(intent, Intent.EXTRA_SUBJECT)
        val archivos = archivosCompartidos(intent)
        setContent {
            val oscuro = com.monrealperez.notiono.ui.tema.esOscuro()
            com.monrealperez.notiono.ui.tema.BarrasDelTema(this, oscuro)
            TemaNotiono(oscuro) {
                if (Servicios.de(this).sesion.token == null) {
                    Box(Modifier.fillMaxSize().background(C.fondo).safeDrawingPadding().padding(24.dp)) {
                        Text("Entra primero en Notiono para guardar cosas en él.", color = C.texto)
                    }
                } else Compartir(texto, asunto, archivos, onListo = { id ->
                    if (id != null) startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("notiono://pagina/$id"), this, MainActivity::class.java))
                    finish()
                })
            }
        }
    }
}

/** Los archivos de lo compartido: uno (SEND) o varios (SEND_MULTIPLE). */
fun archivosCompartidos(intent: Intent): List<Uri> = runCatching {
    if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
        else @Suppress("DEPRECATION") intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
    } else {
        listOfNotNull(
            if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            else @Suppress("DEPRECATION") (intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri),
        )
    }
}.getOrDefault(emptyList())

/**
 * Un texto de lo compartido. Hay apps que lo mandan con formato (`CharSequence`, no
 * `String`): `getStringExtra` lo devolvía null y se guardaba una página vacía.
 */
fun textoCompartido(intent: Intent, clave: String): String? =
    runCatching { intent.getCharSequenceExtra(clave)?.toString() }.getOrNull()

private fun parrafo(contenido: JsonElement) = JsonObject(mapOf(
    "id" to JsonPrimitive(UUID.randomUUID().toString()), "type" to JsonPrimitive("paragraph"),
    "props" to JsonObject(mapOf("textColor" to JsonPrimitive("default"), "backgroundColor" to JsonPrimitive("default"), "textAlignment" to JsonPrimitive("left"))),
    "content" to contenido, "children" to JsonArray(emptyList()),
))

private fun nodoTexto(t: String) = JsonObject(mapOf("type" to JsonPrimitive("text"), "text" to JsonPrimitive(t), "styles" to JsonObject(emptyMap())))
private fun enlace(url: String) = JsonObject(mapOf("type" to JsonPrimitive("link"), "href" to JsonPrimitive(url), "content" to JsonArray(listOf(nodoTexto(url)))))

/**
 * Los bloques que salen de lo compartido: cada archivo subido como su bloque (imagen,
 * vídeo, audio o archivo, como al arrastrarlo a la web) y el texto, con los enlaces como
 * enlaces.
 */
suspend fun bloquesCompartidos(ctx: android.content.Context, texto: String?, archivos: List<Uri>): List<JsonObject> {
    val s = Servicios.de(ctx)
    val out = ArrayList<JsonObject>()
    for (uri in archivos) {
        val tipoArchivo = ctx.contentResolver.getType(uri).orEmpty()
        val bloque = when {
            tipoArchivo.startsWith("image/") -> "image"
            tipoArchivo.startsWith("video/") -> "video"
            tipoArchivo.startsWith("audio/") -> "audio"
            else -> "file"
        }
        val (bytes, nombre, mime) = if (bloque == "image") Imagenes.lee(ctx, uri) else Imagenes.leeArchivo(ctx, uri)
        val r = s.api.subir(bytes, nombre, mime)
        val props = mutableMapOf<String, JsonElement>(
            "url" to JsonPrimitive(r.url), "name" to JsonPrimitive(r.name ?: nombre), "caption" to JsonPrimitive(""),
            "backgroundColor" to JsonPrimitive("default"),
        )
        if (bloque != "file") props["showPreview"] = JsonPrimitive(true)
        if (bloque == "image" || bloque == "video") props["textAlignment"] = JsonPrimitive("left")
        out.add(JsonObject(mapOf(
            "id" to JsonPrimitive(UUID.randomUUID().toString()), "type" to JsonPrimitive(bloque),
            "props" to JsonObject(props), "children" to JsonArray(emptyList()),
        )))
    }
    if (!texto.isNullOrBlank()) {
        for (linea in texto.lines().filter { it.isNotBlank() }) {
            val url = Regex("https?://\\S+").find(linea)
            val contenido = JsonArray(listOf(if (url != null && url.value == linea.trim()) enlace(url.value) else nodoTexto(linea)))
            out.add(parrafo(contenido))
        }
    }
    return out
}

/** Añade bloques al final de una página por operaciones (entran en el documento vivo). */
suspend fun añadeAlFinal(ctx: android.content.Context, pageId: String, bloques: List<JsonObject>) {
    val s = Servicios.de(ctx)
    val actuales = (s.repo.consulta("app.bloques", objeto("id" to pageId), cachear = false).comoObjeto["bloques"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
    var antes = actuales.lastOrNull()?.str("id")
    val ops = bloques.map { b ->
        val op = JsonObject(mapOf("op" to JsonPrimitive("upsert"), "block" to b) + (antes?.let { mapOf("afterId" to JsonPrimitive(it)) } ?: emptyMap()))
        antes = b.str("id")
        op
    }
    s.repo.mutacion("app.aplicar", objeto("id" to pageId, "ops" to ops), pagina = pageId, etiquetas = listOf("bloques:$pageId"))
}

@Composable
private fun Compartir(texto: String?, asunto: String?, archivos: List<Uri>, onListo: (String?) -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberAlcance()
    var q by remember { mutableStateOf("") }
    var paginas by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var trabajando by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(q) {
        paginas = runCatching {
            if (q.isBlank()) s.repo.consulta("pages.tree").comoLista.map { it.comoObjeto }.take(30)
            else s.repo.consulta("pages.search", objeto("query" to q), cachear = false).comoLista.map { it.comoObjeto }
        }.getOrDefault(emptyList()).distinctBy { it.str("id") }
    }
    fun guarda(destino: String?) {
        trabajando = "Guardando…"
        alcance.launch {
            try {
                val bloques = bloquesCompartidos(ctx, texto, archivos)
                val id = if (destino == null) {
                    val titulo = asunto?.takeIf { it.isNotBlank() } ?: texto?.lines()?.firstOrNull { it.isNotBlank() }?.take(80)
                        ?: archivos.firstOrNull()?.let { runCatching { Imagenes.nombre(ctx, it).substringBeforeLast('.') }.getOrNull() } ?: "Compartido"
                    val pagina = s.repo.mutacion("pages.create", objeto("title" to titulo), encolable = false, etiquetas = listOf("arbol"))?.comoObjeto?.str("id")!!
                    s.repo.mutacion("app.aplicar", objeto("id" to pagina, "ops" to bloques.mapIndexed { i, b ->
                        JsonObject(mapOf("op" to JsonPrimitive("upsert"), "block" to b) + (if (i > 0) mapOf("afterId" to JsonPrimitive(bloques[i - 1].str("id")!!)) else emptyMap()))
                    }), encolable = false)
                    pagina
                } else {
                    añadeAlFinal(ctx, destino, bloques)
                    destino
                }
                onListo(id)
            } catch (e: ErrorApi) {
                trabajando = if (e.sinConexion) "Sin conexión: inténtalo con red" else e.message
            } catch (e: Exception) {
                trabajando = e.message ?: "No se pudo guardar"
            }
        }
    }
    Column(Modifier.fillMaxSize().background(C.fondo).safeDrawingPadding().padding(16.dp)) {
        Text("Guardar en Notiono", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = C.texto)
        Text(listOfNotNull(texto?.take(200), archivos.size.takeIf { it > 0 }?.let { if (it == 1) "1 archivo" else "$it archivos" }).joinToString(" · "), fontSize = 13.sp, color = C.apagado, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(vertical = 8.dp))
        trabajando?.let { Text(it, color = Marca, fontSize = 14.sp) }
        Row(Modifier.fillMaxWidth().clickable(enabled = trabajando == null) { guarda(null) }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icono("file-plus", color = Marca)
            Text("Página nueva", fontSize = 16.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
        }
        Text("O añadir al final de…", fontSize = 13.sp, color = C.apagado)
        Campo(q, { q = it }, placeholder = "Buscar página…")
        LazyColumn(Modifier.fillMaxSize()) {
            items(paginas, key = { it.str("id") ?: "" }) { p ->
                Row(Modifier.fillMaxWidth().clickable(enabled = trabajando == null && p.str("type") != "database") { guarda(p.str("id")) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconoPagina(p.str("icon"), 20.dp)
                    Text(p.str("title")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
                }
            }
        }
    }
}
