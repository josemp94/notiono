package com.monrealperez.notiono.ui.pagina

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.ui.comun.AccionesPagina
import com.monrealperez.notiono.ui.comun.BandaPortada
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** La tipografía de la página (el «Style» de Notion). */
fun familia(font: String): FontFamily = when (font) {
    "serif" -> FontFamily.Serif
    "mono" -> FontFamily.Monospace
    else -> FontFamily.SansSerif
}

/**
 * Cabecera de una página o BD: portada, icono y título grande, como en la web.
 * El título se guarda solo (a los 600 ms de dejar de escribir) y avisa al árbol.
 */
@Composable
fun Cabecera(info: PaginaInfo, editable: Boolean, enfocarTitulo: Boolean = false, compacta: Boolean = false, onEnter: () -> Unit = {}) {
    val s = Servicios.de(LocalContext.current)
    val alcance = rememberCoroutineScope()
    var titulo by remember(info.id) { mutableStateOf(info.title) }
    var icono by remember(info.id) { mutableStateOf(info.icon) }
    var portada by remember(info.id) { mutableStateOf(info.cover) }
    var eligeIcono by remember { mutableStateOf(false) }
    var eligePortada by remember { mutableStateOf(false) }
    val foco = remember { FocusRequester() }
    // Si otro la renombra mientras no la toco, adoptar el nombre nuevo.
    LaunchedEffect(info.title) { if (titulo != info.title) titulo = info.title }
    LaunchedEffect(info.icon) { icono = info.icon }
    LaunchedEffect(info.cover) { portada = info.cover }
    LaunchedEffect(titulo) {
        if (titulo == info.title) return@LaunchedEffect
        delay(600)
        AccionesPagina.renombrar(s.repo, info.id, titulo)
    }
    if (enfocarTitulo) LaunchedEffect(Unit) { runCatching { foco.requestFocus() } }

    Column(Modifier.fillMaxWidth()) {
        portada?.let { BandaPortada(it, Modifier.fillMaxWidth().height(if (compacta) 90.dp else 150.dp).clickable(enabled = editable) { eligePortada = true }) }
        Column(Modifier.padding(horizontal = 20.dp).padding(top = if (portada != null) 0.dp else 16.dp)) {
            if (icono != null) {
                Box(Modifier.offset(y = if (portada != null) (-30).dp else 0.dp).clip(RoundedCornerShape(8.dp)).clickable(enabled = editable) { eligeIcono = true }) {
                    IconoPagina(icono, if (compacta) 44.dp else 60.dp)
                }
            }
            if (editable && (icono == null || portada == null)) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(bottom = 4.dp)) {
                    if (icono == null) BotonCabecera("smile", "Añadir icono") { eligeIcono = true }
                    if (portada == null) BotonCabecera("image", "Añadir portada") { eligePortada = true }
                }
            }
            BasicTextField(
                titulo,
                { titulo = it.replace("\n", "") },
                readOnly = !editable,
                textStyle = TextStyle(fontSize = if (compacta) 26.sp else 30.sp, fontWeight = FontWeight.Bold, color = C.texto, lineHeight = 36.sp, fontFamily = familia(info.font)),
                cursorBrush = SolidColor(Marca),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { onEnter() }),
                modifier = Modifier.fillMaxWidth().focusRequester(foco).padding(vertical = 4.dp),
                decorationBox = { campo ->
                    Box {
                        if (titulo.isEmpty()) Text("Sin título", fontSize = if (compacta) 26.sp else 30.sp, fontWeight = FontWeight.Bold, color = C.borde, fontFamily = familia(info.font))
                        campo()
                    }
                },
            )
            info.editadoPor?.let { Text("Editado por $it", fontSize = 12.sp, color = C.apagado) }
        }
    }
    if (eligeIcono) SelectorIcono({ nuevo ->
        eligeIcono = false
        icono = nuevo
        alcance.launch { AccionesPagina.renombrar(s.repo, info.id, titulo, nuevo, conIcono = true) }
    }, { eligeIcono = false })
    if (eligePortada) SelectorPortada({ nueva ->
        eligePortada = false
        portada = nueva
        alcance.launch {
            runCatching { s.repo.mutacion("pages.setCover", objeto("id" to info.id, "cover" to nueva), pagina = info.id, etiquetas = listOf("pagina:${info.id}")) }
        }
    }, { eligePortada = false })
}

@Composable
private fun BotonCabecera(icono: String, texto: String, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(6.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icono(icono, tam = 16.dp, color = C.apagado)
        Text(texto, fontSize = 14.sp, color = C.apagado, modifier = Modifier.padding(start = 6.dp))
    }
}
