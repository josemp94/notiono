package com.monrealperez.notiono.ui.comun

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.flow.MutableSharedFlow

/** Lo que dice TalkBack de cada botón de solo icono. */
private val ETIQUETAS_BOTON = mapOf(
    "arrow-left" to "Atrás", "panel-left" to "Abrir panel", "message-square" to "Comentarios", "ellipsis" to "Más opciones",
    "chevron-left" to "Anterior", "chevron-right" to "Siguiente", "x" to "Cerrar", "undo-2" to "Deshacer", "trash-2" to "Borrar",
    "table" to "Abrir la base de datos", "sliders-horizontal" to "Ajustes de la vista", "send" to "Enviar", "search" to "Buscar",
    "refresh-cw" to "Refrescar", "list-filter" to "Filtrar", "arrow-up-down" to "Ordenar",
)

/** Botón de icono con zona de toque de 40 dp (la `.toque` de la web). */
@Composable
fun BotonIcono(icono: String, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = C.apagado, tam: Dp = 20.dp, activo: Boolean = true) {
    Box(
        modifier.size(40.dp).clip(RoundedCornerShape(8.dp)).clickable(enabled = activo, onClickLabel = null, role = Role.Button, onClick = onClick)
            .semantics { ETIQUETAS_BOTON[icono]?.let { contentDescription = it } },
        contentAlignment = Alignment.Center,
    ) { Icono(icono, tam = tam, color = if (activo) color else color.copy(alpha = 0.4f)) }
}

/** Barra de arriba de cada pantalla: botón izquierdo (panel o atrás), título y acciones. */
@Composable
fun BarraSuperior(
    titulo: String? = null,
    izquierda: (@Composable () -> Unit)? = null,
    acciones: @Composable RowScope.() -> Unit = {},
    centro: (@Composable RowScope.() -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().background(C.fondo).statusBarsPadding().height(52.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        izquierda?.invoke()
        Row(Modifier.weight(1f).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (centro != null) centro()
            else if (titulo != null) Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = C.texto)
        }
        acciones()
    }
}

/** Fila de un menú u hoja: icono, texto y lo que haga falta a la derecha. */
@Composable
fun FilaMenu(
    texto: String,
    icono: String? = null,
    modifier: Modifier = Modifier,
    color: Color = C.texto,
    detalle: String? = null,
    derecha: (@Composable () -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 44.dp)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (icono != null) Icono(icono, color = if (color == C.texto) C.apagado else color)
        Column(Modifier.weight(1f)) {
            Text(texto, color = color, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (detalle != null) Text(detalle, color = C.apagado, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        derecha?.invoke()
    }
}

@Composable
fun Separador(modifier: Modifier = Modifier) = HorizontalDivider(modifier, color = C.borde, thickness = 1.dp)

@Composable
fun TituloSeccion(texto: String, modifier: Modifier = Modifier, accion: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(texto, color = C.apagado, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        accion?.invoke()
    }
}

/** Hoja inferior (los menús de Notion en Android salen así). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Hoja(onCerrar: () -> Unit, titulo: String? = null, completa: Boolean = false, contenido: @Composable ColumnScope.() -> Unit) {
    val estado = rememberModalBottomSheetState(skipPartiallyExpanded = completa)
    ModalBottomSheet(onDismissRequest = onCerrar, sheetState = estado, containerColor = C.fondo, contentColor = C.texto) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 8.dp)) {
            if (titulo != null) {
                Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }
            contenido()
        }
    }
}

/** Hoja con scroll propio para listas largas. */
@Composable
fun HojaLista(onCerrar: () -> Unit, titulo: String? = null, contenido: @Composable ColumnScope.() -> Unit) =
    Hoja(onCerrar, titulo) { Column(Modifier.verticalScroll(rememberScrollState())) { contenido() } }

@Composable
fun Confirmar(titulo: String, texto: String, boton: String = "Borrar", peligro: Boolean = true, onSi: () -> Unit, onNo: () -> Unit) {
    AlertDialog(
        onDismissRequest = onNo,
        containerColor = C.fondo,
        title = { Text(titulo) },
        text = { Text(texto, color = C.apagado) },
        confirmButton = { TextButton(onClick = onSi) { Text(boton, color = if (peligro) Color(0xFFD44C47) else Marca) } },
        dismissButton = { TextButton(onClick = onNo) { Text("Cancelar", color = C.texto) } },
    )
}

/** Pedir un texto (renombrar, enlace, nombre de vista…). */
@Composable
fun PedirTexto(titulo: String, inicial: String = "", placeholder: String = "", boton: String = "Guardar", onOk: (String) -> Unit, onNo: () -> Unit) {
    var t by remember { mutableStateOf(inicial) }
    AlertDialog(
        onDismissRequest = onNo,
        containerColor = C.fondo,
        title = { Text(titulo) },
        text = { Campo(t, { t = it }, placeholder = placeholder, autofoco = true) },
        confirmButton = { TextButton(onClick = { onOk(t) }) { Text(boton, color = Marca) } },
        dismissButton = { TextButton(onClick = onNo) { Text("Cancelar", color = C.texto) } },
    )
}

@Composable
fun Campo(
    valor: String,
    onCambio: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    autofoco: Boolean = false,
    unaLinea: Boolean = true,
    teclado: androidx.compose.foundation.text.KeyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default,
) {
    val foco = remember { androidx.compose.ui.focus.FocusRequester() }
    OutlinedTextField(
        valor, onCambio,
        modifier = modifier.fillMaxWidth().let { if (autofoco) it.focusRequester(foco) else it },
        placeholder = { Text(placeholder, color = C.apagado) },
        singleLine = unaLinea,
        keyboardOptions = teclado,
        shape = RoundedCornerShape(8.dp),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Marca, unfocusedBorderColor = C.borde, cursorColor = Marca),
    )
    if (autofoco) androidx.compose.runtime.LaunchedEffect(Unit) { runCatching { foco.requestFocus() } }
}

/** Esqueleto mientras carga. */
@Composable
fun Esqueleto(lineas: Int = 4, modifier: Modifier = Modifier) {
    Column(modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(lineas) { i ->
            Box(Modifier.fillMaxWidth(if (i % 3 == 2) 0.6f else 1f).height(18.dp).clip(RoundedCornerShape(4.dp)).background(C.hover))
        }
    }
}

@Composable
fun Vacio(texto: String, modifier: Modifier = Modifier, icono: String? = null) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (icono != null) {
            Icono(icono, tam = 28.dp, color = C.apagado)
            Spacer(Modifier.height(8.dp))
        }
        Text(texto, color = C.apagado, fontSize = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/** Avisos breves («Página creada», «Sin conexión: se enviará después»), con acción opcional. */
data class Aviso(val texto: String, val accion: String? = null, val alPulsar: (() -> Unit)? = null)

object Avisos {
    val flujo = MutableSharedFlow<Aviso>(extraBufferCapacity = 8)
    fun di(texto: String, accion: String? = null, alPulsar: (() -> Unit)? = null) {
        flujo.tryEmit(Aviso(texto, accion, alPulsar))
    }
}

@Composable
fun Chip(texto: String, fondo: Color, modifier: Modifier = Modifier, tinta: Color = C.texto) {
    Text(
        texto,
        color = tinta,
        fontSize = 13.sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.clip(RoundedCornerShape(4.dp)).background(fondo).padding(horizontal = 6.dp, vertical = 1.dp),
    )
}

@Composable
fun Hueco(w: Dp = 0.dp, h: Dp = 0.dp) = Spacer(Modifier.width(w).height(h))
