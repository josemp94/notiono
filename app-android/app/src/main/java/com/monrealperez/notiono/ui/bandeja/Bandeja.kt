package com.monrealperez.notiono.ui.bandeja

import androidx.compose.foundation.background
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.ui.Alignment
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.comun.Icono
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.emojiDe
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/** Bandeja de entrada: menciones, asignaciones, comentarios, fechas que vencen y páginas que sigo. */
@Composable
fun PantallaBandeja() {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val q = rememberConsulta("notifications.list", etiquetas = setOf("bandeja", "espacio"), cadaMs = 30_000)
    val lista = q.datos?.comoLista?.map { it.comoObjeto }?.distinctBy { it.str("id") }
    Column(Modifier.fillMaxSize()) {
        BarraSuperior("Bandeja de entrada", izquierda = { BotonIcono("panel-left", n.abrirPanel) }, acciones = {
            if (lista?.any { !it.bool("read") } == true) {
                TextButton({
                    alcance.launch {
                        runCatching { s.repo.mutacion("notifications.markAllRead", etiquetas = listOf("bandeja")) }
                    }
                }) { Text("Marcar todas como leídas", fontSize = 13.sp, color = C.apagado) }
            }
        })
        when {
            lista == null -> Esqueleto()
            lista.isEmpty() -> Vacio("Nada por aquí: ni menciones ni vencimientos.", icono = "inbox")
            else -> LazyColumn {
                items(lista, key = { it.str("id") ?: "" }) { a ->
                    val leida = a.bool("read")
                    fun marcaLeida() = alcance.launch {
                        if (!leida) runCatching { s.repo.mutacion("notifications.markRead", objeto("id" to a.str("id")), etiquetas = listOf("bandeja")) }
                    }
                    // Deslizar a cualquier lado la marca como leída (como la Bandeja de Notion).
                    val gesto = rememberSwipeToDismissBoxState()
                    SwipeToDismissBox(
                        gesto,
                        backgroundContent = {
                            Row(
                                Modifier.fillMaxSize().background(C.marcaSuave).padding(horizontal = 20.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = if (gesto.dismissDirection == SwipeToDismissBoxValue.EndToStart) Arrangement.End else Arrangement.Start,
                            ) {
                                Icono("check-check", color = Marca)
                                Text("  Leída", color = Marca, fontSize = 14.sp)
                            }
                        },
                        gesturesEnabled = !leida,
                        onDismiss = {
                            marcaLeida()
                            alcance.launch { gesto.reset() }
                        },
                    ) {
                        Row(
                            Modifier.fillMaxWidth().background(C.fondo).clickable {
                                marcaLeida()
                                abreAviso(n, a)
                            }.padding(horizontal = 16.dp, vertical = 12.dp),
                        ) {
                            Box(Modifier.padding(top = 7.dp, end = 10.dp).size(8.dp).clip(CircleShape).background(if (leida) Color.Transparent else Marca))
                            Column(Modifier.weight(1f)) {
                                Text(textoAviso(a), fontSize = 14.sp, color = if (leida) C.apagado else C.texto)
                                Text(Fechas.haceCuanto(a.str("createdAt")), fontSize = 12.sp, color = C.apagado)
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Abre el aviso donde ocurrió: un vencimiento, en la ficha de su fila (su clave es
 * `due:<fila>:<campo>:<día>`); lo demás, en su página.
 */
fun abreAviso(n: Navegador, a: JsonObject) {
    val pagina = a.obj("page")?.str("id") ?: return
    val fila = filaDeAviso(a)
    if (fila != null) n.fila(pagina, fila) else n.pagina(pagina)
}

private fun filaDeAviso(a: JsonObject) = a.str("key")?.takeIf { a.str("type") == "due" }?.split(":")?.getOrNull(1)

/** Lo mismo como enlace de la app, para la notificación del sistema. */
fun enlaceDeAviso(a: JsonObject): String {
    val pagina = a.obj("page")?.str("id") ?: return "notiono://bandeja"
    return filaDeAviso(a)?.let { "notiono://fila/$pagina/$it" } ?: "notiono://pagina/$pagina"
}

/** El texto de cada aviso, como en la web (Bandeja.tsx). */
fun textoAviso(a: JsonObject) = buildAnnotatedString {
    val actor = a.obj("actor")?.let { it.str("name")?.ifBlank { null } ?: it.str("email") } ?: "Alguien"
    val pagina = a.obj("page")?.let { emojiDe(it.str("icon")) + (it.str("title")?.ifBlank { null } ?: "Sin título") }
    val titulo = a.str("title")?.ifBlank { null }
    fun negrita(t: String) = withStyle(SpanStyle(fontWeight = FontWeight.Medium)) { append(t) }
    when (a.str("type")) {
        "due" -> { append("Te toca: "); negrita(titulo ?: "una tarea"); append(" en «${pagina ?: "una base borrada"}»") }
        "comment" -> { negrita(actor); append(" comentó en «${pagina ?: "una página borrada"}»"); if (titulo != null) append(": «$titulo»") }
        "assign" -> { negrita(actor); append(" te asignó "); negrita(titulo ?: "una tarea"); append(" en «${pagina ?: "una base borrada"}»") }
        "form" -> { append("Nueva respuesta del formulario de «${pagina ?: "una base borrada"}»"); if (titulo != null) append(": «$titulo»") }
        "follow" -> { negrita(actor); append(" editó «${pagina ?: "una página borrada"}», que sigues") }
        else -> { negrita(actor); append(" te mencionó en «${pagina ?: "una página borrada"}»") }
    }
}
