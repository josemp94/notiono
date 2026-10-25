package com.monrealperez.notiono.ui.espacios

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Yo
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.rememberAlcance
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.pagina.SelectorIcono
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.widgets.Widgets
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Un espacio del selector, como lo da `workspace.list`. */
@Serializable
data class EspacioLista(
    val id: String,
    val name: String = "Espacio",
    val icon: String? = null,
    val isOwner: Boolean = false,
    val rol: String = "viewer",
    val ownerName: String = "",
    val compartido: Boolean = false,
    val miembros: Int = 1,
    val sinLeer: Int = 0,
)

/** Los roles y niveles con los nombres de la web (que son los de Notion). */
object Roles {
    data class Rol(val id: String, val nombre: String, val desc: String)

    val ROLES = listOf(
        Rol("owner", "Propietario del espacio", "Cambia los ajustes del espacio e invita a personas."),
        Rol("editor", "Miembro", "Ve y edita todo lo que no esté restringido; no cambia los ajustes."),
        Rol("viewer", "Lector", "Ve el espacio, pero no edita nada."),
    )

    fun nombre(r: String?): String = if (r == "guest") "Invitado" else ROLES.find { it.id == r }?.nombre ?: r.orEmpty()

    /** El de debajo del nombre del espacio en el selector. */
    fun corto(r: String?): String = when (r) {
        "owner" -> "Propietario"
        "editor" -> "Miembro"
        "viewer" -> "Lector"
        "guest" -> "Invitado"
        else -> ""
    }

    /** Niveles de una página, del que menos al que más puede (el «Compartir» de la web). */
    val NIVELES = listOf("view" to "Ver", "comment" to "Comentar", "edit" to "Editar", "full" to "Acceso total")

    fun nivel(n: String?): String = NIVELES.find { it.first == n }?.second ?: n.orEmpty()

    /** «Propietario · 3 miembros»; a un invitado no se le dice cuántos hay. */
    fun subtitulo(rol: String?, miembros: Int?): String = listOfNotNull(
        corto(rol).ifBlank { null },
        if (miembros != null && rol != "guest") (if (miembros == 1) "1 miembro" else "$miembros miembros") else null,
    ).joinToString(" · ")
}

/**
 * Lo que la app ofrece según el rol en el espacio activo: lo mismo que esconde la web
 * (el servidor lo comprueba igual; aquí solo no se ofrece lo que daría «prohibido»).
 * El invitado de página (el «guest» de Notion) solo tiene lo compartido con él.
 */
data class Puede(val rol: String?) {
    val invitado get() = rol == "guest"
    val propietario get() = rol == "owner"

    /** Crear en la raíz, plantillas, importar, nueva base de datos (la `canEdit` del panel web). */
    val crear get() = rol != "viewer" && !invitado
    val papelera get() = !invitado
    val misTareas get() = !invitado
    val personas get() = !invitado

    /** Mover, duplicar o mandar a la papelera una página, y cambiar la vista de una base. */
    val organizar get() = !invitado

    /** Compartir y publicar: con acceso total a la página y sin ser invitado. */
    fun compartir(nivel: String?) = nivel == "full" && !invitado

    companion object {
        fun de(yo: Yo?) = Puede(yo?.wsRole)
    }
}

object Espacios {
    fun lista(datos: JsonElement?): List<EspacioLista> =
        datos?.comoLista?.mapNotNull { runCatching { json.decodeFromJsonElement(EspacioLista.serializer(), it) }.getOrNull() } ?: emptyList()

    /** Nunca el último propio: la web tampoco deja eliminarlo. */
    fun unicoPropio(lista: List<EspacioLista>) = lista.count { it.isOwner } <= 1

    /** A dónde se puede «Mover a» una página: el activo y donde puedes crear (dueño o miembro). */
    fun destinosMover(lista: List<EspacioLista>, actual: String?) = lista.filter { it.id == actual || it.rol == "owner" || it.rol == "editor" }

    /** ¿Hay avisos sin leer en otro espacio? (el punto naranja del selector, como en la web). */
    fun avisosFuera(lista: List<EspacioLista>, actual: String?) = lista.any { it.id != actual && it.sinLeer > 0 }

