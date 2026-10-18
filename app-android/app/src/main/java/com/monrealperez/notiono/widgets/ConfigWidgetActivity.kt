package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/** Configurar un widget al añadirlo: qué página (Nota, Nota rápida) o qué vista de BD (Lista). */
class ConfigWidgetActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        // Si se cierra sin elegir, Android no añade el widget.
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return finish()
        val clase = AppWidgetManager.getInstance(this).getAppWidgetInfo(id)?.provider?.className.orEmpty()
        val tipo = when {
            clase.endsWith("ListaReceiver") -> "lista"
            clase.endsWith("RapidaReceiver") -> "rapida"
            else -> "nota"
        }
        val listo: (String?, String?, String?) -> Unit = { pagina, vista, titulo ->
            lifecycleScope.launch {
                configuraWidget(this@ConfigWidgetActivity, id, pagina, vista, titulo)
                setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
                finish()
            }
        }
        setContent {
            TemaNotiono {
                Column(Modifier.fillMaxSize().background(C.fondo).safeDrawingPadding().padding(16.dp)) {
                    if (Servicios.de(this@ConfigWidgetActivity).sesion.token == null) {
                        Text("Entra primero en Notiono para configurar el widget.", color = C.texto)
                        return@Column
                    }
                    when (tipo) {
                        "lista" -> EligeVista(listo)
                        else -> EligePagina(
                            if (tipo == "rapida") "¿Dónde van las notas rápidas?" else "¿Qué página enseña el widget?",
                            conNueva = tipo == "rapida", listo = listo,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EligePagina(titulo: String, conNueva: Boolean, listo: (String?, String?, String?) -> Unit) {
    val s = Servicios.de(androidx.compose.ui.platform.LocalContext.current)
    var q by remember { mutableStateOf("") }
    var paginas by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    LaunchedEffect(q) {
        paginas = runCatching {
            if (q.isBlank()) s.repo.consulta("pages.tree").comoLista.map { it.comoObjeto }
            else s.repo.consulta("pages.search", objeto("query" to q), cachear = false).comoLista.map { it.comoObjeto }
        }.getOrDefault(emptyList()).filter { it.str("type") != "database" }
    }
    Text(titulo, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = C.texto, modifier = Modifier.padding(bottom = 8.dp))
    if (conNueva) Row(Modifier.fillMaxWidth().clickable { listo(null, null, null) }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icono("file-plus", color = Marca)
        Text("Siempre una página nueva", fontSize = 16.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
    }
    Campo(q, { q = it }, placeholder = "Buscar página…")
    LazyColumn(Modifier.fillMaxSize()) {
        items(paginas, key = { it.str("id") ?: "" }) { p ->
            Row(Modifier.fillMaxWidth().clickable { listo(p.str("id"), null, p.str("title")?.ifBlank { null }) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                IconoPagina(p.str("icon"), 20.dp)
                Text(p.str("title")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
            }
        }
    }
}

@Composable
private fun EligeVista(listo: (String?, String?, String?) -> Unit) {
    val s = Servicios.de(androidx.compose.ui.platform.LocalContext.current)
    val alcance = rememberCoroutineScope()
    var bds by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var bd by remember { mutableStateOf<JsonObject?>(null) }
    var vistas by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    LaunchedEffect(Unit) { bds = runCatching { s.repo.consulta("db.listDatabases").comoLista.map { it.comoObjeto } }.getOrDefault(emptyList()) }
    val elegida = bd
    if (elegida == null) {
        Text("¿Qué base de datos?", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = C.texto, modifier = Modifier.padding(bottom = 8.dp))
        LazyColumn(Modifier.fillMaxSize()) {
            items(bds, key = { it.str("pageId") ?: "" }) { d ->
                Row(Modifier.fillMaxWidth().clickable {
                    bd = d
                    alcance.launch { vistas = runCatching { s.repo.consulta("app.vista", objeto("pageId" to d.str("pageId"))).comoObjeto.objs("views") }.getOrDefault(emptyList()) }
                }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconoPagina(d.str("icon"), 20.dp, porDefecto = "database")
                    Text(d.str("title")?.ifBlank { null } ?: "Sin título", fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
                }
            }
        }
    } else {
        Text("¿Qué vista? (sus filtros y su orden)", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = C.texto, modifier = Modifier.padding(bottom = 8.dp))
        LazyColumn(Modifier.fillMaxSize()) {
            items(vistas, key = { it.str("id") ?: "" }) { v ->
                Row(Modifier.fillMaxWidth().clickable {
                    listo(elegida.str("pageId"), v.str("id"), "${elegida.str("title")?.ifBlank { null } ?: "Base de datos"} · ${v.str("name").orEmpty()}")
                }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icono("list", color = C.apagado)
                    Text(v.str("name").orEmpty(), fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
                }
            }
        }
    }
}
