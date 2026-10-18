package com.monrealperez.notiono.ui.ajustes

import android.annotation.SuppressLint
import com.monrealperez.notiono.ui.comun.rememberAlcance
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.edit
import androidx.lifecycle.compose.LifecycleResumeEffect
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.avisos.Avisador
import com.monrealperez.notiono.datos.Miembro
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.VersionApk
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Confirmar
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.PedirTexto
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Actualizador
import com.monrealperez.notiono.util.Fechas
import com.monrealperez.notiono.widgets.Widgets
import kotlinx.coroutines.launch

/** Ajustes: perfil, espacio, avisos, versión de la app, widgets, diagnóstico y cerrar sesión. Lo de administrar, en la web. */
@Composable
fun PantallaAjustes() {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val yo = rememberConsulta("auth.me", etiquetas = setOf("perfil", "espacio")).datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }
    val miembros = rememberConsulta("workspace.members", etiquetas = setOf("espacio")).datos?.comoObjeto?.objs("members")
        ?.mapNotNull { runCatching { json.decodeFromJsonElement(Miembro.serializer(), it) }.getOrNull() } ?: emptyList()
    var nombre by remember { mutableStateOf(false) }
    var salir by remember { mutableStateOf(false) }
    var avisos by remember { mutableStateOf(Avisador.activo(ctx)) }
    var nueva by remember { mutableStateOf<VersionApk?>(null) }
    var comprobado by remember { mutableStateOf(false) }
    var progreso by remember { mutableStateOf<Float?>(null) }
    fun web(ruta: String) = com.monrealperez.notiono.util.Enlaces.abre(ctx, BuildConfig.BASE_URL + ruta)

    Column(Modifier.fillMaxSize()) {
        BarraSuperior("Ajustes", izquierda = { BotonIcono("arrow-left", { n.atras() }) })
        Column(Modifier.verticalScroll(rememberScrollState())) {
            TituloSeccion("Tu cuenta")
            FilaMenu(yo?.name ?: "Sin nombre", "user", detalle = yo?.email) { nombre = true }
            TituloSeccion("Espacio de trabajo")
            FilaMenu(yo?.workspace?.name ?: "—", "house", detalle = when (yo?.wsRole) {
                "owner" -> "Eres el propietario"
                "viewer" -> "Solo lectura"
                else -> "Puedes editar"
            }) {}
            for (m in miembros) FilaMenu(m.nombre, "circle-user", detalle = m.email + " · " + rolTexto(m.role)) {}
            FilaMenu("Miembros, API y avisos salientes", "external-link", detalle = "Se administran en la web") { web("/settings") }
            Separador(Modifier.padding(vertical = 8.dp))
            TituloSeccion("Avisos")
            FilaMenu("Avisos en el móvil", "bell", detalle = "Menciones, asignaciones y fechas que vencen; se miran cada 15 minutos",
                derecha = {
                    Switch(avisos, {
                        avisos = it
                        Avisador.activar(ctx, it)
                    }, colors = SwitchDefaults.colors(checkedTrackColor = Marca))
                }) { avisos = !avisos; Avisador.activar(ctx, avisos) }
            Separador(Modifier.padding(vertical = 8.dp))
            TituloSeccion("La app")
            FilaMenu("Versión ${BuildConfig.VERSION_NAME}", "smartphone", detalle = when {
                progreso != null -> "Bajando la actualización…"
                nueva != null -> "Hay una versión nueva: ${nueva!!.version}. Toca para instalarla."
                comprobado -> "Tienes la última"
                else -> "Buscar actualizaciones"
            }) {
                alcance.launch {
                    val v = nueva ?: Actualizador.nueva(ctx, forzar = true)
                    comprobado = true
                    nueva = v
                    if (v != null) {
                        if (!Actualizador.puedeInstalar(ctx)) {
                            Avisos.di("Permite a Notiono instalar actualizaciones y vuelve a tocar")
                            Actualizador.pidePermiso(ctx)
                            return@launch
                        }
                        try {
                            val apk = Actualizador.baja(ctx, v) { progreso = it }
                            Actualizador.instala(ctx, apk)
                        } catch (e: Exception) {
                            Avisos.di(e.message ?: "No se pudo bajar")
                        } finally {
                            progreso = null
                        }
                    }
                }
            }
            progreso?.let { LinearProgressIndicator({ it }, Modifier.padding(horizontal = 16.dp), color = Marca) }
            FilaMenu("Abrir Notiono en el navegador", "globe") { web("/") }
            SeccionWidgets()
            SeccionDiagnostico()
            Separador(Modifier.padding(vertical = 8.dp))
            FilaMenu("Cerrar sesión", "log-out", color = Color(0xFFD44C47)) { salir = true }
            Text("Notiono ${BuildConfig.VERSION_NAME} · ${BuildConfig.BASE_URL.removePrefix("https://")}", color = C.apagado, fontSize = 12.sp, modifier = Modifier.padding(16.dp))
        }
    }
    if (nombre) PedirTexto("Tu nombre", yo?.name.orEmpty(), onOk = { t ->
        nombre = false
        alcance.launch { runCatching { s.repo.mutacion("auth.updateProfile", objeto("name" to t), encolable = false, etiquetas = listOf("perfil")) } }
    }, onNo = { nombre = false })
    if (salir) Confirmar("¿Cerrar sesión?", "Se borra la sesión de este móvil. Lo que esté pendiente de enviar se perderá.", boton = "Cerrar sesión", onSi = {
        salir = false
        alcance.launch {
            runCatching { s.api.mutation("auth.logout") }
            s.cola.vacia()
            s.cache.vacia()
            s.sesion.olvida()
        }
    }, onNo = { salir = false })
}

