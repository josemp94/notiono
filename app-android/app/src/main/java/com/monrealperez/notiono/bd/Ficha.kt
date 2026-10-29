package com.monrealperez.notiono.bd

import android.content.ClipData
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.editor.EditorBloques
import com.monrealperez.notiono.editor.Fuente
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/**
 * La ficha de una fila (fila = página, como en Notion): título, todas sus propiedades
 * editables según su tipo, subtareas y el cuerpo con el mismo editor de bloques.
 */
@Composable
fun PantallaFicha(pageId: String, recordId: String, onBorrada: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val est = remember(pageId, recordId) { EstadoBD(pageId, s, alcance).apply { soloFila = recordId; cacheada() } }
    LaunchedEffect(recordId) { est.carga() }
    LaunchedEffect(recordId) { s.repo.cambios.collect { if (it == "vista:$pageId") est.recarga() } }
    val fila = est.filaActual
    if (fila == null) {
        if (est.error != null) Vacio(est.error?.message ?: "Esta fila ya no existe.", icono = "file-text") else Esqueleto(6)
        return
    }
    var editando by remember { mutableStateOf<Campo?>(null) }
    var menu by remember { mutableStateOf(false) }
    var nuevaPropiedad by remember { mutableStateOf(false) }
    val titulo = est.titulo
    EditorBloques(
        fuente = Fuente(recordId, esFila = true),
        editable = est.editable,
        pageId = pageId,
        cabecera = { _ ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                // Título (la celda del campo título), guardado solo al dejar de escribir.
                var t by remember(fila.id) { mutableStateOf(est.tituloDe(fila).takeIf { it != "Sin título" }.orEmpty()) }
                LaunchedEffect(t) {
                    val actual = est.tituloDe(fila).takeIf { it != "Sin título" }.orEmpty()
                    if (t == actual || titulo == null) return@LaunchedEffect
                    delay(600)
                    est.ponCelda(fila.id, titulo.id, if (t.isBlank()) null else JsonPrimitive(t))
                }
                Row(verticalAlignment = Alignment.Top) {
                    BasicTextField(
                        t, { t = it.replace("\n", "") }, readOnly = !est.editable,
                        textStyle = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, color = C.texto),
                        cursorBrush = SolidColor(Marca),
                        modifier = Modifier.weight(1f),
                        decorationBox = { campo -> Box { if (t.isEmpty()) Text("Sin título", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = C.borde); campo() } },
                    )
                    BotonIcono("ellipsis", { menu = true })
                }
                // Propiedades.
                for (c in est.campos.filter { it.id != titulo?.id }) {
                    Row(Modifier.fillMaxWidth().heightIn(min = 38.dp).clickable {
                        when {
                            c.type == "checkbox" && est.editable -> est.ponCelda(fila.id, c.id, JsonPrimitive((est.celdas(fila)[c.id] as? JsonPrimitive)?.content != "true"))
                            c.type == "button" -> pulsaBoton(est, fila, c) { n.pagina(it) }
                            est.editable && c.type !in CAMPOS_AUTOMATICOS -> editando = c
                        }
                    }.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
                        Row(Modifier.width(130.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icono(iconoCampo(c.type), tam = 15.dp, color = C.apagado)
                            Text(c.name.ifBlank { "Sin nombre" }, fontSize = 14.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp))
                        }
                        Box(Modifier.weight(1f)) { ValorCelda(est, fila, c, unaLinea = false, enFicha = true) }
                    }
                }
                if (est.editable) Text("+ Añadir una propiedad", fontSize = 14.sp, color = C.apagado, modifier = Modifier.clickable { nuevaPropiedad = true }.padding(vertical = 8.dp))
                // Subtareas.
                if (est.subtareas.isNotEmpty() || est.editable) {
                    Text("Subtareas", fontSize = 13.sp, color = C.apagado, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 10.dp, bottom = 4.dp))
                    for (st in est.subtareas) Row(Modifier.fillMaxWidth().clickable { n.fila(pageId, st.id) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icono("corner-down-right", tam = 15.dp, color = C.apagado)
                        Text(est.tituloDe(st), fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 6.dp))
                    }
                    if (est.editable) Text("+ Añadir subtarea", fontSize = 14.sp, color = C.apagado, modifier = Modifier.clickable {
                        alcance.launch { est.subtarea(fila.id)?.let { n.fila(pageId, it) } }
                    }.padding(vertical = 6.dp))
                }
                Separador(Modifier.padding(top = 8.dp))
            }
        },
    )
    editando?.let { c -> EditorCelda(est, fila, c) { editando = null } }
    if (nuevaPropiedad) HojaNuevoCampo(est, null) { nuevaPropiedad = false }
    if (menu) {
        val ctx = LocalContext.current
        com.monrealperez.notiono.ui.comun.Hoja({ menu = false }, est.tituloDe(fila)) {
            com.monrealperez.notiono.ui.comun.FilaMenu("Copiar enlace", "link") {
                ctx.getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Notiono", "${BuildConfig.BASE_URL}/p/$pageId?r=$recordId"))
                Avisos.di("Enlace copiado"); menu = false
            }
            com.monrealperez.notiono.ui.comun.FilaMenu("Exportar a Word", "file-text") {
                s.alcance.launch { com.monrealperez.notiono.util.Archivos.exportaWord(ctx, pageId, recordId) }; menu = false
            }
            if (est.editable) {
                com.monrealperez.notiono.ui.comun.FilaMenu("Duplicar", "copy-plus") { est.duplicaFila(fila.id); menu = false }
                com.monrealperez.notiono.ui.comun.FilaMenu("Borrar", "trash-2", color = androidx.compose.ui.graphics.Color(0xFFD44C47)) {
                    est.borraFila(fila.id); menu = false; onBorrada()
                }
            }
        }
    }
}
