package com.monrealperez.notiono.ui.inicio

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.Arbol
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Campo
import com.monrealperez.notiono.ui.comun.EstadoConsulta
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.HojaElegirPagina
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.comun.PedirTexto
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.comun.rememberAlcance
import com.monrealperez.notiono.ui.tareas.FilaTarea
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Enlaces
import com.monrealperez.notiono.util.Fechas
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject

/** «Abrir al iniciar» se mira una vez por apertura de la app (lo rearma MainActivity). */
object ArranqueInicio {
    @Volatile var pendiente = true
}

private val TITULOS = mapOf(
    "recientes" to ("clock" to "Recientes"),
    "tareas" to ("circle-check" to "Mis tareas"),
    "hoy" to ("calendar-check" to "Tareas para hoy"),
    "proximas" to ("calendar-days" to "Próximas fechas"),
    "favoritos" to ("star" to "Favoritos"),
    "enlaces" to ("link-2" to "Enlaces fijados"),
    "acciones" to ("zap" to "Acciones rápidas"),
    "bloc" to ("sticky-note" to "Bloc de notas"),
    "nota" to ("pin" to "Nota fijada"),
    "recordatorios" to ("bell" to "Recordatorios"),
)

/**
 * Inicio, como el Home de Notion y el de la web: saludo y los bloques que cada persona
 * elige y ordena (ConfigInicio, guardado en el servidor). Con el botón de arriba,
 * «Personalizar»: mostrar u ocultar, subir y bajar, enlaces y «Abrir al iniciar».
 */
@Composable
fun PantallaInicio() {
    // El invitado de página no tiene tareas ni recordatorios del espacio: solo lo compartido
    // con él (como el Inicio de la web y el de Notion).
    val yo = com.monrealperez.notiono.ui.espacios.rememberYo()
    if (yo?.wsRole == "guest") InicioInvitado(yo) else InicioMiembro()
}

/** Inicio de un invitado: las páginas que le han compartido en este espacio. */
@Composable
private fun InicioInvitado(yo: Yo) {
    val n = LocalNavegador.current
    LaunchedEffect(Unit) { ArranqueInicio.pendiente = false }
    val arbol = Arbol.de(rememberConsulta("pages.tree", etiquetas = setOf("arbol")).datos)
    val raices = arbol.de(null)
    Column(Modifier.fillMaxSize()) {
        BarraSuperior(izquierda = { BotonIcono("panel-left", n.abrirPanel) })
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Text(
                "Compartido contigo", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = C.texto, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 8.dp),
            )
            Text(
                "Eres invitado en «${yo.workspace?.name.orEmpty()}»: solo ves las páginas que te han compartido, y lo que cuelga de ellas.",
                fontSize = 14.sp, color = C.apagado, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
            )
            if (raices.isNotEmpty()) Tarjetas(raices.map { Triple(it.id, it.title, it.icon) })
            else Text("Ya no tienes páginas compartidas en este espacio.", fontSize = 14.sp, color = C.apagado, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(24.dp))
        }
    }
}