/** Fabricantes que no dejan arrancar la app en segundo plano sin «Inicio automático» (ni hay permiso que lo dé). */
private val conInicioAutomatico get() = Build.MANUFACTURER.lowercase() in setOf("xiaomi", "redmi", "poco")

private fun bateriaLibre(ctx: Context) = ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) == true

/**
 * Widgets: con el ahorro de batería de HyperOS/MIUI (y otros), el sistema no deja a la app
 * repintarlos en segundo plano. La explicación sale solo si falta algo; los botones se quedan
 * para volver a abrir esas pantallas (el inicio automático no se puede comprobar).
 */
@Composable
private fun SeccionWidgets() {
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("widgets", Context.MODE_PRIVATE) }
    var vuelta by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        vuelta++
        onPauseOrDispose {}
    }
    val hay = remember(vuelta) { Widgets.hay(ctx) }
    if (!hay) return
    val bateria = remember(vuelta) { bateriaLibre(ctx) }
    var ofrecido by remember { mutableStateOf(prefs.getBoolean("inicioOfrecido", false)) }
    Separador(Modifier.padding(vertical = 8.dp))
    TituloSeccion("Widgets")
    if (!bateria || (conInicioAutomatico && !ofrecido)) Text(
        "Para que los widgets se actualicen solos: " + (if (conInicioAutomatico) "permite Inicio automático y " else "") + "pon la batería en Sin restricciones.",
        color = C.apagado, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
    if (conInicioAutomatico) FilaMenu("Inicio automático", "rocket", detalle = if (ofrecido) "Toca para revisarlo" else "Permítelo para Notiono") {
        ofrecido = true
        prefs.edit { putBoolean("inicioOfrecido", true) }
        val miui = Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"))
        runCatching { ctx.startActivity(miui) }.onFailure { runCatching { ctx.startActivity(detallesApp(ctx)) } }
    }
    FilaMenu("Batería sin restricciones", "battery", detalle = if (bateria) "Concedido" else "Toca para pedirlo") {
        if (bateria) runCatching { ctx.startActivity(detallesApp(ctx)) }
        else runCatching { ctx.startActivity(pideBateria(ctx)) }.onFailure { runCatching { ctx.startActivity(detallesApp(ctx)) } }
    }
}

private fun detallesApp(ctx: Context) = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))

// La app no va por Play: puede pedir que no la duerman (widgets y avisos dependen de ello).
@SuppressLint("BatteryLife")
private fun pideBateria(ctx: Context) = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))

/** Diagnóstico: lo último del registro (widgets, cierres, fallos del servidor) y enviarlo ya. */
@Composable
private fun SeccionDiagnostico() {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberAlcance()
    var abierto by remember { mutableStateOf(false) }
    var vuelta by remember { mutableIntStateOf(0) }
    val eventos = remember(vuelta, abierto) { s.registro.eventos() }
    val pendientes = remember(vuelta, abierto) { s.registro.pendientes().size }
    Separador(Modifier.padding(vertical = 8.dp))
    TituloSeccion("Diagnóstico")
    FilaMenu("Registro de la app", "activity", detalle = "${eventos.size} eventos · " + if (pendientes == 0) "todo enviado" else "$pendientes sin enviar") { abierto = !abierto }
    if (!abierto) return
    FilaMenu("Enviar ahora", "send") {
        alcance.launch {
            val ok = s.registro.envia(s.api, s.sesion.token != null)
            Avisos.di(if (ok) "Registro enviado" else "No se pudo enviar; se reintentará")
            vuelta++
        }
    }
    for (e in eventos.takeLast(40).asReversed()) Text(
        Fechas.haceCuanto(e.fecha) + " · " + e.tipo + " · " + e.mensaje,
        color = C.apagado, fontSize = 12.sp, maxLines = 3, modifier = Modifier.padding(horizontal = 16.dp, vertical = 3.dp),
    )
}

private fun rolTexto(r: String) = when (r) {
    "owner" -> "propietario"
    "viewer" -> "solo lectura"
    else -> "editor"
}
