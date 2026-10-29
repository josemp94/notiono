package com.monrealperez.notiono.ui

import android.net.Uri
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import com.monrealperez.notiono.compartir.bloquesCompartidos
import com.monrealperez.notiono.util.Fechas
import java.io.File
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.int
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.ui.ajustes.PantallaAjustes
import com.monrealperez.notiono.ui.bandeja.PantallaBandeja
import com.monrealperez.notiono.ui.buscar.PantallaBuscar
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.espacios.Espacios
import com.monrealperez.notiono.ui.espacios.PantallaEspacioGeneral
import com.monrealperez.notiono.ui.espacios.PantallaPersonas
import com.monrealperez.notiono.ui.espacios.rememberPuede
import com.monrealperez.notiono.ui.inicio.PantallaInicio
import com.monrealperez.notiono.ui.pagina.PantallaFila
import com.monrealperez.notiono.ui.pagina.PantallaPagina
import com.monrealperez.notiono.ui.panel.Panel
import com.monrealperez.notiono.ui.papelera.PantallaPapelera
import com.monrealperez.notiono.ui.plantillas.PantallaPlantillas
import com.monrealperez.notiono.ui.tareas.PantallaTareas
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/** Lo que cualquier pantalla puede pedir al armazón: navegar, abrir el panel, crear. */
class Navegador(
    val nav: NavHostController,
    val abrirPanel: () -> Unit,
    private val crea: (parentId: String?, ubicar: Boolean) -> Unit,
) {
    /**
     * Página nueva. `ubicar`: la del botón de nueva página, el Inicio y los widgets, como Notion
     * en el móvil: se crea en la raíz y se abre con «Añadir a ▾» para elegir dónde dejarla.
     */
    fun nuevaPagina(parentId: String?, ubicar: Boolean = false) = crea(parentId, ubicar)
    /** Página nueva con una foto de la cámara (widget y Acciones rápidas del Inicio); la pone Principal. */
    var foto: () -> Unit = {}
    // Los ids que no lo parecen (una mención rota dentro de un documento) no navegan: la
    // ruta no casaría con ningún destino y la app se cerraría.
    fun pagina(id: String, alFinal: Boolean = false, vista: String? = null, nueva: Boolean = false) {
        if (!Destino.esId(id)) return Avisos.di("Enlace a una página que no existe")
        nav.navigate(rutaPagina(id, alFinal, vista, nueva)) { launchSingleTop = true }
    }
    fun fila(pageId: String, recordId: String) {
        if (!Destino.esId(pageId) || !Destino.esId(recordId)) return Avisos.di("Enlace a una fila que no existe")
        nav.navigate("fila/$pageId/$recordId")
    }
    fun a(ruta: String) = nav.navigate(ruta) { launchSingleTop = true }
    fun atras() {
        if (!nav.popBackStack()) nav.navigate("inicio")
    }

    companion object {
        /** La ruta de una página; `nueva`: recién creada sin sitio (sale «Añadir a ▾»). */
        fun rutaPagina(id: String, alFinal: Boolean = false, vista: String? = null, nueva: Boolean = false) =
            "pagina/$id?final=$alFinal" + (vista?.takeIf(Destino::esId)?.let { "&v=$it" } ?: "") + (if (nueva) "&nueva=true" else "")
    }
}

