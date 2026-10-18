package com.monrealperez.notiono.ui.papelera

import androidx.compose.foundation.layout.Box
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.AccionesPagina
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Confirmar
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.launch

/** Papelera: restaurar, borrar para siempre y vaciar (se purga sola a los 30 días). */
@Composable
fun PantallaPapelera() {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val q = rememberConsulta("pages.trash", etiquetas = setOf("papelera", "espacio"))
    var filtro by remember { mutableStateOf("") }
    var borrar by remember { mutableStateOf<String?>(null) }
    var vaciar by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        // La auto-purga perezosa, como al abrir la papelera en la web.
        runCatching { s.repo.mutacion("pages.purgeExpired", encolable = false, etiquetas = listOf("papelera")) }
    }
    val todas = q.datos?.comoLista?.map { it.comoObjeto }?.distinctBy { it.str("id") }
    val lista = todas?.filter { filtro.isBlank() || (it.str("title") ?: "").contains(filtro, true) }
    Column(Modifier.fillMaxSize()) {
        BarraSuperior("Papelera", izquierda = { BotonIcono("arrow-left", { n.atras() }) }, acciones = {
            if (!todas.isNullOrEmpty()) TextButton({ vaciar = true }) { Text("Vaciar", color = Color(0xFFD44C47)) }
        })
        Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) { Campo(filtro, { filtro = it }, placeholder = "Buscar en la papelera…") }
        Text("Lo que lleva más de 30 días en la papelera se borra solo.", color = C.apagado, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        when {
            lista == null -> Esqueleto()
            lista.isEmpty() -> Vacio("La papelera está vacía.", icono = "trash-2")
            else -> LazyColumn {
                items(lista, key = { it.str("id") ?: "" }) { p ->
                    val id = p.str("id")!!
                    val quien = p.obj("archivedBy")?.let { it.str("name") ?: it.str("email") }
                    FilaMenu(
                        p.str("title")?.ifBlank { null } ?: "Sin título",
                        detalle = "Borrada ${Fechas.haceCuanto(p.str("archivedAt"))}" + (quien?.let { " por $it" } ?: ""),
                        derecha = {
                            Row {
                                BotonIcono("undo-2", { alcance.launch { AccionesPagina.restaurar(s.repo, id) } })
                                BotonIcono("trash-2", { borrar = id }, color = Color(0xFFD44C47))
                            }
                        },
                        modifier = Modifier,
                    ) { alcance.launch { AccionesPagina.restaurar(s.repo, id); n.pagina(id) } }
                }
            }
        }
    }
    borrar?.let { id ->
        Confirmar("¿Borrar para siempre?", "La página y sus subpáginas desaparecen y no se pueden recuperar.", onSi = {
            borrar = null
            alcance.launch {
                try { s.repo.mutacion("pages.remove", objeto("id" to id), encolable = false, etiquetas = listOf("papelera")) }
                catch (e: ErrorApi) { Avisos.di(e.message ?: "No se pudo borrar") }
            }
        }, onNo = { borrar = null })
    }
    if (vaciar) {
        Confirmar("¿Vaciar la papelera?", "Todo lo que hay en ella se borra para siempre.", boton = "Vaciar", onSi = {
            vaciar = false
            alcance.launch {
                try { s.repo.mutacion("pages.emptyTrash", encolable = false, etiquetas = listOf("papelera")) }
                catch (e: ErrorApi) { Avisos.di(e.message ?: "No se pudo vaciar") }
            }
        }, onNo = { vaciar = false })
    }
}
