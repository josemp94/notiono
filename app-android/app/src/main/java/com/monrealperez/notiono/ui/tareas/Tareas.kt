package com.monrealperez.notiono.ui.tareas

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Chip
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.util.Fechas
import kotlinx.serialization.json.JsonObject

/** Mis tareas: filas de cualquier BD donde un campo Persona me incluye (db.myTasks). */
@Composable
fun PantallaTareas() {
    val n = LocalNavegador.current
    val q = rememberConsulta("db.myTasks", etiquetas = setOf("tareas", "espacio"))
    val tareas = q.datos?.comoLista?.map { it.comoObjeto }?.distinctBy { it.str("recordId") }
    Column(Modifier.fillMaxSize()) {
        BarraSuperior("Mis tareas", izquierda = { BotonIcono("panel-left", n.abrirPanel) }, acciones = { BotonIcono("refresh-cw", { q.recargar() }) })
        when {
            tareas == null -> Esqueleto()
            tareas.isEmpty() -> Vacio("No tienes nada asignado. Las filas donde un campo Persona te incluye salen aquí.", icono = "circle-check")
            else -> LazyColumn { items(tareas, key = { it.str("recordId") ?: "" }) { FilaTarea(it); Separador() } }
        }
    }
}

@Composable
fun FilaTarea(t: JsonObject) {
    val n = LocalNavegador.current
    Row(
        Modifier.fillMaxWidth().clickable { n.fila(t.str("pageId")!!, t.str("recordId")!!) }.padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(t.str("title")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icono("database", tam = 12.dp, color = C.apagado)
                Text(t.str("dbTitle") ?: "BD", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(start = 4.dp), maxLines = 1)
                t.str("date")?.takeIf { it.isNotBlank() }?.let { Text(" · " + Fechas.relativa(it), fontSize = 12.sp, color = C.apagado) }
            }
        }
        t.str("status")?.takeIf { it.isNotBlank() }?.let { Chip(it, C.hover, Modifier.padding(start = 8.dp)) }
    }
}
