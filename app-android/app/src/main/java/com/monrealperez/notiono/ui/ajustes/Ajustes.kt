package com.monrealperez.notiono.ui.ajustes

import com.monrealperez.notiono.avisos.Alarmas
import com.monrealperez.notiono.avisos.Permisos
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.annotation.SuppressLint
import com.monrealperez.notiono.ui.comun.rememberAlcance
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
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
import androidx.compose.runtime.collectAsState
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
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.VersionApk
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
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
import kotlinx.coroutines.launch

/** Ajustes: perfil, espacio, avisos, versión de la app, widgets, diagnóstico y cerrar sesión. Lo de administrar, en la web. */
@Composable
fun PantallaAjustes() {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val yo = rememberConsulta("auth.me", etiquetas = setOf("perfil", "espacio")).datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }
    val puede = com.monrealperez.notiono.ui.espacios.Puede.de(yo)
    var nombre by remember { mutableStateOf(false) }
    var novedades by remember { mutableStateOf(false) }
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
            // Como Ajustes de Notion: General y Personas del espacio activo.
            TituloSeccion("Espacio · ${yo?.workspace?.name ?: "…"}")
            FilaMenu("General", "settings", detalle = "Nombre, icono, " + if (yo?.wsRole == "owner") "eliminar el espacio" else "salir del espacio") { n.a("espacio/general") }
            if (puede.personas) FilaMenu("Personas", "users", detalle = "Tu rol: " + com.monrealperez.notiono.ui.espacios.Roles.nombre(yo?.wsRole).lowercase()) { n.a("espacio/personas") }
            else FilaMenu("Eres invitado", "users", detalle = "Solo ves las páginas que te han compartido, y lo que cuelga de ellas") {}
            if (!puede.invitado) FilaMenu("API y avisos salientes", "external-link", detalle = "Se administran en la web") { web("/settings") }
            Separador(Modifier.padding(vertical = 8.dp))
            TituloSeccion("Apariencia")
            val modo by com.monrealperez.notiono.ui.tema.Apariencia.modo(ctx).collectAsState()
            for (m in com.monrealperez.notiono.ui.tema.Apariencia.Modo.entries) {
                FilaMenu(m.etiqueta, m.icono, derecha = { if (m == modo) com.monrealperez.notiono.ui.comun.Icono("check", color = Marca) }) {
                    com.monrealperez.notiono.ui.tema.Apariencia.pon(ctx, m)
                }
            }
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
            FilaMenu("Novedades", "sparkles", detalle = "Lo nuevo de la ${NOVEDADES.first().first}") { novedades = true }
            FilaMenu("Abrir Notiono en el navegador", "globe") { web("/") }
            SeccionDiagnostico()
            Separador(Modifier.padding(vertical = 8.dp))
            FilaMenu("Cerrar sesión", "log-out", color = Color(0xFFD44C47)) { salir = true }
            Text("Notiono ${BuildConfig.VERSION_NAME} · ${BuildConfig.BASE_URL.removePrefix("https://")}", color = C.apagado, fontSize = 12.sp, modifier = Modifier.padding(16.dp))
        }
    }
    if (novedades) com.monrealperez.notiono.ui.comun.HojaLista({ novedades = false }, "Novedades") {
        for ((version, cosas) in NOVEDADES) {
            TituloSeccion("Versión $version")
            for (c in cosas) Text("·  $c", fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(horizontal = 16.dp, vertical = 3.dp))
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

/**
 * Lo que necesitan los recordatorios a su hora, los avisos y los widgets: cada permiso con
 * su estado y un botón a su ajuste. El inicio automático de Xiaomi no se puede comprobar:
 * se recuerda que se ofreció. Lo que falte queda en el registro (`Permisos.anota`).
 */
@Composable
private fun SeccionPermisos() {
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("widgets", Context.MODE_PRIVATE) }
    var vuelta by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        vuelta++
        Permisos.anota(ctx)
        onPauseOrDispose {}
    }
    val pide = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { vuelta++ }
    val notificaciones = remember(vuelta) { Permisos.notificaciones(ctx) }
    val silenciados = remember(vuelta) { Permisos.canalesSilenciados(ctx) }
    val exactas = remember(vuelta) { Alarmas.exactas(ctx) }
    val bateria = remember(vuelta) { Permisos.bateriaLibre(ctx) }
    var ofrecido by remember { mutableStateOf(prefs.getBoolean("inicioOfrecido", false)) }
    if (!notificaciones || silenciados.isNotEmpty() || !exactas || !bateria || (conInicioAutomatico && !ofrecido)) Text(
        "Para que los recordatorios suenen a su hora, lleguen los avisos y los widgets se actualicen solos, falta lo que no pone «Concedido».",
        color = C.apagado, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
    FilaMenu("Notificaciones", "bell", detalle = when {
        !notificaciones -> "Desactivadas: toca para permitirlas"
        silenciados.isNotEmpty() -> "Silenciados: ${silenciados.joinToString(" y ")}. Toca para revisarlo"
        else -> "Concedido"
    }) {
        val preguntar = Build.VERSION.SDK_INT >= 33 && !notificaciones &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !prefs.getBoolean("notificacionesPedidas", false)
        if (preguntar) {
            prefs.edit { putBoolean("notificacionesPedidas", true) }
            pide.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else runCatching {
            ctx.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName))
        }.onFailure { runCatching { ctx.startActivity(detallesApp(ctx)) } }
    }
    if (Build.VERSION.SDK_INT >= 31) FilaMenu("Alarmas exactas", "alarm-clock", detalle = if (exactas) "Concedido" else "Toca para permitirlas (recordatorios a su hora)") {
        runCatching { ctx.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}"))) }
            .onFailure { runCatching { ctx.startActivity(detallesApp(ctx)) } }
    }
    FilaMenu("Batería sin restricciones", "battery", detalle = if (bateria) "Concedido" else "Toca para pedirlo") {
        if (bateria) runCatching { ctx.startActivity(detallesApp(ctx)) }
        else runCatching { ctx.startActivity(pideBateria(ctx)) }.onFailure { runCatching { ctx.startActivity(detallesApp(ctx)) } }
    }
    if (conInicioAutomatico) FilaMenu("Inicio automático", "rocket", detalle = if (ofrecido) "No se puede comprobar: toca para revisarlo" else "Permítelo para Notiono") {
        ofrecido = true
        prefs.edit { putBoolean("inicioOfrecido", true) }
        val miui = Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"))
        runCatching { ctx.startActivity(miui) }.onFailure { runCatching { ctx.startActivity(detallesApp(ctx)) } }
    }
}