val LocalNavegador = staticCompositionLocalOf<Navegador> { error("sin navegador") }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Principal(destinos: Flow<Destino>) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val nav = rememberNavController()
    val panel = rememberDrawerState(DrawerValue.Closed)
    val alcance = rememberAlcance()
    val avisos = remember { SnackbarHostState() }

    val nuevaPagina: (String?, Boolean) -> Unit = { padre, ubicar ->
        alcance.launch {
            try {
                val r = s.repo.mutacion("pages.create", objeto("parentId" to padre, "title" to ""), encolable = false, etiquetas = listOf("arbol"))
                r?.comoObjeto?.str("id")?.let { id -> nav.navigate(Navegador.rutaPagina(id, nueva = ubicar && padre == null)) }
            } catch (e: ErrorApi) {
                Avisos.di(if (e.sinConexion) "Sin conexión: no se puede crear la página" else (e.message ?: "No se pudo crear"))
            }
        }
    }
    val navegador = remember(nav) {
        Navegador(nav, abrirPanel = { alcance.launch { panel.open() } }, crea = nuevaPagina)
    }
    // «Foto» del widget de acciones: la cámara y, con la foto, una página nueva que la lleva.
    var fotoUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    val camara = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val u = fotoUri
        if (ok && u != null) alcance.launch {
            Avisos.di("Subiendo la foto…")
            try {
                val bloques = bloquesCompartidos(ctx, null, listOf(u))
                val titulo = "Foto ${Fechas.fechaHora(java.time.Instant.now().toString())}"
                val id = s.repo.mutacion("pages.create", objeto("title" to titulo), encolable = false, etiquetas = listOf("arbol"))?.comoObjeto?.str("id")!!
                s.repo.mutacion("app.aplicar", objeto("id" to id, "ops" to bloques.map { objeto("op" to "upsert", "block" to it) }), encolable = false)
                navegador.pagina(id, nueva = true)
            } catch (e: Exception) {
                Avisos.di(if (e is ErrorApi && e.sinConexion) "Sin conexión: no se puede subir la foto" else e.message ?: "No se pudo guardar la foto")
            }
        }
    }

    navegador.foto = {
        val u = FileProvider.getUriForFile(ctx, "${ctx.packageName}.ficheros", File(ctx.cacheDir, "foto-${System.currentTimeMillis()}.jpg"))
        fotoUri = u
        com.monrealperez.notiono.util.Enlaces.lanza(camara, u, "No hay ninguna app de cámara")
    }

    // Enlaces, atajos y widgets.
    LaunchedEffect(Unit) {
        // En el hilo principal: tras pasar de espacio (red de por medio) se navega, y el
        // NavController no deja hacerlo desde otro hilo.
        destinos.collect { abre -> kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main.immediate) {
            // De otro espacio (un aviso, el push de la web): primero se pasa a él, como la web con /api/espacio/<id>.
            val d = if (abre is Destino.EnEspacio) {
                if (!Espacios.pasaA(ctx, abre.espacio)) return@withContext
                abre.destino
            } else abre
            when (d) {
                is Destino.EnEspacio -> {}
                is Destino.Espacio -> if (Espacios.pasaA(ctx, d.id)) nav.navigate("inicio") { popUpTo(0) { inclusive = true } }
                is Destino.Pagina -> navegador.pagina(d.id, vista = d.vista)
                is Destino.Fila -> navegador.fila(d.pageId, d.recordId)
                Destino.Buscar -> navegador.a("buscar")
                Destino.Bandeja -> navegador.a("bandeja")
                Destino.Foto -> navegador.foto()
                // El «+» de los widgets Lista y Calendario: fila nueva en esa BD y a su ficha.
                is Destino.NuevaFila -> alcance.launch {
                    try {
                        // Un widget de otro espacio: si la base no está en este, se pasa al suyo.
                        val vista = try {
                            s.repo.consulta("app.vista", objeto("pageId" to d.pageId))
                        } catch (e: ErrorApi) {
                            if (e.tipo != ErrorApi.Tipo.NoEncontrado || !Espacios.buscaPagina(ctx, d.pageId)) throw e
                            s.repo.consulta("app.vista", objeto("pageId" to d.pageId))
                        }
                        val col = vista.comoObjeto["collection"]?.comoObjeto?.str("id")
                        val fila = s.repo.mutacion("db.addRecord", objeto("collectionId" to col), encolable = false, etiquetas = listOf("vista:${d.pageId}"))
                            ?.comoObjeto?.str("id")
                        // Desde el Calendario: ya con el día elegido.
                        if (fila != null && d.campo != null && d.fecha != null) {
                            s.repo.mutacion("db.updateCell", objeto("recordId" to fila, "fieldId" to d.campo, "value" to d.fecha), encolable = false, etiquetas = listOf("vista:${d.pageId}"))
                        }
                        fila?.let { navegador.fila(d.pageId, it) }
                    } catch (e: ErrorApi) {
                        Avisos.di(e.message ?: "No se pudo crear la fila")
                    }
                }
                Destino.Nueva -> nuevaPagina(null, true)
                is Destino.NotaRapida -> if (d.paginaDestino != null) navegador.pagina(d.paginaDestino, alFinal = true) else nuevaPagina(null, true)
            }
        } }
    }
    // Avisos de fechas que vencen (como la web al abrir) y sesión caducada.
    LaunchedEffect(Unit) {
        runCatching { s.repo.mutacion("notifications.checkDue", encolable = false) }
    }
    LaunchedEffect(Unit) { s.repo.noAutorizado.collect { s.sesion.olvida() } }
    LaunchedEffect(Unit) {
        Avisos.flujo.collect { a ->
            val r = avisos.showSnackbar(a.texto, actionLabel = a.accion, withDismissAction = a.accion == null)
            if (r == SnackbarResult.ActionPerformed) a.alPulsar?.invoke()
        }
    }

    AlArrancar()
    CompositionLocalProvider(LocalNavegador provides navegador) {
        ModalNavigationDrawer(
            drawerState = panel,
            drawerContent = {
                ModalDrawerSheet(drawerContainerColor = C.superficie, modifier = Modifier.width(310.dp)) {
                    Panel(onCerrar = { alcance.launch { panel.close() } })
                }
            },
        ) {
            val entrada by nav.currentBackStackEntryAsState()
            val ruta = entrada?.destination?.route ?: "inicio"
            Box(Modifier.fillMaxSize().background(C.fondo)) {
                Column(Modifier.fillMaxSize()) {
                    NavHost(nav, startDestination = "inicio", modifier = Modifier.weight(1f)) {
                        composable("inicio") { PantallaInicio() }
                        composable("buscar") { PantallaBuscar() }
                        composable("tareas") { PantallaTareas() }
                        composable("bandeja") { PantallaBandeja() }
                        composable("ajustes") { PantallaAjustes() }
                        composable("ajustes/copia") { com.monrealperez.notiono.ui.ajustes.PantallaCopiaNas() }
                        composable("papelera") { PantallaPapelera() }
                        composable("plantillas") { PantallaPlantillas() }
                        composable("espacio/general") { PantallaEspacioGeneral() }
                        composable("espacio/personas") { PantallaPersonas() }
                        composable(
                            "pagina/{id}?final={final}&v={v}&nueva={nueva}",
                            arguments = listOf(
                                navArgument("id") { type = NavType.StringType },
                                navArgument("final") { type = NavType.BoolType; defaultValue = false },
                                navArgument("v") { type = NavType.StringType; nullable = true; defaultValue = null },
                                navArgument("nueva") { type = NavType.BoolType; defaultValue = false },
                            ),
                        ) { e ->
                            PantallaPagina(
                                e.arguments!!.getString("id")!!, alFinal = e.arguments!!.getBoolean("final"), vista = e.arguments!!.getString("v"),
                                nueva = e.arguments!!.getBoolean("nueva"),
                            )
                        }
                        composable("fila/{pageId}/{recordId}") { e ->
                            PantallaFila(e.arguments!!.getString("pageId")!!, e.arguments!!.getString("recordId")!!)
                        }
                    }
                    // La barra de abajo, como la web en el móvil; se esconde con el teclado.
                    if (!WindowInsets.isImeVisible) BarraInferior(ruta, navegador)
                }
                SnackbarHost(avisos, Modifier.align(Alignment.BottomCenter).padding(bottom = 72.dp).navigationBarsPadding())
            }
        }
    }
}

