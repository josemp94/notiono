package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetManager
import com.monrealperez.notiono.ui.comun.rememberAlcance
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/**
 * Configurar un widget al añadirlo (o al tocar «Toca para elegir…»): qué página (Nota, Nota
 * rápida), qué vista de BD (Lista), la BD de tareas (Acciones) o las BD del Calendario.
 */
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
            clase.endsWith("AccionesReceiver") -> "acciones"
            clase.endsWith("CalendarioReceiver") -> "calendario"
            else -> "nota"
        }
        val guarda: (ConfigWidget) -> Unit = { c ->
            // Con su espacio: si luego se cambia de espacio en la app, el widget sigue con lo suyo.
            Configs.guarda(this, id, c.copy(espacio = Servicios.de(this).espacioActivo()))
            Instantaneas.borra(this, id)
            val p = Widgets.proveedorDe(this, id)
            p?.pinta(this, id)
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
            finish()
            // Lo pinta ya (sin datos: «Cargando…») y va a por ellos detrás.
            if (p != null) Servicios.de(this).alcance.launch { p.refresca(applicationContext, id, "configurar") }
        }
        val listo: (String?, String?, String?) -> Unit = { pagina, vista, titulo -> guarda(ConfigWidget(pagina = pagina, vista = vista, titulo = titulo)) }
        setContent {
            val oscuro = com.monrealperez.notiono.ui.tema.esOscuro()
            com.monrealperez.notiono.ui.tema.BarrasDelTema(this, oscuro)
            TemaNotiono(oscuro) {
                Column(Modifier.fillMaxSize().background(C.fondo).safeDrawingPadding().padding(16.dp)) {
                    if (Servicios.de(this@ConfigWidgetActivity).sesion.token == null) {
                        Text("Entra primero en Notiono para configurar el widget.", color = C.texto)
                        return@Column
                    }
                    when (tipo) {
                        "calendario" -> EligeCalendario { fuentes, titulo -> guarda(ConfigWidget(fuentes = fuentes, titulo = titulo)) }
                        "lista" -> EligeVista(listo)
                        "acciones" -> EligeVista(listo, conVista = false)
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
private fun EligeVista(listo: (String?, String?, String?) -> Unit, conVista: Boolean = true) {
    val s = Servicios.de(androidx.compose.ui.platform.LocalContext.current)
    val alcance = rememberAlcance()
    var bds by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var bd by remember { mutableStateOf<JsonObject?>(null) }
    var vistas by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    LaunchedEffect(Unit) { bds = runCatching { s.repo.consulta("db.listDatabases").comoLista.map { it.comoObjeto } }.getOrDefault(emptyList()) }
    val elegida = bd
    if (elegida == null) {
        Text(if (conVista) "¿Qué base de datos?" else "¿En qué base de datos van las tareas nuevas?", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = C.texto, modifier = Modifier.padding(bottom = 8.dp))
        if (!conVista) Row(Modifier.fillMaxWidth().clickable { listo(null, null, null) }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icono("x", color = C.apagado)
            Text("Sin botón «Nueva tarea»", fontSize = 16.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
        }
        LazyColumn(Modifier.fillMaxSize()) {
            items(bds, key = { it.str("pageId") ?: "" }) { d ->
                Row(Modifier.fillMaxWidth().clickable {
                    if (!conVista) return@clickable listo(d.str("pageId"), null, d.str("title"))
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

/**
 * El Calendario: una o varias bases de datos y, de cada una, su campo de fecha (el primero,
 * si no se elige otro) y «solo lo asignado a mí» si tiene campo Persona.
 */
@Composable
private fun androidx.compose.foundation.layout.ColumnScope.EligeCalendario(listo: (List<FuenteCal>, String?) -> Unit) {
    val s = Servicios.de(androidx.compose.ui.platform.LocalContext.current)
    val alcance = rememberAlcance()
    var bds by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    // pageId → lo que dijo el servidor de esa BD (campos de fecha, si tiene persona).
    var info by remember { mutableStateOf<Map<String, JsonObject>>(emptyMap()) }
    var elegidas by remember { mutableStateOf<List<FuenteCal>>(emptyList()) }
    LaunchedEffect(Unit) { bds = runCatching { s.repo.consulta("db.listDatabases").comoLista.map { it.comoObjeto } }.getOrDefault(emptyList()) }
    val hoy = java.time.LocalDate.now().toString()
    Text("¿Qué bases de datos?", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = C.texto, modifier = Modifier.padding(bottom = 4.dp))
    Text("Sus tareas con fecha salen en el calendario.", fontSize = 14.sp, color = C.apagado, modifier = Modifier.padding(bottom = 8.dp))
    LazyColumn(Modifier.fillMaxWidth().weight(1f)) {
        items(bds, key = { it.str("pageId") ?: "" }) { d ->
            val pageId = d.str("pageId") ?: return@items
            val nombre = d.str("title")?.ifBlank { null } ?: "Sin título"
            val f = elegidas.firstOrNull { it.pageId == pageId }
            val i = info[pageId]
            val campos = i?.objs("campos") ?: emptyList()
            Column {
                Row(Modifier.fillMaxWidth().clickable {
                    if (f != null) elegidas = elegidas - f
                    else {
                        elegidas = elegidas + FuenteCal(pageId, nombre = nombre)
                        if (i == null) alcance.launch {
                            val r = runCatching {
                                s.repo.consulta("app.calendario", objeto("fuentes" to listOf(objeto("pageId" to pageId)), "desde" to hoy, "hasta" to hoy), cachear = false)
                                    .comoObjeto.objs("fuentes").firstOrNull()
                            }.getOrNull()
                            if (r != null) info = info + (pageId to r)
                        }
                    }
                }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icono(if (f != null) "square-check" else "square", color = if (f != null) Marca else C.apagado)
                    IconoPagina(d.str("icon"), 20.dp, porDefecto = "database", modifier = Modifier.padding(start = 12.dp))
                    Text(nombre, fontSize = 15.sp, color = C.texto, modifier = Modifier.padding(start = 12.dp))
                }
                if (f != null && i != null) Column(Modifier.padding(start = 44.dp, bottom = 8.dp)) {
                    if (campos.isEmpty()) Text("No tiene campo de fecha: no saldrá nada.", fontSize = 13.sp, color = C.apagado)
                    if (campos.size > 1) Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Fecha:", fontSize = 13.sp, color = C.apagado)
                        campos.forEach { c ->
                            val sel = (f.fieldId ?: campos.first().str("id")) == c.str("id")
                            Text(c.str("name").orEmpty(), fontSize = 13.sp, color = if (sel) Marca else C.texto,
                                fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                                modifier = Modifier.clickable { elegidas = elegidas.map { if (it.pageId == pageId) it.copy(fieldId = c.str("id")) else it } }.padding(8.dp))
                        }
                    }
                    if (i.bool("conPersona")) Row(Modifier.clickable { elegidas = elegidas.map { if (it.pageId == pageId) it.copy(mios = !it.mios) else it } }.padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Icono(if (f.mios) "square-check" else "square", color = if (f.mios) Marca else C.apagado)
                        Text("Solo lo asignado a mí", fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
    }
    val validas = elegidas.filter { f -> info[f.pageId]?.objs("campos")?.isNotEmpty() != false }
    Text(
        if (validas.isEmpty()) "Elige al menos una" else "Listo",
        color = if (validas.isEmpty()) C.apagado else Marca, fontWeight = FontWeight.Bold, fontSize = 16.sp,
        modifier = Modifier.fillMaxWidth().clickable(enabled = validas.isNotEmpty()) {
            listo(validas.map { f -> f.copy(fieldId = f.fieldId ?: info[f.pageId]?.objs("campos")?.firstOrNull()?.str("id")) }, validas.singleOrNull()?.nombre)
        }.padding(vertical = 16.dp),
    )
}
