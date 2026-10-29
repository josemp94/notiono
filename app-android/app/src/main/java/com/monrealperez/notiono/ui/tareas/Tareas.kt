package com.monrealperez.notiono.ui.tareas

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Chip
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.rememberAlcance
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.inicio.CirculoTarea
import com.monrealperez.notiono.ui.inicio.ConfigInicio
import com.monrealperez.notiono.ui.inicio.DatosInicio
import com.monrealperez.notiono.ui.inicio.DialogoTarea
import com.monrealperez.notiono.ui.inicio.HojaElegirBd
import com.monrealperez.notiono.ui.inicio.agrupaTareas
import com.monrealperez.notiono.ui.inicio.valorMarca
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.LocalDate

/**
 * Mis tareas, como en la web: lo que tengo asignado (y lo de mi BD de tareas) por secciones
 * (Vencidas, Hoy, Mañana, Próximas, Sin fecha y Completadas, plegada), filtro «Hoy», añadir
 * rápido y el círculo que la marca hecha (casilla o estado «Hecho», con la cola sin red).
 */
@Composable
fun PantallaTareas() {
    val n = LocalNavegador.current
    val s = Servicios.de(LocalContext.current)
    val alcance = rememberAlcance()
    val q = rememberConsulta("db.myTasks", objeto("conHechas" to true), etiquetas = setOf("tareas", "espacio"))
    val qInicio = rememberConsulta("inicio.get", etiquetas = setOf("inicio", "espacio"))
    val config = DatosInicio.de(qInicio.datos).config
    val tareas = q.datos?.comoLista?.map { it.comoObjeto }?.distinctBy { it.str("recordId") }
    var soloHoy by remember { mutableStateOf(false) }
    var verHechas by remember { mutableStateOf(false) }
    var nueva by remember { mutableStateOf(false) }
    var cambiarBd by remember { mutableStateOf(false) }
    // Marcadas aquí y aún sin volver del servidor: se ven ya en su sección.
    val marcadas = remember { mutableStateMapOf<String, Boolean>() }
    fun guarda(c: ConfigInicio) = alcance.launch {
        runCatching { s.repo.mutacion("inicio.guardar", c.aJson(), etiquetas = listOf("inicio", "tareas")) }
            .onFailure { Avisos.di(it.message ?: "No se pudo guardar") }
    }
    fun marca(t: JsonObject, hecha: Boolean) {
        val rid = t.str("recordId") ?: return
        val (fid, valor) = valorMarca(t, hecha) ?: return
        marcadas[rid] = hecha
        alcance.launch {
            try {
                s.repo.mutacion("db.updateCell", objeto("recordId" to rid, "fieldId" to fid, "value" to valor), etiquetas = listOf("tareas", "vista:${t.str("pageId")}"))
            } catch (e: ErrorApi) {
                marcadas.remove(rid)
                Avisos.di(e.message ?: "No se pudo marcar")
            }
        }
    }
    val vistas = tareas?.map { t -> marcadas[t.str("recordId")]?.let { JsonObject(t + ("hecha" to JsonPrimitive(it))) } ?: t }
    val secciones = vistas?.let { agrupaTareas(it, LocalDate.now(), soloHoy) }

    Column(Modifier.fillMaxSize()) {
        BarraSuperior(
            "Mis tareas",
            izquierda = { BotonIcono("panel-left", n.abrirPanel) },
            acciones = {
                BotonIcono("plus", { nueva = true })
                BotonIcono("refresh-cw", { marcadas.clear(); q.recargar() })
            },
        )
        Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            for ((hoy, texto) in listOf(false to "Todas", true to "Hoy")) {
                Text(
                    texto, fontSize = 14.sp, color = if (soloHoy == hoy) C.texto else C.apagado,
                    fontWeight = if (soloHoy == hoy) FontWeight.SemiBold else FontWeight.Normal,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp))
                        .let { if (soloHoy == hoy) it.background(C.activo) else it }
                        .clickable { soloHoy = hoy }.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
            Text(
                "Van a: " + (config.tareas?.let { DatosInicio.de(qInicio.datos).paginas[it]?.first?.ifBlank { "Sin título" } ?: "…" } ?: "elegir"),
                fontSize = 12.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).clickable { cambiarBd = true }.padding(8.dp),
            )
        }
        when {
            secciones == null -> Esqueleto()
            secciones.isEmpty() -> Vacio(
                if (soloHoy) "Nada para hoy ni vencido." else "No tienes nada asignado. Añade una tarea con «+» o ponte en un campo Persona de una base de datos.",
                icono = "circle-check",
            )
            else -> LazyColumn {
                for ((id, titulo, lista) in secciones) {
                    val plegada = id == "completadas" && !verHechas
                    item(key = "s:$id") {
                        Row(
                            Modifier.fillMaxWidth().let { if (id == "completadas") it.clickable { verHechas = !verHechas } else it }.padding(start = 16.dp, top = 14.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (id == "completadas") Icono(if (plegada) "chevron-right" else "chevron-down", tam = 15.dp, color = C.apagado)
                            Text(titulo, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = if (id == "vencidas") Color(0xFFD44C47) else C.apagado)
                            Text("  ${lista.size}", fontSize = 12.sp, color = C.apagado)
                        }
                    }
                    if (!plegada) items(lista, key = { "t:" + it.str("recordId") }) { t ->
                        FilaTarea(t, vencida = id == "vencidas", circulo = { CirculoTarea(t) { v -> marca(t, v) } })
                        Separador()
                    }
                }
            }
        }
    }
    if (nueva) DialogoTarea(config, { guarda(it) }) { nueva = false }
    if (cambiarBd) HojaElegirBd({ cambiarBd = false }) { id -> cambiarBd = false; guarda(config.copy(tareas = id)) }
}

@Composable
fun FilaTarea(t: JsonObject, vencida: Boolean = false, circulo: (@Composable () -> Unit)? = null) {
    val n = LocalNavegador.current
    Row(
        Modifier.fillMaxWidth().clickable { n.fila(t.str("pageId")!!, t.str("recordId")!!) }
            .padding(start = if (circulo != null) 4.dp else 14.dp, end = 14.dp, top = if (circulo != null) 2.dp else 10.dp, bottom = if (circulo != null) 2.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        circulo?.invoke()
        Column(Modifier.weight(1f)) {
            Text(
                // Una hecha no se tacha: es una fila de base de datos, como en Notion (el círculo y su sección lo dicen).
                t.str("title")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icono("database", tam = 12.dp, color = C.apagado)
                Text(t.str("dbTitle") ?: "BD", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(start = 4.dp), maxLines = 1)
                t.str("date")?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        " · " + (if (vencida) "Vencida · " else "") + Fechas.relativa(it),
                        fontSize = 12.sp, color = if (vencida) Color(0xFFD44C47) else C.apagado, maxLines = 1,
                    )
                }
            }
        }
        t.str("status")?.takeIf { it.isNotBlank() }?.let { Chip(it, C.hover, Modifier.padding(start = 8.dp)) }
    }
}
