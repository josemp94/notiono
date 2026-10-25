package com.monrealperez.notiono.ui.espacios

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.Navegador
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Confirmar
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.Vacio
import com.monrealperez.notiono.ui.comun.rememberAlcance
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.pagina.SelectorIcono
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

private val ROJO = Color(0xFFEF4444)

/** Tras salir o eliminar: al espacio que dice el servidor, y al Inicio sin nada detrás. */
private fun alInicio(n: Navegador) = n.nav.navigate("inicio") { popUpTo(0) { inclusive = true } }

/**
 * Ajustes → General del espacio, como el de la web y Notion: nombre e icono (el dueño) y
 * la Zona de peligro, donde un miembro sale y el propietario elimina escribiendo su nombre.
 */
@Composable
fun PantallaEspacioGeneral() {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val yo = rememberConsulta("auth.me", etiquetas = setOf("espacio", "espacios")).datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }
    val lista = Espacios.lista(rememberConsulta("workspace.list", etiquetas = setOf("espacios")).datos)
    val ws = yo?.workspace
    val esDueno = yo?.wsRole == "owner"
    var nombre by remember(ws?.id) { mutableStateOf(ws?.name.orEmpty()) }
    var eligiendo by remember { mutableStateOf(false) }
    var salir by remember { mutableStateOf(false) }
    var borrar by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }

    fun guarda(input: kotlinx.serialization.json.JsonObject) = alcance.launch {
        msg = null
        try {
            s.repo.mutacion("workspace.update", input, encolable = false, etiquetas = listOf("espacio", "espacios"))
            msg = "Guardado"
        } catch (e: ErrorApi) {
            msg = if (e.sinConexion) "Sin conexión: no se ha guardado" else e.message
        }
    }

    Column(Modifier.fillMaxSize()) {
        BarraSuperior("General", izquierda = { BotonIcono("arrow-left", { n.atras() }) })
        if (ws == null) return@Column Esqueleto()
        Column(Modifier.verticalScroll(rememberScrollState())) {
            TituloSeccion("Nombre e icono")
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp))
                        .clickable(enabled = esDueno) { eligiendo = true },
                    contentAlignment = Alignment.Center,
                ) { IconoEspacio(nombre.ifBlank { ws.name }, ws.icon, 30.dp) }
                if (esDueno) Campo(nombre, { nombre = it.take(80) }, Modifier.weight(1f), placeholder = "Nombre del espacio")
                else Text(ws.name, fontSize = 16.sp, color = C.texto, modifier = Modifier.weight(1f))
            }
            if (esDueno) Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.End) {
                BotonMarca("Guardar", activo = nombre.isNotBlank() && nombre.trim() != ws.name) { guarda(objeto("name" to nombre)) }
            } else Text("Solo quien es propietario cambia el nombre y el icono.", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(16.dp))
            msg?.let { Text(it, fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp)) }

            // Zona de peligro, como en Notion.
            val unico = esDueno && Espacios.unicoPropio(lista)
            Text("Zona de peligro", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = ROJO, modifier = Modifier.padding(start = 16.dp, top = 24.dp, bottom = 6.dp))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(if (esDueno) "Eliminar todo el espacio" else "Salir del espacio", fontSize = 15.sp, color = C.texto)
                    Text(
                        when {
                            unico -> "Es tu único espacio propio: para eliminarlo, crea antes otro."
                            esDueno -> "Se borra para todas las personas que están en él, con todas sus páginas. No se puede deshacer."
                            else -> "Dejarás de ver sus páginas y desaparecerá de tu selector de espacios."
                        },
                        fontSize = 12.sp, color = C.apagado,
                    )
                }
                Text(
                    if (esDueno) "Eliminar" else "Salir", color = if (unico) ROJO.copy(alpha = 0.4f) else ROJO, fontSize = 14.sp,
                    modifier = Modifier.padding(start = 8.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, ROJO.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                        .clickable(enabled = !unico) { if (esDueno) borrar = true else salir = true }.padding(horizontal = 12.dp, vertical = 7.dp),
                )
            }
        }
    }
    if (eligiendo) SelectorIcono(onElegir = { eligiendo = false; guarda(objeto("icon" to it)) }, onCerrar = { eligiendo = false })
    if (salir && ws != null) Confirmar(
        "¿Salir de «${ws.name}»?", "Para volver, el propietario tendrá que invitarte otra vez.", boton = "Salir",
        onSi = {
            salir = false
            alcance.launch {
                try {
                    val r = s.repo.mutacion("workspace.leave", objeto("workspaceId" to ws.id), encolable = false, etiquetas = listOf("espacios"))
                    r?.comoObjeto?.str("workspaceId")?.let { Espacios.pasaA(ctx, it, comprobar = false) }
                    Avisos.di("Has salido de «${ws.name}»")
                    alInicio(n)
                } catch (e: ErrorApi) {
                    Avisos.di(if (e.sinConexion) "Sin conexión: no se puede salir ahora" else e.message ?: "No se pudo salir")
                }
            }
        },
        onNo = { salir = false },
    )
    if (borrar && ws != null) EliminarEspacio(ws.name, onCerrar = { borrar = false }) { escrito ->
        try {
            val r = s.repo.mutacion("workspace.delete", objeto("confirmacion" to escrito), encolable = false, etiquetas = listOf("espacios"))
            r?.comoObjeto?.str("workspaceId")?.let { Espacios.pasaA(ctx, it, comprobar = false) }
            Avisos.di("Espacio eliminado")
            borrar = false
            alInicio(n)
            null
        } catch (e: ErrorApi) {
            if (e.sinConexion) "Sin conexión: no se puede eliminar ahora" else e.message
        }
    }
}