@Composable
private fun InicioMiembro() {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val yo = rememberConsulta("auth.me", etiquetas = setOf("espacio")).datos?.let { runCatching { json.decodeFromJsonElement(Yo.serializer(), it) }.getOrNull() }
    val qInicio = rememberConsulta("inicio.get", etiquetas = setOf("inicio", "espacio", "arbol"))
    val datos = DatosInicio.de(qInicio.datos)
    val config = datos.config
    var editando by remember { mutableStateOf(false) }
    val ve = { id: String -> editando || config.visible(id) }
    val tareas = rememberConsulta("db.myTasks", etiquetas = setOf("tareas", "espacio")).datos?.comoLista?.map { it.comoObjeto } ?: emptyList()
    val favoritos = if (ve("favoritos")) rememberConsulta("favorites.list", etiquetas = setOf("favoritos", "arbol")).datos?.comoLista?.map { it.comoObjeto }.orEmpty() else emptyList()
    val recordatorios = if (ve("proximas") || ve("recordatorios")) rememberConsulta("inicio.recordatorios", etiquetas = setOf("espacio")).datos?.comoLista?.map { it.comoObjeto }.orEmpty() else emptyList()
    val recientes = remember(yo?.workspace?.id) { s.recientes.lista(yo?.workspace?.id) }

    // «Abrir al iniciar»: con lo guardado si lo hay (no se espera a la red para decidir).
    var decidiendo by remember { mutableStateOf(ArranqueInicio.pendiente) }
    LaunchedEffect(Unit) {
        if (!ArranqueInicio.pendiente) return@LaunchedEffect
        ArranqueInicio.pendiente = false
        val destino = withTimeoutOrNull(3000) {
            val cfg = ConfigInicio.de((s.repo.cacheada("inicio.get") ?: runCatching { s.repo.consulta("inicio.get") }.getOrNull())?.comoObjeto?.get("config"))
            if (cfg.abrir.tipo == "inicio") return@withTimeoutOrNull null
            val arbol = Arbol.de(s.repo.cacheada("pages.tree") ?: runCatching { s.repo.consulta("pages.tree") }.getOrNull())
            val espacio = s.repo.cacheada("auth.me")?.comoObjeto?.get("workspace")?.comoObjeto?.str("id")
            destinoAlIniciar(cfg.abrir, { it in arbol.porId }, s.recientes.lista(espacio).firstOrNull()?.pageId)
        }
        decidiendo = false
        destino?.let { n.pagina(it) }
    }

    fun guarda(nueva: ConfigInicio) = guardaInicio(s, qInicio, datos.copy(config = nueva), alcance)

    val saludo = saludo(LocalTime.now().hour)
    val nombre = yo?.name?.split(" ")?.firstOrNull().orEmpty()
    val hoy = LocalDate.now()

    val hoyLista = tareasDeHoy(tareas, hoy)
    val proximas = proximasFechas(tareas, recordatorios, hoy).take(10)
    val enlacesVivos = config.enlaces.filter { it.esWeb || it.pageId in datos.paginas }
    val tiene = { id: String ->
        when (id) {
            "recientes" -> recientes.isNotEmpty()
            "favoritos" -> favoritos.isNotEmpty()
            "tareas" -> tareas.isNotEmpty()
            "hoy" -> hoyLista.isNotEmpty()
            "proximas" -> proximas.isNotEmpty()
            "enlaces" -> enlacesVivos.isNotEmpty()
            "acciones" -> true
            "bloc" -> qInicio.datos != null
            "nota" -> config.nota != null && config.nota in datos.paginas
            "recordatorios" -> recordatorios.isNotEmpty()
            else -> false
        }
    }

    @Composable
    fun Contenido(id: String) {
        when (id) {
            "recientes" -> Tarjetas(recientes.take(8).map { Triple(it.pageId, it.title, it.icon) })
            "favoritos" -> Tarjetas(favoritos.map { Triple(it.str("id").orEmpty(), it.str("title").orEmpty(), it.str("icon")) })
            "tareas" -> {
                Lista { for (t in tareas.take(6)) FilaTarea(t) }
                if (tareas.size > 6) VerTodas()
            }
            "hoy" -> {
                Lista { for ((t, vencida) in hoyLista.take(8)) FilaTarea(t, vencida) }
                VerTodas()
            }
            "proximas" -> Lista {
                for (p in proximas) {
                    Row(
                        Modifier.fillMaxWidth().clickable { if (p.recordId != null) n.fila(p.pageId, p.recordId) else n.pagina(p.pageId) }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icono(if (p.recordatorio) "bell" else "circle-check", tam = 15.dp, color = C.apagado)
                        Text(p.titulo.ifBlank { "Sin título" }, fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
                        Text(Fechas.relativa(p.inicio), fontSize = 12.sp, color = C.apagado)
                    }
                }
            }
            "acciones" -> AccionesRapidas(config, ::guarda)
            "bloc" -> BlocNotas(config.bloc)
            "nota" -> config.nota?.let { NotaFijada(it, datos.paginas[it]?.first.orEmpty()) }
            "recordatorios" -> ListaRecordatorios(recordatorios)
            "enlaces" -> Lista {
                for (e in enlacesVivos) {
                    FilaEnlace(e, e.pageId?.let { datos.paginas[it] }) { if (e.esWeb) Enlaces.abre(ctx, e.url!!) else n.pagina(e.pageId!!) }
                }
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        BarraSuperior(
            izquierda = { BotonIcono("panel-left", n.abrirPanel) },
            acciones = {
                if (editando) TextButton({ editando = false }) { Text("Listo", color = Marca, fontWeight = FontWeight.SemiBold) }
                else TextButton({ editando = true }) {
                    Icono("sliders-horizontal", tam = 16.dp, color = C.apagado)
                    Text("Personalizar", color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
                }
            },
        )
        if (decidiendo) return@Column
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            // «Buenos días, Pablo · jueves 29 de octubre» y el buscador debajo, como en la web.
            Text(
                if (nombre.isNotBlank()) "$saludo, $nombre" else saludo,
                fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = C.texto, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
            )
            Text(
                fechaLarga(hoy).replaceFirstChar { it.uppercase() }, fontSize = 14.sp, color = C.apagado, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
            )
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 16.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.dp, C.borde, RoundedCornerShape(10.dp))
                    .clickable { n.a("buscar") }.padding(horizontal = 12.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icono("search", tam = 17.dp, color = C.apagado)
                Text("Buscar en Notiono…", color = C.apagado, fontSize = 15.sp, modifier = Modifier.padding(start = 8.dp))
            }
            if (editando) {
                Personalizar(datos, ::guarda)
            } else {
                val secciones = config.bloques.filter { it.visible && tiene(it.id) }
                for (b in secciones) {
                    val (icono, titulo) = TITULOS.getValue(b.id)
                    Encabezado(icono, titulo)
                    Contenido(b.id)
                }
                val alguno = secciones.isNotEmpty()
                if (!alguno) {
                    Text(
                        "Aquí saldrán tus páginas recientes y lo que tengas asignado. Abre una página del panel para empezar.",
                        color = C.apagado, fontSize = 14.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.padding(24.dp).fillMaxWidth().border(1.dp, C.borde, RoundedCornerShape(10.dp)).padding(24.dp),
                    )
                }
            }
        }
    }
}

/**
 * Guarda el Inicio: se pinta ya (y queda en la caché, por si no hay red) y se manda
 * detrás; sin red va a la cola y sale al volver.
 */
private fun guardaInicio(s: Servicios, q: EstadoConsulta, nuevo: DatosInicio, alcance: kotlinx.coroutines.CoroutineScope) {
    val paginas = nuevo.paginas.mapValues { (_, v) -> objeto("title" to v.first, "icon" to v.second) }
    // En la caché, también el bloc (no va en inicio.guardar: se guarda aparte).
    val conBloc = JsonObject(nuevo.config.aJson() + ("bloc" to kotlinx.serialization.json.JsonPrimitive(nuevo.config.bloc)))
    val json = objeto("config" to conBloc, "paginas" to paginas)
    q.datos = json
    s.repo.cache.guarda(s.repo.clave("inicio.get"), json)
    alcance.launch {
        try {
            s.repo.mutacion("inicio.guardar", nuevo.config.aJson(), etiquetas = listOf("inicio"))
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo guardar el Inicio")
            q.recargar()
        }
    }
}

/** Modo «Personalizar»: «Abrir al iniciar» y cada bloque con subir, bajar y mostrar/ocultar. */
@Composable
private fun Personalizar(datos: DatosInicio, guarda: (ConfigInicio) -> Unit) {
    val config = datos.config
    var eligiendo by remember { mutableStateOf(false) }
    Text("Al abrir Notiono, mostrar", color = C.apagado, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 16.dp, bottom = 4.dp))
    val marca: @Composable (Boolean) -> Unit = { si -> if (si) Icono("check", color = Marca) }
    FilaMenu("Inicio", "house", derecha = { marca(config.abrir.tipo == "inicio") }) { guarda(config.copy(abrir = Abrir("inicio"))) }
    FilaMenu("La última página que tenía abierta", "clock", derecha = { marca(config.abrir.tipo == "ultima") }) { guarda(config.copy(abrir = Abrir("ultima"))) }
    val elegida = config.abrir.pageId?.let { datos.paginas[it] }
    FilaMenu(
        "Una página", "file-text",
        detalle = if (config.abrir.tipo != "pagina") "Elegir…" else elegida?.first?.ifBlank { "Sin título" } ?: "Ya no existe: se abrirá el Inicio",
        derecha = { marca(config.abrir.tipo == "pagina") },
    ) { eligiendo = true }
    Text(
        "Solo al abrir la app: pulsar «Inicio» siempre enseña el Inicio.",
        color = C.apagado, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
    if (eligiendo) HojaElegirPagina("Abrir al iniciar", { eligiendo = false }) { p ->
        eligiendo = false
        guarda(config.copy(abrir = Abrir("pagina", p.id)))
    }

    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Bloques", color = C.apagado, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        TextButton({ guarda(config.copy(bloques = ConfigInicio.porDefecto().bloques)) }) {
            Icono("rotate-ccw", tam = 15.dp, color = C.apagado)
            Text("Restablecer", color = C.apagado, fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
        }
    }
    val bloques = config.bloques
    for ((i, b) in bloques.withIndex()) {
        val (icono, titulo) = TITULOS[b.id] ?: continue
        Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.dp, C.borde, RoundedCornerShape(10.dp))) {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).alpha(if (b.visible) 1f else 0.5f), verticalAlignment = Alignment.CenterVertically) {
                    Icono(icono, tam = 16.dp, color = C.apagado)
                    Text(titulo + if (b.visible) "" else " · oculto", fontSize = 15.sp, color = C.texto, fontWeight = FontWeight.Medium,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp))
                }
                BotonIcono("arrow-up", { guarda(config.copy(bloques = bloques.mueve(i, -1))) }, activo = i > 0)
                BotonIcono("arrow-down", { guarda(config.copy(bloques = bloques.mueve(i, 1))) }, activo = i < bloques.size - 1)
                BotonIcono(if (b.visible) "eye" else "eye-off", {
                    guarda(config.copy(bloques = bloques.map { if (it.id == b.id) it.copy(visible = !it.visible) else it }))
                })
            }
            // En el móvil, del contenido solo lo que se elige aquí: enlaces, nota fijada y BD de tareas.
            if (b.visible && b.id == "enlaces") Column(Modifier.padding(bottom = 8.dp)) { EditorEnlaces(datos, guarda) }
            if (b.visible && b.id == "nota") {
                var eligeNota by remember { mutableStateOf(false) }
                FilaMenu("Página", "file-text", detalle = config.nota?.let { datos.paginas[it]?.first?.ifBlank { "Sin título" } ?: "Ya no existe" } ?: "Elegir…") { eligeNota = true }
                if (eligeNota) HojaElegirPagina("Nota fijada", { eligeNota = false }) { p -> eligeNota = false; guarda(config.copy(nota = p.id)) }
            }
            if (b.visible && b.id == "acciones") {
                var eligeBd by remember { mutableStateOf(false) }
                FilaMenu("Las tareas van a", "database", detalle = config.tareas?.let { datos.paginas[it]?.first?.ifBlank { "Sin título" } ?: "Ya no existe" } ?: "Elegir…") { eligeBd = true }
                if (eligeBd) HojaElegirBd({ eligeBd = false }) { id -> eligeBd = false; guarda(config.copy(tareas = id)) }
            }
        }
    }
}