    /**
     * Pasa a otro espacio (la cookie `notiono_ws` de la app): todas las pantallas se
     * repintan con lo de ese espacio y la caché de los demás se queda donde estaba. Con
     * `comprobar`, antes pregunta al servidor si sigues dentro (un aviso o un enlace
     * viejos); sin red, pasa igual. Devuelve false si no se pudo.
     */
    suspend fun pasaA(ctx: Context, id: String, comprobar: Boolean = true): Boolean {
        val s = Servicios.de(ctx)
        if (id == s.espacioActivo()) return true
        if (comprobar) {
            try {
                s.api.mutation("workspace.switch", objeto("workspaceId" to id))
            } catch (e: ErrorApi) {
                if (!e.sinConexion) {
                    Avisos.di(if (e.tipo == ErrorApi.Tipo.NoEncontrado) "Ya no estás en ese espacio" else (e.message ?: "No se pudo cambiar de espacio"))
                    return false
                }
            }
        }
        s.sesion.espacio = id
        s.repo.avisa("espacio", "arbol", "favoritos", "bandeja", "inicio", "tareas", "recientes")
        // El widget de recientes enseña los del espacio activo.
        s.alcance.launch { runCatching { Widgets.actualizaTodo(ctx, "espacio") } }
        return true
    }

    /**
     * Para lo que se abre con un id de otro espacio (un widget, un recordatorio): si el
     * servidor dice que no está aquí, pregunta en qué espacio está y pasa a él (como
     * `PaginaNoEncontrada` de la web). true si cambió.
     */
    suspend fun buscaPagina(ctx: Context, pageId: String): Boolean {
        val s = Servicios.de(ctx)
        val ws = runCatching { s.repo.consulta("workspace.dePagina", objeto("pageId" to pageId), cachear = false) }
            .getOrNull()?.comoObjeto?.str("workspaceId") ?: return false
        return pasaA(ctx, ws, comprobar = false)
    }
}

/** El icono del espacio (el que se elige, como el de una página) o un cuadradito con su inicial. */
@Composable
fun IconoEspacio(nombre: String, icon: String?, tam: Dp = 26.dp) {
    Box(Modifier.size(tam).clip(RoundedCornerShape(6.dp)).background(if (icon == null) C.activo else Color.Transparent), contentAlignment = Alignment.Center) {
        if (icon != null) IconoPagina(icon, tam * 0.75f)
        else Text(nombre.trim().take(1).uppercase().ifBlank { "·" }, fontWeight = FontWeight.Bold, color = C.texto, fontSize = (tam.value * 0.55f).sp)
    }
}

/** Opciones en fila, como un desplegable corto (rol al invitar, nivel de una página). */
@Composable
fun Segmentos(opciones: List<Pair<String, String>>, elegida: String, onElegir: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for ((v, t) in opciones) {
            val si = v == elegida
            Text(
                t, fontSize = 13.sp, color = if (si) Marca else C.texto, maxLines = 1,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, if (si) Marca else C.borde, RoundedCornerShape(8.dp))
                    .background(if (si) C.marcaSuave else Color.Transparent).clickable { onElegir(v) }.padding(horizontal = 10.dp, vertical = 7.dp),
            )
        }
    }
}

/** Botón de acción de la marca (Invitar, Crear espacio, Guardar). */
@Composable
fun BotonMarca(texto: String, activo: Boolean = true, peligro: Boolean = false, onClick: () -> Unit) {
    val fondo = if (peligro) Color(0xFFEF4444) else Marca
    Text(
        texto, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium,
        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (activo) fondo else fondo.copy(alpha = 0.45f))
            .clickable(enabled = activo, onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
    )
}

/**
 * El selector de espacios (tocar el nombre del espacio arriba del panel), como el de la
 * web y el de Notion: arriba el activo con «Ajustes» e «Invitar miembros»; debajo todos,
 * el activo marcado y los avisos sin leer de los demás; al final «Nuevo espacio».
 */