@Composable
private fun BarraInferior(ruta: String, n: Navegador) {
    val s = Servicios.de(LocalContext.current)
    val sinLeer = rememberConsulta("notifications.unreadCount", etiquetas = setOf("bandeja"), cadaMs = 60_000)
    val cuantas = (sinLeer.datos as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
    val sinRed by s.repo.sinConexion.collectAsState()
    // El invitado de página no crea en la raíz ni tiene Mis tareas (como la barra de la web).
    val puede = rememberPuede()
    Column(Modifier.fillMaxWidth().background(C.superficie).navigationBarsPadding()) {
        if (sinRed) {
            Text(
                "Sin conexión · lo que cambies se enviará al volver",
                fontSize = 12.sp, color = C.apagado,
                modifier = Modifier.fillMaxWidth().background(C.hover).padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
        Row(Modifier.fillMaxWidth().height(56.dp), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.CenterVertically) {
            ElementoBarra("house", "Inicio", ruta == "inicio") { n.nav.navigate("inicio") { popUpTo("inicio") { inclusive = true } } }
            ElementoBarra("search", "Buscar", ruta == "buscar") { n.a("buscar") }
            if (!puede.invitado) ElementoBarra("square-pen", "Nueva", false) { n.nuevaPagina(null, ubicar = true) }
            if (puede.misTareas) ElementoBarra("circle-check", "Tareas", ruta == "tareas") { n.a("tareas") }
            ElementoBarra("inbox", "Bandeja", ruta == "bandeja", insignia = cuantas) { n.a("bandeja") }
        }
    }
}

@Composable
private fun ElementoBarra(icono: String, texto: String, activo: Boolean, insignia: Int = 0, onClick: () -> Unit) {
    Column(
        Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(10.dp)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box {
            Icono(icono, tam = 22.dp, color = if (activo) C.texto else C.apagado, trazo = if (activo) 2.2f else 1.75f)
            if (insignia > 0) {
                Box(
                    Modifier.offset(x = 12.dp, y = (-4).dp).size(16.dp).clip(CircleShape).background(Marca),
                    contentAlignment = Alignment.Center,
                ) { Text(if (insignia > 9) "9+" else "$insignia", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold) }
            }
        }
        Text(texto, fontSize = 11.sp, color = if (activo) C.texto else C.apagado)
    }
}