private fun detallesApp(ctx: Context) = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))

// La app no va por Play: puede pedir que no la duerman (widgets y avisos dependen de ello).
@SuppressLint("BatteryLife")
private fun pideBateria(ctx: Context) = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))

/** Diagnóstico: los permisos que hacen falta y lo último del registro (widgets, avisos, cierres, fallos del servidor). */
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
    SeccionPermisos()
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

/** Lo nuevo de cada versión, lo último primero (Ajustes → Novedades). */
val NOVEDADES = listOf(
    "2.5.1" to listOf(
        "Más parecido a Notion: lo que Notion tiene se ve y se hace como en Notion, y lo que no tiene encaja con lo demás.",
        "Las casillas de una base de datos son una propiedad más: en la Lista van con las demás, se marcan tocándolas y ya no tachan el título. La «Lista de tareas» de una página sí se tacha y se pone en gris, como en Notion.",
        "Recordatorios como en Notion: escribe «@recordar mañana» (o «@recordar a las 19:00», «@recordar el miércoles a las 13:00») o elige «Recordar…» en el menú @. Tocando la fecha cambias el día, la hora y el aviso. «Recordarme…» ya no está en el menú de la página.",
        "«Posponer 1 h» mueve ese recordatorio a dentro de una hora (si era «antes» de un evento, el evento no se toca).",
        "«Exportar» en el menú de la página y de la fila, como en Notion: eliges el formato (PDF, HTML, Markdown y CSV o Word).",
        "Al pie del menú: «Recuento de palabras» y «Última edición», como en Notion; lo demás, en «Más información».",
        "Inicio como el de Notion: el saludo, «Visitado recientemente» con tarjetas, «Próximos eventos» y «Mis tareas», todos con la misma tarjeta, y el ⋯ de cada sección para subirla, bajarla u ocultarla.",
        "El dibujo se porta como una imagen: está con las imágenes en el menú «/» y tiene leyenda.",
        "Widget «Nota»: las ‹ › van a la derecha del título, como en el Calendario, y «Mis notas recientes» se elige como una opción más.",
    ),
    "2.5.0" to listOf(
        "Dibujo a mano: un bloque «Dibujo» (menú «/») con bolígrafo, lápiz, rotulador y subrayador, goma, texto y formas, colores y grosores, y fondo liso, de cuadrícula, puntos o rayas. Se edita igual aquí que en el ordenador.",
        "Exportar a Word: desde el menú de una página o de una fila, el .docx se comparte con lo que quieras (con sus casillas, imágenes y dibujos).",
        "«Recordarme…» en el menú de una página o de una fila: en 1 hora, esta tarde, mañana a las 9:00 o cuando elijas. El aviso trae «Hecho» y «Posponer 1 h».",
        "Inicio con más bloques: acciones rápidas, bloc de notas que se guarda solo (y se convierte en página), una nota fijada con sus casillas y tus recordatorios. Y la fecha de hoy con el buscador debajo.",
        "Mis tareas por secciones (Vencidas, Hoy, Mañana, Próximas, Sin fecha y Completadas), con el filtro «Hoy», «+» para añadir una tarea y el círculo para marcarla hecha.",
        "Widget «Nota»: «Mis notas recientes» pasa con ‹ › por las últimas páginas que abriste.",
        "Información de la página al pie de su menú: palabras, casillas hechas, imágenes y fechas.",
    ),
    "2.4.1" to listOf(
        "Las casillas se marcan tocándolas en todas las vistas: en la Lista van delante del título (y la tarea hecha sale tachada), y en las tarjetas del Kanban y la Galería se marcan sin abrir la ficha.",
    ),
    "2.4.0" to listOf(
        "Varios espacios, como en Notion: el selector enseña los avisos sin leer de cada espacio y deja crear uno nuevo con su nombre e icono.",
        "Ajustes del espacio: General (nombre, icono, salir o eliminarlo escribiendo su nombre) y Personas, con miembros, invitados, invitaciones pendientes, roles y traspasar la propiedad.",
        "Compartir una página por correo o usuario del NAS con Ver, Comentar, Editar o Acceso total, y ver a quién está compartida.",
        "«Mover a» otro espacio: la página se duplica allí y el original se queda.",
        "Los avisos de otro espacio llegan al móvil y, al tocarlos, la app pasa a ese espacio.",
        "Si te comparten una página, la app funciona como invitado: solo lo compartido contigo.",
        "Cada espacio guarda lo suyo sin conexión, y los widgets siguen con su espacio aunque cambies de espacio en la app.",
    ),
    "2.3.0" to listOf("Inicio personalizable y «Abrir al iniciar», como en la web."),
)