/** Añadir, renombrar, ordenar y quitar enlaces fijados. */
@Composable
private fun EditorEnlaces(datos: DatosInicio, guarda: (ConfigInicio) -> Unit) {
    val config = datos.config
    val enlaces = config.enlaces
    var eligiendo by remember { mutableStateOf(false) }
    var web by remember { mutableStateOf(false) }
    var renombrando by remember { mutableStateOf<Enlace?>(null) }
    val pon = { lista: List<Enlace> -> guarda(config.copy(enlaces = lista)) }
    for ((i, e) in enlaces.withIndex()) {
        val p = e.pageId?.let { datos.paginas[it] }
        Row(Modifier.fillMaxWidth().padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f).alpha(if (e.esWeb || p != null) 1f else 0.5f).clickable { renombrando = e }.heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
                if (e.esWeb) Icono("globe", tam = 16.dp, color = C.apagado) else IconoPagina(p?.second, 16.dp)
                Text(nombreEnlace(e, p), fontSize = 14.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp))
            }
            BotonIcono("arrow-up", { pon(enlaces.mueve(i, -1)) }, activo = i > 0, tam = 18.dp)
            BotonIcono("arrow-down", { pon(enlaces.mueve(i, 1)) }, activo = i < enlaces.size - 1, tam = 18.dp)
            BotonIcono("x", { pon(enlaces.filter { it.id != e.id }) }, tam = 18.dp)
        }
    }
    Row {
        TextButton({ eligiendo = true }) { Icono("plus", tam = 15.dp, color = C.apagado); Text("Página", color = C.apagado, modifier = Modifier.padding(start = 4.dp)) }
        TextButton({ web = true }) { Icono("plus", tam = 15.dp, color = C.apagado); Text("Web", color = C.apagado, modifier = Modifier.padding(start = 4.dp)) }
    }
    if (eligiendo) HojaElegirPagina("Fijar una página", { eligiendo = false }) { p ->
        eligiendo = false
        if (enlaces.size < MAX_ENLACES) pon(enlaces + Enlace(nuevoId(), pageId = p.id))
    }
    if (web) DialogoWeb({ web = false }) { url, titulo ->
        web = false
        if (enlaces.size < MAX_ENLACES) pon(enlaces + Enlace(nuevoId(), url = url, titulo = titulo))
    }
    renombrando?.let { e ->
        PedirTexto("Nombre del enlace", inicial = e.titulo.orEmpty(), placeholder = nombreEnlace(e.copy(titulo = null), e.pageId?.let { datos.paginas[it] }), onOk = { t ->
            renombrando = null
            pon(enlaces.map { if (it.id == e.id) it.copy(titulo = t.trim().ifBlank { null }) else it })
        }, onNo = { renombrando = null })
    }
}

