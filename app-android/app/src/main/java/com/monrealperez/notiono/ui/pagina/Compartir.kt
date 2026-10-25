package com.monrealperez.notiono.ui.pagina

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.rememberAlcance
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.espacios.BotonMarca
import com.monrealperez.notiono.ui.espacios.Roles
import com.monrealperez.notiono.ui.espacios.Segmentos
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/** Qué contar tras invitar a una página, con los textos de la web. */
fun textoInvitacionPagina(r: JsonObject?): String = when {
    r?.bool("pendiente") == true -> "Invitación pendiente: verá la página cuando entre por primera vez con el NAS."
    r?.bool("miembro") == true -> "Es miembro del espacio: ya ve la página según su rol (restríngela para elegir quién)."
    else -> "Invitado: solo verá esta página y sus subpáginas."
}

/**
 * «Compartir» de una página, como el de la web y Notion: invitar por correo o usuario del
 * NAS con Ver / Comentar / Editar / Acceso total (quien no es del espacio entra como
 * invitado y solo ve esta página y lo que cuelga de ella), los invitados y las
 * invitaciones pendientes, el acceso restringido y, abajo, «Publicar en la web».
 */
@Composable
fun HojaCompartir(pageId: String, publicada: Boolean, onPublicar: () -> Unit, onCerrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val alcance = rememberAlcance()
    val etiqueta = "permisos:$pageId"
    val q = rememberConsulta("pages.perms.get", objeto("pageId" to pageId), etiquetas = setOf(etiqueta))
    val miembros = rememberConsulta("workspace.members", etiquetas = setOf("personas")).datos?.comoObjeto?.objs("members").orEmpty()
    val d = q.datos?.comoObjeto
    var email by remember { mutableStateOf("") }
    var nivel by remember { mutableStateOf("view") }
    var aviso by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var deQuien by remember { mutableStateOf<JsonObject?>(null) }
    var darAcceso by remember { mutableStateOf(false) }
    // Los del espacio que aún no están en la lista de una página restringida.
    val sinPermiso = miembros.filter { m -> m.str("role") !in setOf("admin", "owner", "guest") && d?.objs("permisos").orEmpty().none { it.str("userId") == m.str("userId") } }

    fun muta(ruta: String, input: JsonObject, ok: ((JsonObject?) -> Unit)? = null) = alcance.launch {
        try {
            val r = s.repo.mutacion(ruta, input, encolable = false, etiquetas = listOf(etiqueta, "arbol", "pagina:$pageId", "personas"))
            ok?.invoke(r?.comoObjeto)
        } catch (e: ErrorApi) {
            aviso = (if (e.sinConexion) "Sin conexión: inténtalo con red" else e.message ?: "No se pudo") to true
        }
    }
    fun invitar() {
        if (email.isBlank()) return
        aviso = null
        muta("pages.perms.invitar", objeto("pageId" to pageId, "email" to email.trim(), "level" to nivel)) { r ->
            email = ""
            aviso = textoInvitacionPagina(r) to false
        }
    }

    HojaLista(onCerrar, "Compartir") {
        Campo(email, { email = it }, Modifier.padding(horizontal = 16.dp), placeholder = "Correo o usuario del NAS")
        Segmentos(Roles.NIVELES, nivel, { nivel = it }, Modifier.padding(start = 16.dp, top = 8.dp))
        Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Quien no es del espacio entra como invitado.", fontSize = 12.sp, color = C.apagado, modifier = Modifier.weight(1f))
            BotonMarca("Invitar", activo = email.isNotBlank()) { invitar() }
        }
        aviso?.let { (t, error) -> Text(t, fontSize = 13.sp, color = if (error) Color(0xFFEF4444) else C.apagado, modifier = Modifier.padding(horizontal = 16.dp)) }
        if (d == null) return@HojaLista
        val invitados = d.objs("invitados")
        val pendientes = d.objs("pendientes")
        if (invitados.isNotEmpty() || pendientes.isNotEmpty()) {
            TituloSeccion("Invitados")
            for (p in invitados) FilaPermiso(p) { deQuien = p }
            for (i in pendientes) Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icono("mail", tam = 18.dp, color = C.apagado)
                Text(i.str("destino").orEmpty(), fontSize = 15.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 12.dp))
                Text("Pendiente · ${Roles.nivel(i.str("level"))}", fontSize = 12.sp, color = C.apagado)
                TextButton({ muta("pages.perms.anularInvitacion", objeto("pageId" to pageId, "id" to i.str("id"))) }) { Text("Anular", color = C.apagado, fontSize = 13.sp) }
            }
        }
        Separador(Modifier.padding(vertical = 8.dp))
        val restringida = d.bool("restricted")
        FilaMenu(
            "Acceso", "lock",
            detalle = if (restringida) "Restringida: solo la gente de la lista." else "Todo el espacio, según su rol.",
            derecha = {
                Switch(restringida, { muta("pages.perms.setRestricted", objeto("pageId" to pageId, "restricted" to it)) }, colors = SwitchDefaults.colors(checkedTrackColor = Marca))
            },
        ) { muta("pages.perms.setRestricted", objeto("pageId" to pageId, "restricted" to !restringida)) }
        if (restringida) {
            val permisos = d.objs("permisos")
            for (p in permisos) FilaPermiso(p) { deQuien = p }
            if (permisos.isEmpty()) Text("Solo tú (y los administradores).", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
            if (sinPermiso.isNotEmpty()) FilaMenu("Dar acceso a alguien…", "plus", color = C.apagado) { darAcceso = true }
            Text("Vale también para todas sus subpáginas (herencia).", fontSize = 11.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }
        Separador(Modifier.padding(vertical = 8.dp))
        FilaMenu("Publicar en la web", "globe", detalle = if (publicada) "Publicada: cualquiera con el enlace puede verla" else "Crea un enlace público de solo lectura") { onPublicar() }
    }

    if (darAcceso) Hoja({ darAcceso = false }, "Dar acceso") {
        for (m in sinPermiso) FilaMenu(m.str("name")?.ifBlank { null } ?: m.str("email").orEmpty(), "circle-user", detalle = "Con «Ver»; luego puedes cambiarlo") {
            darAcceso = false
            muta("pages.perms.set", objeto("pageId" to pageId, "userId" to m.str("userId"), "level" to "view"))
        }
    }
    deQuien?.let { p ->
        Hoja({ deQuien = null }, p.str("name") ?: p.str("email")) {
            for ((v, t) in Roles.NIVELES.reversed()) FilaMenu(t, null, derecha = { if (p.str("level") == v) Icono("check", color = Marca) }) {
                deQuien = null
                muta("pages.perms.set", objeto("pageId" to pageId, "userId" to p.str("userId"), "level" to v))
            }
            FilaMenu("Quitar acceso", "user-minus", color = Color(0xFFD44C47)) {
                deQuien = null
                muta("pages.perms.remove", objeto("pageId" to pageId, "userId" to p.str("userId")))
            }
        }
    }
}

@Composable
private fun FilaPermiso(p: JsonObject, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Icono("circle-user", tam = 18.dp, color = C.apagado)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(p.str("name").orEmpty(), fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (p.str("email") != p.str("name")) Text(p.str("email").orEmpty(), fontSize = 12.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(Roles.nivel(p.str("level")), fontSize = 13.sp, color = C.apagado)
        Icono("chevron-down", tam = 14.dp, color = C.apagado, modifier = Modifier.padding(start = 4.dp))
    }
}