@Composable
fun HojaEspacios(yo: Yo?, onCerrar: () -> Unit, onCambiado: () -> Unit, onAjustes: () -> Unit, onInvitar: () -> Unit) {
    val ctx = LocalContext.current
    val alcance = rememberAlcance()
    val lista = Espacios.lista(rememberConsulta("workspace.list", etiquetas = setOf("espacios", "bandeja")).datos)
    val actualId = yo?.workspace?.id
    val actual = lista.find { it.id == actualId }
    var nuevo by remember { mutableStateOf(false) }
    if (nuevo) return NuevoEspacio(onCerrar = { nuevo = false; onCerrar() }, onCreado = { onCerrar(); onCambiado() })
    Hoja(onCerrar) {
        val nombre = yo?.workspace?.name ?: actual?.name ?: "Espacio"
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconoEspacio(nombre, yo?.workspace?.icon, 36.dp)
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Text(nombre, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(Roles.subtitulo(yo?.wsRole, actual?.miembros), fontSize = 12.sp, color = C.apagado)
            }
        }
        Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BotonBorde("Ajustes", "settings", onAjustes)
            if (yo?.wsRole == "owner") BotonBorde("Invitar miembros", "user-plus", onInvitar)
        }
        Separador(Modifier.padding(vertical = 6.dp))
        yo?.email?.let { Text(it, fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)) }
        for (w in lista) {
            Row(
                Modifier.fillMaxWidth().clickable {
                    if (w.id == actualId) return@clickable onCerrar()
                    alcance.launch { if (Espacios.pasaA(ctx, w.id)) { onCerrar(); onCambiado() } }
                }.padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                IconoEspacio(w.name, w.icon, 24.dp)
                Text(w.name, fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (w.isOwner) { if (w.compartido) Icono("users", tam = 14.dp, color = C.apagado) }
                else Text("de ${w.ownerName}", fontSize = 11.sp, color = C.apagado, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(0.6f, fill = false))
                if (w.id != actualId && w.sinLeer > 0) Text(
                    if (w.sinLeer > 99) "99+" else "${w.sinLeer}", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.clip(CircleShape).background(Marca).padding(horizontal = 6.dp, vertical = 1.dp),
                )
                if (w.id == actualId) Icono("check", tam = 16.dp, color = Marca)
            }
        }
        FilaMenu("Nuevo espacio", "plus", color = C.apagado) { nuevo = true }
    }
}

@Composable
private fun BotonBorde(texto: String, icono: String, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp)).clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icono(icono, tam = 15.dp, color = C.apagado)
        Text(texto, fontSize = 13.sp, color = C.texto)
    }
}

/** «Nuevo espacio»: nombre e icono; al crearlo se pasa a él (como la web). */
@Composable
fun NuevoEspacio(onCerrar: () -> Unit, onCreado: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val alcance = rememberAlcance()
    var nombre by remember { mutableStateOf("") }
    var icono by remember { mutableStateOf<String?>(null) }
    var eligiendo by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var creando by remember { mutableStateOf(false) }
    fun crear() {
        if (nombre.isBlank() || creando) return
        creando = true
        error = null
        alcance.launch {
            try {
                val r = s.repo.mutacion("workspace.create", objeto("name" to nombre, "icon" to icono), encolable = false, etiquetas = listOf("espacios"))
                val id = r?.comoObjeto?.str("id") ?: error("sin id")
                Espacios.pasaA(ctx, id, comprobar = false)
                Avisos.di("Estás en «${nombre.trim()}»")
                onCreado()
            } catch (e: ErrorApi) {
                error = if (e.sinConexion) "Sin conexión: no se puede crear el espacio" else e.message
            } finally {
                creando = false
            }
        }
    }
    if (eligiendo) return SelectorIcono(onElegir = { icono = it; eligiendo = false }, onCerrar = { eligiendo = false })
    Hoja(onCerrar, "Nuevo espacio") {
        Text(
            "Un espacio aparte, con sus páginas y sus personas. Lo puedes compartir luego con quien quieras.",
            fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp),
        )
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, C.borde, RoundedCornerShape(8.dp)).clickable { eligiendo = true },
                contentAlignment = Alignment.Center,
            ) {
                if (icono != null || nombre.isNotBlank()) IconoEspacio(nombre, icono, 30.dp) else Icono("smile-plus", tam = 22.dp, color = C.apagado)
            }
            Campo(nombre, { nombre = it.take(80) }, Modifier.weight(1f), placeholder = "Nombre del espacio (p. ej. Casa)", autofoco = true)
        }
        error?.let { Text(it, color = Color(0xFFEF4444), fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp)) }
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onCerrar) { Text("Cancelar", color = C.texto) }
            BotonMarca("Crear espacio", activo = nombre.isNotBlank() && !creando) { crear() }
        }
    }
}

/** Quién soy en el espacio activo (`auth.me`, al instante desde la caché). */
@Composable
fun rememberYo(): Yo? =
    rememberConsulta("auth.me", etiquetas = setOf("espacio", "espacios", "perfil")).datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }

/** Lo que mi rol deja hacer en el espacio activo. */
@Composable
fun rememberPuede(): Puede = Puede.de(rememberYo())
