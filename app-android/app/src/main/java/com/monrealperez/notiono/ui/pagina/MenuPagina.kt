package com.monrealperez.notiono.ui.pagina

import android.content.ClipData
import com.monrealperez.notiono.ui.comun.rememberAlcance
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.editor.Bloques
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.AccionesPagina
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Confirmar
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.HojaMover
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.panel.Importar
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Archivos
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/** El menú «⋯» de la página, como el de la web (sin lo que solo tiene sentido con ratón). */
@Composable
fun MenuPagina(info: PaginaInfo, onCerrar: () -> Unit, onComentarios: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    // En el de la app: casi todo se pide y la hoja se cierra en el mismo gesto (y con ella su alcance).
    val alcance = s.alcance
    var hoja by remember { mutableStateOf<String?>(null) }
    var borrar by remember { mutableStateOf(false) }
    val puede = com.monrealperez.notiono.ui.espacios.rememberPuede()
    val id = info.id
    fun accion(etiqueta: String, ruta: String, input: JsonObject, aviso: String? = null) {
        alcance.launch {
            try {
                s.repo.mutacion(ruta, input, pagina = id, etiquetas = listOf("pagina:$id", etiqueta))
                aviso?.let { Avisos.di(it) }
            } catch (e: ErrorApi) {
                Avisos.di(e.message ?: "No se pudo")
            }
        }
    }
    val importarCsv = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) alcance.launch { Importar.csvEnBd(ctx, uri, id) }
    }

    when (hoja) {
        "historial" -> { HojaHistorial(info) { hoja = null; onCerrar() }; return }
        "entrantes" -> { HojaEntrantes(id) { hoja = null; onCerrar() }; return }
        "publicar" -> { HojaPublicar(id) { hoja = null; onCerrar() }; return }
        "compartir" -> { HojaCompartir(id, info.publicToken != null, onPublicar = { hoja = "publicar" }) { hoja = null; onCerrar() }; return }
        "mover" -> { HojaMover(id) { hoja = null; onCerrar() }; return }
        "tipografia" -> {
            Hoja({ hoja = null; onCerrar() }, "Tipografía") {
                for ((f, t) in listOf("sans" to "Predeterminada", "serif" to "Serif", "mono" to "Monoespaciada")) {
                    FilaMenu(t, "type", derecha = { if (info.font == f) Icono("check", color = Marca) }) {
                        accion("arbol", "pages.setFont", objeto("id" to id, "font" to f)); hoja = null; onCerrar()
                    }
                }
            }
            return
        }
    }

    HojaLista(onCerrar) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconoPagina(info.icon, 20.dp, porDefecto = if (info.esBd) "database" else "file-text")
            Text(info.title.ifBlank { "Sin título" }, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.padding(start = 8.dp))
        }
        FilaMenu(if (info.favorita) "Quitar de favoritos" else "Añadir a favoritos", if (info.favorita) "star-off" else "star") {
            alcance.launch { AccionesPagina.favorito(s.repo, id) }; onCerrar()
        }
        FilaMenu(if (info.siguiendo) "Dejar de seguir" else "Seguir la página", "bell", detalle = "Te avisa cuando otra persona la edita") {
            accion("bandeja", "pages.toggleFollow", objeto("pageId" to id), if (info.siguiendo) "Ya no la sigues" else "La sigues"); onCerrar()
        }
        FilaMenu("Comentarios", "message-square") { onComentarios() }
        FilaMenu("Copiar enlace", "link") {
            val cm = ctx.getSystemService(android.content.ClipboardManager::class.java)
            cm.setPrimaryClip(ClipData.newPlainText("Notiono", "${BuildConfig.BASE_URL}/p/$id"))
            Avisos.di("Enlace copiado"); onCerrar()
        }
        FilaMenu("Compartir enlace", "share-2", detalle = "Para quien ya tiene acceso a Notiono") {
            com.monrealperez.notiono.util.Enlaces.lanza(
                ctx,
                Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, info.title.ifBlank { "Sin título" })
                    .putExtra(Intent.EXTRA_TEXT, "${BuildConfig.BASE_URL}/p/$id"), "Compartir enlace"),
            )
            onCerrar()
        }
        // Como en la web: solo con acceso total y sin ser invitado (el «Compartir» de Notion).
        if (puede.compartir(info.nivel)) FilaMenu("Compartir", "user-plus", detalle = if (info.publicToken != null) "Invitar personas · publicada en la web" else "Invitar personas o publicar en la web") { hoja = "compartir" }
        Separador(Modifier.padding(vertical = 4.dp))
        if (info.puedeEditar) {
            FilaMenu(if (info.locked) "Desbloquear página" else "Bloquear página", if (info.locked) "lock-open" else "lock",
                detalle = "Evita cambios sin querer") {
                accion("arbol", "pages.setLocked", objeto("id" to id, "value" to !info.locked)); onCerrar()
            }
            FilaMenu("Tipografía", "type", detalle = when (info.font) { "serif" -> "Serif"; "mono" -> "Monoespaciada"; else -> "Predeterminada" }) { hoja = "tipografia" }
            if (puede.organizar) {
                FilaMenu("Mover a…", "folder-input") { hoja = "mover" }
                FilaMenu("Duplicar", "copy-plus") {
                    alcance.launch { AccionesPagina.duplicar(s.repo, id)?.let { n.pagina(it) } }; onCerrar()
                }
            }
        }
        if (!info.esBd) FilaMenu("Historial de versiones", "history") { hoja = "historial" }
        FilaMenu("Enlaces entrantes", "corner-down-right") { hoja = "entrantes" }
        Separador(Modifier.padding(vertical = 4.dp))
        if (info.esBd) {
            // Exportar e importar CSV miran la base entera por su colección: no para invitados.
            if (puede.organizar) FilaMenu("Exportar a CSV", "file-down") {
                alcance.launch { Archivos.exportaCsv(ctx, id) }; onCerrar()
            }
            if (info.puedeEditar && puede.organizar) FilaMenu("Importar CSV en esta base de datos", "file-up") {
                importarCsv.launch(arrayOf("text/*", "text/csv", "application/octet-stream"))
            }
        } else {
            FilaMenu("Exportar a Markdown", "file-down") {
                alcance.launch { Archivos.exportaMarkdown(ctx, id) }; onCerrar()
            }
        }
        FilaMenu("Abrir en el navegador", "external-link") {
            com.monrealperez.notiono.util.Enlaces.abre(ctx, "${BuildConfig.BASE_URL}/p/$id"); onCerrar()
        }
        if (info.puedeEditar && puede.organizar) {
            Separador(Modifier.padding(vertical = 4.dp))
            FilaMenu("Enviar a la papelera", "trash-2", color = Color(0xFFD44C47)) { borrar = true }
        }
    }
    if (borrar) Confirmar("¿Enviar a la papelera?", "Se va con sus subpáginas. Puedes recuperarla desde la papelera durante 30 días.", boton = "Enviar", onSi = {
        borrar = false
        alcance.launch {
            AccionesPagina.archivar(s.repo, id) { alcance.launch { AccionesPagina.restaurar(s.repo, id) } }
            n.atras()
        }
        onCerrar()
    }, onNo = { borrar = false })
}

