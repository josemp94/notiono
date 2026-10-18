package com.monrealperez.notiono.ui.bandeja

import androidx.compose.foundation.background
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
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
    val alcance = rememberCoroutineScope()
    val q = rememberConsulta("notifications.list", etiquetas = setOf("bandeja", "espacio"), cadaMs = 30_000)
    val lista = q.datos?.comoLista?.map { it.comoObjeto }
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
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            alcance.launch {
                                if (!a.bool("read")) runCatching { s.repo.mutacion("notifications.markRead", objeto("id" to a.str("id")), etiquetas = listOf("bandeja")) }
                            }
                            a.obj("page")?.str("id")?.let { n.pagina(it) }
                        }.padding(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        Box(Modifier.padding(top = 7.dp, end = 10.dp).size(8.dp).clip(CircleShape).background(if (a.bool("read")) Color.Transparent else Marca))
                        Column(Modifier.weight(1f)) {
                            Text(textoAviso(a), fontSize = 14.sp, color = if (a.bool("read")) C.apagado else C.texto)
                            Text(Fechas.haceCuanto(a.str("createdAt")), fontSize = 12.sp, color = C.apagado)
                        }
                    }
                }
            }
        }
    }
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