private fun nombreEnlace(e: Enlace, p: Pair<String, String?>?): String = e.titulo ?: when {
    e.esWeb -> runCatching { java.net.URI(e.url).host.removePrefix("www.") }.getOrNull() ?: e.url!!
    p != null -> p.first.ifBlank { "Sin título" }
    else -> "Página que ya no existe o no puedes ver"
}

private fun nuevoId() = java.lang.Long.toString(System.currentTimeMillis(), 36) + (0..5).map { "abcdefghijklmnopqrstuvwxyz0123456789".random() }.joinToString("")

@Composable
private fun DialogoWeb(onNo: () -> Unit, onOk: (url: String, titulo: String?) -> Unit) {
    var url by remember { mutableStateOf("") }
    var titulo by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onNo,
        containerColor = C.fondo,
        title = { Text("Fijar una web") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Campo(url, { url = it; error = false }, placeholder = "https://…", autofoco = true, teclado = KeyboardOptions(keyboardType = KeyboardType.Uri))
                Campo(titulo, { titulo = it }, placeholder = "Nombre (opcional)")
                if (error) Text("Pon una dirección web, como https://ejemplo.es", color = androidx.compose.ui.graphics.Color(0xFFD44C47), fontSize = 12.sp)
            }
        },
        confirmButton = {
            TextButton({ urlValida(url)?.let { onOk(it, titulo.trim().ifBlank { null }) } ?: run { error = true } }) { Text("Añadir", color = Marca) }
        },
        dismissButton = { TextButton(onNo) { Text("Cancelar", color = C.texto) } },
    )
}