/** Comentarios de una página o de una fila (como el panel de la web): ver, responder, resolver. */
@Composable
fun HojaComentarios(pageId: String, recordId: String?, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val alcance = rememberAlcance()
    val input = if (recordId != null) objeto("pageId" to pageId, "recordId" to recordId) else objeto("pageId" to pageId)
    val etiqueta = "comentarios:$pageId:${recordId.orEmpty()}"
    val q = rememberConsulta("comments.list", input, etiquetas = setOf(etiqueta), cadaMs = 20_000)
    val lista = q.datos?.comoLista?.map { it.comoObjeto }
    var texto by remember { mutableStateOf("") }
    var verResueltos by remember { mutableStateOf(false) }
    fun muta(ruta: String, inp: JsonObject) = alcance.launch {
        try {
            s.repo.mutacion(ruta, inp, etiquetas = listOf(etiqueta, "bandeja"))
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo")
        }
    }
    Hoja(onCerrar, "Comentarios", completa = true) {
        Column(Modifier.heightIn(min = 200.dp, max = 520.dp).padding(horizontal = 16.dp).let { it }) {
            val visibles = lista?.filter { verResueltos || !it.bool("resolved") }
            if (lista?.any { it.bool("resolved") } == true) {
                TextButton({ verResueltos = !verResueltos }) { Text(if (verResueltos) "Ocultar resueltos" else "Ver resueltos", color = C.apagado, fontSize = 13.sp) }
            }
            if (visibles != null && visibles.isEmpty()) Vacio("Aún no hay comentarios.", icono = "message-square")
            androidx.compose.foundation.lazy.LazyColumn(Modifier.weight(1f, fill = false)) {
                items(visibles?.size ?: 0) { i ->
                    val c = visibles!![i]
                    val autor = c.obj("author")
                    val mio = autor?.str("id") == s.sesion.usuarioId
                    val nombre = autor?.let { it.str("name")?.ifBlank { null } ?: it.str("email") } ?: "Alguien"
                    Row(Modifier.padding(vertical = 8.dp)) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(C.activo), contentAlignment = Alignment.Center) {
                            Text(nombre.take(1).uppercase(), fontWeight = FontWeight.Bold, fontSize = 13.sp, color = C.texto)
                        }
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(nombre, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = C.texto)
                                Text("  " + Fechas.haceCuanto(c.str("createdAt")), fontSize = 12.sp, color = C.apagado)
                            }
                            Text(c.str("body").orEmpty(), fontSize = 14.sp, color = if (c.bool("resolved")) C.apagado else C.texto)
                            val reacciones = (c.obj("reactions") ?: JsonObject(emptyMap())).mapValues { (_, v) -> (v as? JsonArray)?.size ?: 0 }.filterValues { it > 0 }
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                for ((emoji, cuantas) in reacciones) {
                                    Text("$emoji $cuantas", fontSize = 12.sp, modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(C.hover)
                                        .clickable { muta("comments.react", objeto("id" to c.str("id"), "emoji" to emoji)) }.padding(horizontal = 6.dp, vertical = 2.dp))
                                }
                                Text("👍", fontSize = 14.sp, modifier = Modifier.clickable { muta("comments.react", objeto("id" to c.str("id"), "emoji" to "👍")) }.padding(4.dp))
                                Text(if (c.bool("resolved")) "Reabrir" else "Resolver", fontSize = 12.sp, color = C.apagado,
                                    modifier = Modifier.clickable { muta("comments.toggleResolve", objeto("id" to c.str("id"))) }.padding(4.dp))
                                if (mio) Text("Borrar", fontSize = 12.sp, color = Color(0xFFD44C47),
                                    modifier = Modifier.clickable { muta("comments.remove", objeto("id" to c.str("id"))) }.padding(4.dp))
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().imePadding().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { Campo(texto, { texto = it }, placeholder = "Añade un comentario… (@nombre para avisar)", unaLinea = false) }
                com.monrealperez.notiono.ui.comun.BotonIcono("send", {
                    val t = texto.trim()
                    if (t.isNotEmpty()) {
                        texto = ""
                        val inp = if (recordId != null) objeto("pageId" to pageId, "recordId" to recordId, "body" to t) else objeto("pageId" to pageId, "body" to t)
                        muta("comments.add", inp)
                    }
                }, color = Marca)
            }
        }
    }
}