/** «Eliminar todo el espacio»: hay que escribir su nombre, como en la web. */
@Composable
private fun EliminarEspacio(nombre: String, onCerrar: () -> Unit, onEliminar: suspend (String) -> String?) {
    val alcance = rememberAlcance()
    var escrito by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onCerrar,
        containerColor = C.fondo,
        title = { Text("Eliminar todo el espacio") },
        text = {
            Column {
                Text("Se borrarán para siempre «$nombre», todas sus páginas y bases de datos, y nadie más podrá entrar en él.", color = C.texto)
                Text("Escribe el nombre del espacio para confirmarlo:", color = C.apagado, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                Campo(escrito, { escrito = it }, placeholder = nombre, autofoco = true)
                error?.let { Text(it, color = ROJO, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = {
            TextButton(
                { ocupado = true; alcance.launch { error = onEliminar(escrito); ocupado = false } },
                enabled = escrito.trim() == nombre.trim() && !ocupado,
            ) { Text("Eliminar el espacio", color = if (escrito.trim() == nombre.trim()) ROJO else C.apagado) }
        },
        dismissButton = { TextButton(onCerrar) { Text("Cancelar", color = C.texto) } },
    )
}

@Serializable
data class Persona(val userId: String, val name: String? = null, val email: String = "", val role: String = "editor") {
    val nombre get() = name?.takeIf { it.isNotBlank() } ?: email
}

@Serializable
data class Invitacion(val id: String, val destino: String, val role: String = "editor")

/**
 * Ajustes → Personas (y «Invitar miembros» del selector), como en Notion: pestañas
 * Miembros e Invitados; el propietario invita por correo o usuario del NAS con su rol,
 * ve las invitaciones pendientes, cambia roles, traspasa la propiedad y quita a gente.
 * Lo que un rol no puede hacer no se le ofrece (y el servidor tampoco lo deja).
 */
@Composable
fun PantallaPersonas(invitadosPrimero: Boolean = false) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val q = rememberConsulta("workspace.members", etiquetas = setOf("personas", "espacio"))
    val datos = q.datos?.comoObjeto
    val yoId = s.sesion.usuarioId
    val esDueno = datos?.bool("isOwner") == true
    val ownerId = datos?.str("ownerId")
    val todos = datos?.objs("members")?.mapNotNull { runCatching { json.decodeFromJsonElement(Persona.serializer(), it) }.getOrNull() } ?: emptyList()
    val miembros = todos.filter { it.role != "guest" }
    val invitados = todos.filter { it.role == "guest" }
    val pendientes = datos?.objs("invitaciones")?.mapNotNull { runCatching { json.decodeFromJsonElement(Invitacion.serializer(), it) }.getOrNull() } ?: emptyList()
    var pestaña by remember { mutableIntStateOf(if (invitadosPrimero) 1 else 0) }
    var email by remember { mutableStateOf("") }
    var rol by remember { mutableStateOf("editor") }
    var msg by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var deQuien by remember { mutableStateOf<Persona?>(null) }
    var confirma by remember { mutableStateOf<Confirma?>(null) }

    fun muta(ruta: String, input: kotlinx.serialization.json.JsonObject, ok: ((kotlinx.serialization.json.JsonElement?) -> Unit)? = null) = alcance.launch {
        msg = null
        try {
            val r = s.repo.mutacion(ruta, input, encolable = false, etiquetas = listOf("personas", "espacios"))
            ok?.invoke(r)
        } catch (e: ErrorApi) {
            msg = (if (e.sinConexion) "Sin conexión: inténtalo con red" else e.message ?: "No se pudo") to true
        }
    }
    fun invitar() {
        if (email.isBlank()) return
        muta("workspace.share", objeto("email" to email.trim(), "role" to rol)) { r ->
            msg = (if (r?.comoObjeto?.bool("pendiente") == true) "Invitación pendiente: entrará en el espacio la primera vez que inicie sesión con el NAS." else "Añadido al espacio.") to false
            email = ""
        }
    }
    /** Lo elegido en la hoja de una persona: un rol, «owner» (traspasar) o «quitar». */
    fun elige(p: Persona, valor: String) {
        deQuien = null
        val quien = p.nombre
        when {
            valor == "quitar" -> confirma = Confirma(p, valor, "¿Quitar a $quien del espacio?", "Dejará de ver sus páginas.")
            valor == "owner" -> confirma = Confirma(p, valor, "¿Hacer a $quien propietario del espacio?", "Tú pasarás a ser miembro y ya no podrás cambiar los ajustes.")
            p.role == "guest" -> confirma = Confirma(p, valor, "¿Convertir a $quien en ${Roles.nombre(valor).lowercase()}?", "Verá todo el espacio, no solo lo compartido.")
            valor != p.role -> muta("workspace.setRole", objeto("userId" to p.userId, "role" to valor))
        }
    }

    Column(Modifier.fillMaxSize()) {
        BarraSuperior("Personas", izquierda = { BotonIcono("arrow-left", { n.atras() }) })
        TabRow(
            pestaña, containerColor = C.fondo, contentColor = C.texto,
            indicator = { p -> TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(p[pestaña]), color = Marca) },
        ) {
            Tab(pestaña == 0, { pestaña = 0 }, text = { Text("Miembros · ${miembros.size}", fontSize = 14.sp) })
            Tab(pestaña == 1, { pestaña = 1 }, text = { Text("Invitados · ${invitados.size}", fontSize = 14.sp) })
        }
        if (datos == null) return@Column if (q.error != null) Vacio(q.error?.message ?: "No se pudo cargar") else Esqueleto()
        Column(Modifier.verticalScroll(rememberScrollState())) {
            if (pestaña == 0) {
                if (esDueno) {
                    TituloSeccion("Invitar al espacio")
                    Campo(email, { email = it }, Modifier.padding(horizontal = 16.dp), placeholder = "Email o usuario del NAS")
                    Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Segmentos(listOf("editor" to "Miembro", "viewer" to "Lector"), rol, { rol = it }, Modifier.weight(1f))
                        BotonMarca("Invitar", activo = email.isNotBlank()) { invitar() }
                    }
                    Text(
                        "Si aún no ha entrado nunca en Notiono, queda como invitación pendiente hasta su primer inicio de sesión.",
                        fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
                Mensaje(msg)
                Separador(Modifier.padding(vertical = 6.dp))
                for (m in miembros) {
                    val elDueno = m.userId == ownerId
                    FilaPersona(m, yoId, Roles.nombre(if (elDueno) "owner" else m.role), conMenu = esDueno && !elDueno) { deQuien = m }
                }
                if (esDueno && pendientes.isNotEmpty()) {
                    TituloSeccion("Invitaciones pendientes")
                    for (i in pendientes) Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icono("mail", tam = 18.dp, color = C.apagado)
                        Text(i.destino, fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 12.dp))
                        Text(Roles.nombre(i.role), fontSize = 12.sp, color = C.apagado)
                        TextButton({ muta("workspace.cancelInvite", objeto("id" to i.id)) }) { Text("Anular", color = C.apagado, fontSize = 13.sp) }
                    }
                }
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (r in Roles.ROLES) Text(
                        androidx.compose.ui.text.buildAnnotatedString {
                            pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Medium, color = C.texto)); append(r.nombre + ": "); pop()
                            append(r.desc)
                        },
                        fontSize = 12.sp, color = C.apagado,
                    )
                }
            } else {
                Text(
                    "Personas de fuera del espacio que solo ven las páginas que se les han compartido (desde «Compartir» de cada página).",
                    fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(16.dp),
                )
                Mensaje(msg)
                if (invitados.isEmpty()) Vacio("Aún no has compartido ninguna página con alguien de fuera del espacio.", icono = "users")
                for (m in invitados) FilaPersona(m, yoId, "Invitado", conMenu = esDueno) { deQuien = m }
            }
        }
    }

    deQuien?.let { p ->
        Hoja({ deQuien = null }, p.nombre) {
            if (p.role == "guest") {
                FilaMenu("Convertir en miembro", "user-plus", detalle = Roles.ROLES[1].desc) { elige(p, "editor") }
                FilaMenu("Convertir en lector", "eye", detalle = Roles.ROLES[2].desc) { elige(p, "viewer") }
            } else for (r in Roles.ROLES) {
                FilaMenu(r.nombre, null, detalle = r.desc, derecha = { if (r.id == p.role) Icono("check", color = Marca) }) { elige(p, r.id) }
            }
            FilaMenu("Quitar del espacio", "user-minus", color = ROJO) { elige(p, "quitar") }
        }
    }
    confirma?.let { (p, valor, titulo, texto) ->
        Confirmar(
            titulo, texto,
            boton = when (valor) { "quitar" -> "Quitar"; "owner" -> "Traspasar"; else -> "Convertir" }, peligro = valor == "quitar",
            onSi = {
                confirma = null
                when (valor) {
                    "quitar" -> muta("workspace.unshare", objeto("userId" to p.userId))
                    // Ya no es propietario: lo que vea depende del nuevo rol.
                    "owner" -> muta("workspace.transfer", objeto("userId" to p.userId)) { s.repo.avisa("espacio"); msg = ("${p.nombre} es ahora el propietario." to false) }
                    else -> muta("workspace.setRole", objeto("userId" to p.userId, "role" to valor))
                }
            },
            onNo = { confirma = null },
        )
    }
}

private data class Confirma(val p: Persona, val valor: String, val titulo: String, val texto: String)

@Composable
private fun Mensaje(msg: Pair<String, Boolean>?) {
    msg?.let { (t, error) -> Text(t, fontSize = 13.sp, color = if (error) ROJO else C.apagado, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) }
}

@Composable
private fun FilaPersona(p: Persona, yoId: String?, rol: String, conMenu: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = conMenu, onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(C.activo), contentAlignment = Alignment.Center) {
            Text(p.nombre.take(1).uppercase(), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = C.texto)
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(p.nombre + if (p.userId == yoId) " (tú)" else "", fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!p.name.isNullOrBlank()) Text(p.email, fontSize = 12.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(rol, fontSize = 13.sp, color = C.apagado)
        if (conMenu) Icono("chevron-down", tam = 14.dp, color = C.apagado, modifier = Modifier.padding(start = 4.dp))
    }
}