@Composable
private fun FilaEnlace(e: Enlace, p: Pair<String, String?>?, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        if (e.esWeb) Icono("globe", tam = 16.dp, color = C.apagado) else IconoPagina(p?.second, 16.dp)
        Text(nombreEnlace(e, p), fontSize = 15.sp, color = C.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 10.dp))
    }
}

@Composable
private fun Tarjetas(paginas: List<Triple<String, String, String?>>) {
    val n = LocalNavegador.current
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        for ((id, title, icon) in paginas) {
            Column(
                Modifier.width(140.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, C.borde, RoundedCornerShape(10.dp))
                    .clickable { n.pagina(id) }.padding(12.dp),
            ) {
                IconoPagina(icon, 24.dp)
                Text(title.ifBlank { "Sin título" }, fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 2,
                    overflow = TextOverflow.Ellipsis, color = C.texto, modifier = Modifier.padding(top = 8.dp).height(40.dp))
            }
        }
    }
}

@Composable
private fun Lista(contenido: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, C.borde, RoundedCornerShape(10.dp))) { contenido() }
}

@Composable
private fun VerTodas() {
    val n = LocalNavegador.current
    Row(Modifier.padding(16.dp).clickable { n.a("tareas") }, verticalAlignment = Alignment.CenterVertically) {
        Text("Ver todas", color = C.apagado, fontSize = 14.sp)
        Icono("arrow-right", tam = 14.dp, color = C.apagado, modifier = Modifier.padding(start = 4.dp))
    }
}

@Composable
private fun Encabezado(icono: String, texto: String) {
    Row(Modifier.padding(start = 16.dp, top = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icono(icono, tam = 15.dp, color = C.apagado)
        Text(texto, color = C.apagado, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 6.dp))
    }
}