/** Historial de versiones: ver cómo estaba y restaurar (por operaciones, para que llegue al documento vivo). */
@Composable
fun HojaHistorial(info: PaginaInfo, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val alcance = rememberAlcance()
    val q = rememberConsulta("pages.versions.list", objeto("pageId" to info.id))
    val lista = q.datos?.comoLista?.map { it.comoObjeto }
    var viendo by remember { mutableStateOf<JsonObject?>(null) }
    val v = viendo
    if (v != null) {
        val bloques = (v["snapshot"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
        HojaLista({ viendo = null }, "Versión de ${Fechas.fechaHora(v.str("createdAt"))}") {
            Text(Bloques.textoPlano(bloques).ifBlank { "(vacía)" }, fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(16.dp))
            if (info.puedeEditar) TextButton({
                alcance.launch {
                    try {
                        val actuales = s.repo.consulta("app.bloques", objeto("id" to info.id), cachear = false).comoObjeto["bloques"]
                        val ops = Bloques.reemplazaTodo((actuales as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList(), bloques)
                        s.repo.mutacion("app.aplicar", objeto("id" to info.id, "ops" to ops), encolable = false, etiquetas = listOf("pagina:${info.id}", "bloques:${info.id}"))
                        Avisos.di("Versión restaurada")
                        onCerrar()
                    } catch (e: ErrorApi) {
                        Avisos.di(e.message ?: "No se pudo restaurar")
                    }
                }
            }, Modifier.padding(horizontal = 8.dp)) { Text("Restaurar esta versión", color = Marca) }
        }
        return
    }
    HojaLista(onCerrar, "Historial de versiones") {
        if (lista != null && lista.isEmpty()) Vacio("Aún no hay versiones guardadas.", icono = "history")
        for (ver in lista ?: emptyList()) {
            FilaMenu(Fechas.fechaHora(ver.str("createdAt")), "history", detalle = ver.str("author") ?: "—") { viendo = ver }
        }
    }
}

/** Enlaces entrantes: páginas que mencionan a esta. */
@Composable
fun HojaEntrantes(id: String, onCerrar: () -> Unit) {
    val n = LocalNavegador.current
    val q = rememberConsulta("pages.backlinks", objeto("id" to id))
    val lista = q.datos?.comoLista?.map { it.comoObjeto }
    HojaLista(onCerrar, "Enlaces entrantes") {
        if (lista != null && lista.isEmpty()) Vacio("Ninguna página enlaza a esta todavía.", icono = "corner-down-right")
        for (p in lista ?: emptyList()) {
            Row(Modifier.fillMaxWidth().clickable { onCerrar(); n.pagina(p.str("id")!!) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                IconoPagina(p.str("icon"), 18.dp)
                Text(p.str("title")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 10.dp))
            }
        }
    }
}

/** Publicar en la web (/s/<token>): activar, copiar enlace, caducidad y contraseña. */
@Composable
fun HojaPublicar(id: String, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberAlcance()
    val q = rememberConsulta("app.pagina", objeto("id" to id), etiquetas = setOf("pagina:$id"))
    val info = q.datos?.comoObjeto
    var clave by remember { mutableStateOf("") }
    var caduca by remember { mutableStateOf("") }
    fun muta(ruta: String, inp: JsonObject, aviso: String) = alcance.launch {
        try {
            s.repo.mutacion(ruta, inp, encolable = false, etiquetas = listOf("pagina:$id"))
            Avisos.di(aviso)
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo")
        }
    }
    val token = info?.str("publicToken")
    val url = token?.let { "${BuildConfig.BASE_URL}/s/$it" }
    HojaLista(onCerrar, "Publicar en la web") {
        FilaMenu("Publicada", "globe", detalle = "Cualquiera con el enlace la ve, sin cuenta", derecha = {
            Switch(token != null, { si -> if (si) muta("pages.publish", objeto("id" to id), "Publicada") else muta("pages.unpublish", objeto("id" to id), "Ya no está publicada") },
                colors = SwitchDefaults.colors(checkedTrackColor = Marca))
        }) {}
        if (url != null) {
            Text(url, fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
            Row(Modifier.padding(horizontal = 8.dp)) {
                TextButton({
                    ctx.getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Notiono", url))
                    Avisos.di("Enlace copiado")
                }) { Text("Copiar enlace", color = Marca) }
                TextButton({
                    com.monrealperez.notiono.util.Enlaces.lanza(ctx, Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url), "Compartir"))
                }) { Text("Compartir…", color = Marca) }
            }
            Separador()
            Text("Caduca", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(start = 16.dp, top = 8.dp))
            Text(info.str("publicExpiresAt")?.let { "El enlace deja de funcionar el " + Fechas.largo(it) } ?: "No caduca",
                fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(horizontal = 16.dp))
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { Campo(caduca, { caduca = it }, placeholder = "AAAA-MM-DD") }
                TextButton({ muta("pages.setPublicOptions", objeto("id" to id, "expiresAt" to caduca.ifBlank { null }), "Guardado") }) { Text("Guardar", color = Marca) }
            }
            Text("Contraseña", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(start = 16.dp, top = 8.dp))
            Text(if (info.bool("hasPublicPassword")) "Pide contraseña" else "Sin contraseña", fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(horizontal = 16.dp))
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { Campo(clave, { clave = it }, placeholder = "Nueva contraseña (vacía = quitar)") }
                TextButton({ muta("pages.setPublicOptions", objeto("id" to id, "password" to clave.ifBlank { null }), "Guardado"); clave = "" }) { Text("Guardar", color = Marca) }
            }
        }
    }
}
