package com.monrealperez.notiono.ui.ajustes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.copia.ConfigCopia
import com.monrealperez.notiono.copia.CopiaNas
import com.monrealperez.notiono.copia.Dsm
import com.monrealperez.notiono.copia.ErrorCopia
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.Confirmar
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.espacios.BotonMarca
import com.monrealperez.notiono.ui.espacios.Espacios
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Fechas
import kotlinx.coroutines.launch

private val ROJO = Color(0xFFD44C47)

/** Lo que dice la fila de Ajustes: si está puesta y cómo fue la última. */
fun resumenCopia(copia: CopiaNas): String {
    if (!copia.activa()) return "Un Word de cada página en tu Synology Drive"
    val e = copia.estado()
    return when {
        e.error != null -> "Error: ${e.error}"
        e.ultima != null -> "Última copia: ${Fechas.haceCuanto(e.ultima)}"
        else -> "Conectada; aún no ha terminado ninguna copia"
    }
}

/**
 * Ajustes → «Copia en el NAS»: la conexión con el Synology (servidor, carpeta, usuario y
 * contraseña, que se queda cifrada en el móvil), qué espacios se copian, cómo fue la última
 * copia y «Copiar ahora» / «Desconectar». La copia la hace [CopiaNas].
 */
@Composable
fun PantallaCopiaNas() {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val copia = s.copia
    var vuelta by remember { mutableIntStateOf(0) }
    val conf = remember(vuelta) { copia.config() }
    val estado = remember(vuelta) { copia.estado() }
    val inicial = conf ?: ConfigCopia(usuario = s.sesion.email?.substringBefore("@").orEmpty())
    var servidor by remember(conf) { mutableStateOf(inicial.servidor) }
    var carpeta by remember(conf) { mutableStateOf(inicial.carpeta) }
    var usuario by remember(conf) { mutableStateOf(inicial.usuario) }
    var pass by remember { mutableStateOf("") }
    // Si la copia de fondo se quedó esperando el código, se pide ya al entrar.
    var codigo by remember { mutableStateOf(if (pideCodigo(estado.error)) "" else null) }
    var ocupado by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var desconectar by remember { mutableStateOf(false) }
    val lista = Espacios.lista(rememberConsulta("workspace.list", etiquetas = setOf("espacios")).datos).filter { it.rol != "guest" }

    // En el alcance de la app: salir de la pantalla no corta una copia a medias.
    fun copiar() = s.alcance.launch {
        ocupado = true
        msg = "Copiando…"
        val e = copia.copia()
        vuelta++
        ocupado = false
        msg = e ?: "Copia hecha"
        if (pideCodigo(e)) codigo = ""
    }

    fun conectar() = s.alcance.launch {
        ocupado = true
        msg = null
        try {
            copia.conecta(ConfigCopia(servidor, carpeta, usuario, conf?.espacios), pass, codigo)
            pass = ""
            codigo = null
            vuelta++
            ocupado = false
            copiar()
        } catch (e: ErrorCopia) {
            if (e.pideCodigo) codigo = ""
            msg = e.message
            ocupado = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        BarraSuperior("Copia en el NAS", izquierda = { BotonIcono("arrow-left", { n.atras() }) })
        Column(Modifier.verticalScroll(rememberScrollState())) {
            Text(
                "Guarda un Word de cada página en tu Synology Drive, con las mismas carpetas que el árbol de páginas: cada 6 horas y un rato después de editar. Solo sube lo que ha cambiado. La contraseña del NAS se queda cifrada en este móvil.",
                fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            if (conf != null) {
                TituloSeccion("Estado")
                Text(
                    estado.ultima?.let { "Última copia: ${Fechas.fechaHora(it)} (${Fechas.haceCuanto(it)})" } ?: "Aún no ha terminado ninguna copia",
                    fontSize = 14.sp, color = C.texto, modifier = Modifier.padding(horizontal = 16.dp),
                )
                Text(
                    (if (estado.subidos.size == 1) "1 página" else "${estado.subidos.size} páginas") + " en la copia, en ${conf.carpeta}",
                    fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp),
                )
                estado.error?.let { Text("Último error: $it", fontSize = 13.sp, color = ROJO, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)) }
                Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), horizontalArrangement = Arrangement.End) {
                    BotonMarca("Copiar ahora", activo = !ocupado) { copiar() }
                }
            }

            TituloSeccion("Conexión con el NAS")
            Etiqueta("Servidor")
            Campo(servidor, { servidor = it }, Modifier.padding(horizontal = 16.dp), placeholder = ConfigCopia.SERVIDOR, teclado = KeyboardOptions(keyboardType = KeyboardType.Uri))
            Etiqueta("Carpeta")
            Campo(carpeta, { carpeta = it }, Modifier.padding(horizontal = 16.dp), placeholder = ConfigCopia.CARPETA)
            Etiqueta("Usuario")
            Campo(usuario, { usuario = it }, Modifier.padding(horizontal = 16.dp))
            Etiqueta("Contraseña")
            OutlinedTextField(
                pass, { pass = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                placeholder = { Text(if (conf != null) "Guardada (vacía = no cambiarla)" else "", color = C.apagado) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                shape = RoundedCornerShape(8.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Marca, unfocusedBorderColor = C.borde, cursorColor = Marca),
            )
            codigo?.let { c ->
                Etiqueta("Código de verificación en dos pasos (6 cifras de tu app de códigos)")
                Campo(c, { codigo = it.filter(Char::isDigit).take(6) }, Modifier.padding(horizontal = 16.dp), autofoco = true, teclado = KeyboardOptions(keyboardType = KeyboardType.NumberPassword))
            }
            msg?.let { Text(it, fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) }
            Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), horizontalArrangement = Arrangement.End) {
                BotonMarca(
                    when {
                        codigo != null -> "Entrar con el código"
                        conf == null -> "Conectar"
                        else -> "Guardar y probar"
                    },
                    activo = !ocupado && usuario.isNotBlank() && servidor.isNotBlank() && (pass.isNotEmpty() || conf != null) && (codigo == null || codigo!!.length == 6),
                ) { conectar() }
            }

            if (conf != null) {
                TituloSeccion("Qué espacios se copian")
                val elegidos = CopiaNas.elegidos(conf, lista, s.api.espacio()).map { it.id }
                for (e in lista) {
                    val si = e.id in elegidos
                    val cambia = {
                        copia.guardaEspacios(if (si) elegidos - e.id else elegidos + e.id)
                        vuelta++
                    }
                    FilaMenu(
                        e.name, "folder",
                        detalle = if (e.isOwner && !e.compartido) "Privado" else "Compartido · ${e.miembros} miembros",
                        derecha = { Switch(si, { cambia() }, colors = SwitchDefaults.colors(checkedTrackColor = Marca)) },
                    ) { cambia() }
                }
                Text("Cada espacio va en su carpeta. Los compartidos se copian solo si los marcas.", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                Separador(Modifier.padding(vertical = 8.dp))
                FilaMenu("Desconectar", "log-out", color = ROJO, detalle = "Borra del móvil la contraseña y lo apuntado de la copia. Lo copiado se queda en el NAS.") { desconectar = true }
            }
        }
    }
    if (desconectar) Confirmar(
        "¿Desconectar la copia?", "Se borran de este móvil la contraseña del NAS y lo apuntado de la copia, y deja de copiarse. Lo que ya está en el NAS no se toca.",
        boton = "Desconectar",
        onSi = {
            desconectar = false
            s.alcance.launch {
                copia.desconecta()
                codigo = null
                msg = "Desconectado"
                vuelta++
            }
        },
        onNo = { desconectar = false },
    )
}

/** La copia (que solo devuelve el texto del error) se paró porque el NAS pide el código de dos pasos. */
private fun pideCodigo(error: String?) = error == Dsm.errorEntrar(403) || error == Dsm.errorEntrar(404)

@Composable
private fun Etiqueta(texto: String) =
    Text(texto, fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 2.dp))
