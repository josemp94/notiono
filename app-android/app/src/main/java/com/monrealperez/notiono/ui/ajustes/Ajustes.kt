package com.monrealperez.notiono.ui.ajustes

import android.content.Intent
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import kotlinx.coroutines.launch

/** Ajustes: perfil, espacio, avisos, versión de la app y cerrar sesión. Lo de administrar, en la web. */
@Composable
fun PantallaAjustes() {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val alcance = rememberCoroutineScope()
    val yo = rememberConsulta("auth.me", etiquetas = setOf("perfil", "espacio")).datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }
    val miembros = rememberConsulta("workspace.members", etiquetas = setOf("espacio")).datos?.comoObjeto?.objs("members")
        ?.mapNotNull { runCatching { json.decodeFromJsonElement(Miembro.serializer(), it) }.getOrNull() } ?: emptyList()
    var nombre by remember { mutableStateOf(false) }
    var salir by remember { mutableStateOf(false) }
    var avisos by remember { mutableStateOf(Avisador.activo(ctx)) }
    var nueva by remember { mutableStateOf<VersionApk?>(null) }
    var comprobado by remember { mutableStateOf(false) }
    var progreso by remember { mutableStateOf<Float?>(null) }
    fun web(ruta: String) = ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.BASE_URL + ruta)))

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

private fun rolTexto(r: String) = when (r) {
    "owner" -> "propietario"
    "viewer" -> "solo lectura"
    else -> "editor"
}
