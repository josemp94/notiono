package com.monrealperez.notiono.editor

import android.annotation.SuppressLint
import android.graphics.Typeface
import android.view.MotionEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.PaginaInfo
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.pagina.Cabecera
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.ColoresTexto
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/** Una página de documento: cabecera y su editor de bloques conectado al documento compartido. */
@Composable
fun EditorPagina(info: PaginaInfo, alFinal: Boolean) {
    val editable = info.puedeEditar && !info.locked
    EditorBloques(
        fuente = Fuente(info.id, esFila = false),
        editable = editable,
        pageId = info.id,
        fuente2 = info.font,
        alFinal = alFinal,
        aviso = if (info.locked && info.puedeEditar) "Página bloqueada: desbloquéala desde «⋯» para editar" else if (!info.puedeEditar) "Solo lectura" else null,
        cabecera = { foco -> Cabecera(info, editable, enfocarTitulo = editable && info.title.isEmpty(), onEnter = foco) },
    )
}

/** Lo que el editor necesita del campo enfocado para la barra de formato. */
class Activo {
    var campo: CampoBloque? = null
}

fun paletaDe(oscuro: Boolean) = if (oscuro) Paleta.oscura else Paleta.clara

/**
 * El editor de bloques nativo: una lista virtualizada de bloques con su campo de texto
 * nativo cada uno, la barra de formato sobre el teclado, el menú «/», el «@», arrastrar
 * para reordenar y la sincronía por operaciones. Lo usan las páginas y el cuerpo de
 * las filas de BD (`fuente`).
 */
@SuppressLint("ClickableViewAccessibility")
@Composable
fun EditorBloques(
    fuente: Fuente,
    editable: Boolean,
    pageId: String,
    fuente2: String = "sans",
    alFinal: Boolean = false,
    aviso: String? = null,
    cabecera: @Composable (enfocarCuerpo: () -> Unit) -> Unit,
) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val oscuro = C.oscuro
    val pal = paletaDe(oscuro)
    val estado = remember(fuente) { EstadoEditor(pal, editable) }
    val sincro = remember(fuente) { Sincro(fuente, estado, s.repo, s.alcance) }
    val activo = remember { Activo() }
    val lista = rememberLazyListState()
    val alcance = rememberCoroutineScope()
    val ciclo = LocalLifecycleOwner.current
    var arrastre by remember { mutableStateOf<Arrastre?>(null) }
    var hojaBloque by remember { mutableStateOf<Bloque?>(null) }
    var hojaInsertar by remember { mutableStateOf(false) }
    var pidiendoEnlace by remember { mutableStateOf(false) }
    val acciones = remember(fuente) { AccionesEditor(ctx, s, estado, pageId, alcance) }
    acciones.navegador = com.monrealperez.notiono.ui.LocalNavegador.current

    LaunchedEffect(fuente) {
        sincro.abre()
        if (alFinal && editable) {
            val ult = estado.raiz.lastOrNull()
            if (ult != null && ult.tipo == "paragraph" && ult.texto.isNullOrEmpty()) estado.foco = PeticionFoco(ult.id, 0)
            else estado.insertaAlFinal(Bloque.nuevo())
        }
    }
    // Cambios de fuera: al volver a primer plano y cada pocos segundos mientras se ve.
    LaunchedEffect(fuente) {
        ciclo.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            sincro.refresca()
            while (true) {
                delay(4000)
                sincro.refresca()
            }
        }
    }
    LaunchedEffect(Unit) { s.repo.cambios.collect { if (it == "bloques:${fuente.id}") sincro.refresca() } }
    // Al salir de la página, lo pendiente se manda ya (en el alcance de la app, no de la pantalla).
    DisposableEffect(fuente) { onDispose { s.alcance.launch { sincro.envia() } } }
    LaunchedEffect(oscuro) { estado.pal = pal }

    val v = estado.version
    val filas = remember(v) { estado.visibles() }
    val oyente = remember(fuente) { OyenteEditor(estado, activo, acciones) }

    Column(Modifier.fillMaxSize().imePadding()) {
        Box(Modifier.weight(1f)) {
            if (!sincro.cargado) {
                Column {
                    cabecera {}
                    Esqueleto(5)
                    sincro.error?.let { Text(it, color = C.apagado, fontSize = 13.sp, modifier = Modifier.padding(20.dp)) }
                }
            } else LazyColumn(Modifier.fillMaxSize(), state = lista) {
                item(key = "__cabecera") {
                    cabecera {
                        val primero = filas.firstOrNull { it.b.esTexto }?.b
                        if (primero != null) estado.foco = PeticionFoco(primero.id, 0) else if (editable) estado.insertaAlFinal(Bloque.nuevo())
                    }
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 2.dp)) {
                        if (aviso != null) Text(aviso, fontSize = 12.sp, color = C.apagado, modifier = Modifier.weight(1f))
                        else Box(Modifier.weight(1f))
                        IndicadorGuardado(sincro)
                    }
                }
                itemsIndexed(filas, key = { _, f -> f.b.id }) { i, f ->
                    val enArrastre = arrastre?.id == f.b.id
                    Box(
                        Modifier.fillMaxWidth()
                            .let { if (enArrastre) it.offset(y = arrastre!!.dy.dp / ctx.resources.displayMetrics.density).alpha(0.85f).background(C.hover) else it },
                    ) {
                        FilaBloque(
                            f, estado, editable, fuente2, oyente, acciones,
                            onAsa = { hojaBloque = f.b },
                            asa = if (editable) Modifier.pointerInput(f.b.id) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { arrastre = Arrastre(f.b.id, 0f) },
                                    onDragEnd = {
                                        arrastre?.let { a -> suelta(a, i, filas, lista, estado) }
                                        arrastre = null
                                    },
                                    onDragCancel = { arrastre = null },
                                    onDrag = { c, d -> c.consume(); arrastre = arrastre?.copy(dy = arrastre!!.dy + d.y) },
                                )
                            } else Modifier,
                        )
                    }
                }
                item(key = "__pie") {
                    // Tocar debajo del último bloque: a escribir al final (como en Notion).
                    Box(Modifier.fillMaxWidth().height(160.dp).clickable(enabled = editable) {
                        val ult = estado.raiz.lastOrNull()
                        if (ult != null && ult.esTexto && ult.texto.isNullOrEmpty() && ult.hijos.isEmpty()) estado.foco = PeticionFoco(ult.id, 0)
                        else estado.insertaAlFinal(Bloque.nuevo())
                    })
                }
            }
            // Menú «/» y «@» mientras se escribe, pegado abajo (encima de la barra).
            estado.menu?.let { m ->
                Box(Modifier.align(Alignment.BottomCenter)) {
                    if (m.tipo == '/') MenuBloques(m.consulta, onElegir = { item -> acciones.eligeDelMenu(item, m) }, onCerrar = { estado.menu = null })
                    else MenuMenciones(m.consulta, pageId, onElegir = { chip -> acciones.insertaMencion(chip, m) }, onCerrar = { estado.menu = null })
                }
            }
        }
        if (editable && estado.enfocado != null) {
            BarraFormato(
                estado, activo, acciones, pal,
                onInsertar = { hojaInsertar = true },
                onBloque = { estado.enfocado?.let { estado.busca(it) }?.let { hojaBloque = it } },
                onEnlace = { pidiendoEnlace = true },
            )
        }
    }
    hojaBloque?.let { b -> HojaAccionesBloque(b, estado, acciones, editable) { hojaBloque = null } }
    if (hojaInsertar) HojaInsertar(acciones) { hojaInsertar = false }
    if (pidiendoEnlace) PedirEnlace(activo, estado, pal) { pidiendoEnlace = false }
    acciones.Dialogos()
}

data class Arrastre(val id: String, val dy: Float)

/** Suelta un bloque arrastrado: lo coloca junto al bloque sobre el que ha caído. */
private fun suelta(a: Arrastre, desde: Int, filas: List<FilaVisible>, lista: LazyListState, estado: EstadoEditor) {
    val visibles = lista.layoutInfo.visibleItemsInfo
    val propio = visibles.firstOrNull { it.key == a.id } ?: return
    val centro = propio.offset + propio.size / 2 + a.dy.toInt()
    val destino = visibles.firstOrNull { it.key != a.id && it.key is String && centro >= it.offset && centro < it.offset + it.size && !(it.key as String).startsWith("__") }
        ?: return
    val bDestino = filas.firstOrNull { it.b.id == destino.key }?.b ?: return
    val bMovido = filas.getOrNull(desde)?.b ?: return
    val despues = centro > destino.offset + destino.size / 2
    estado.recoloca(bMovido, bDestino, despues)
}

@Composable
private fun IndicadorGuardado(sincro: Sincro) {
    val (texto, color) = when (sincro.guardado) {
        EstadoGuardado.Guardado -> "Guardado" to C.apagado
        EstadoGuardado.Guardando -> "Guardando…" to C.apagado
        EstadoGuardado.Pendiente -> "Sin conexión · pendiente de enviar" to Marca
        EstadoGuardado.Error -> "No se pudo guardar" to Color(0xFFD44C47)
    }
    Text(texto, fontSize = 11.sp, color = color)
}

/** El oyente de todos los campos del editor: traduce teclado a operaciones del estado. */
class OyenteEditor(private val estado: EstadoEditor, private val activo: Activo, private val acciones: AccionesEditor) : OyenteCampo {
    override fun enter(campo: CampoBloque, pos: Int) {
        val b = campo.bloque ?: return
        estado.menu = null
        estado.enter(b, pos)
    }

    override fun retrocesoAlInicio(campo: CampoBloque) {
        val b = campo.bloque ?: return
        estado.menu = null
        estado.retrocesoAlInicio(b)
    }

    override fun cambio(campo: CampoBloque, ini: Int, antes: Int, despues: Int) {
        val b = campo.bloque ?: return
        if (despues > 0 && estado.pendientes.isNotEmpty()) campo.aplicaPendientes(ini, ini + despues, estado.pendientes, estado.pal)
        estado.texto(b)
        val t = b.texto ?: return
        val nuevo = if (despues > 0 && ini + despues <= t.length) t.subSequence(ini, ini + despues).toString() else ""
        if ('\n' in nuevo && campo.enterParte) {
            campo.post { estado.parteLineas(b) }
            return
        }
        if (nuevo == " " || t.toString() == "```" || t.toString() == "---") campo.post { estado.atajoMarkdown(b) }
        // ¿Se está escribiendo tras un «/» o un «@»?
        estado.menu = detectaMenu(b, t, campo.selectionStart)
    }

    private fun detectaMenu(b: Bloque, t: CharSequence, cursor: Int): MenuEscritura? {
        if (cursor <= 0 || cursor > t.length || b.tipo == "codeBlock") return null
        var i = cursor - 1
        while (i >= 0 && cursor - i <= 40) {
            val ch = t[i]
            if (ch == '/' || ch == '@') {
                val antes = if (i == 0) ' ' else t[i - 1]
                if (!antes.isWhitespace() && antes != OBJ) return null
                val consulta = t.subSequence(i + 1, cursor).toString()
                if (ch == '/' && consulta.contains(' ')) return null
                if (consulta.contains("  ") || consulta.contains('\n')) return null
                return MenuEscritura(ch, b.id, i, consulta)
            }
            if (ch == '\n') return null
            i--
        }
        return null
    }

    override fun seleccion(campo: CampoBloque, a: Int, b: Int) {
        estado.seleccion = a to b
        if (campo.hasFocus()) {
            activo.campo = campo
            estado.enfocado = campo.bloque?.id
        }
        if (estado.menu != null && estado.menu?.bloqueId == campo.bloque?.id && a != b) estado.menu = null
    }

    override fun foco(campo: CampoBloque, tiene: Boolean) {
        if (tiene) {
            activo.campo = campo
            estado.enfocado = campo.bloque?.id
            estado.pendientes = emptyMap()
        } else if (activo.campo === campo) {
            campo.post {
                if (activo.campo === campo && !campo.hasFocus()) {
                    estado.enfocado = null
                    estado.menu = null
                }
            }
        }
    }

    override fun tab(campo: CampoBloque, atras: Boolean) {
        val b = campo.bloque ?: return
        if (atras) estado.desangra(b) else estado.sangra(b)
    }
}

/** Una fila del editor: el prefijo del tipo (viñeta, número, casilla…) y su contenido. */
@SuppressLint("ClickableViewAccessibility")
@Composable
private fun FilaBloque(
    f: FilaVisible,
    estado: EstadoEditor,
    editable: Boolean,
    familia: String,
    oyente: OyenteEditor,
    acciones: AccionesEditor,
    onAsa: () -> Unit,
    asa: Modifier,
) {
    val b = f.b
    val oscuro = C.oscuro
    val fondo = b.prop("backgroundColor")?.takeIf { it != "default" }?.let { ColoresTexto.fondo(it, oscuro) }
    val tinta = b.prop("textColor")?.takeIf { it != "default" }?.let { ColoresTexto.texto(it, oscuro) } ?: C.texto
    Column(Modifier.fillMaxWidth()) {
        if (f.inicioColumna != null) {
            Row(Modifier.padding(start = 20.dp, end = 20.dp, top = 10.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(18.dp).height(1.dp).background(C.borde))
                Text(" Columna ${f.inicioColumna} ", fontSize = 11.sp, color = C.apagado)
                Box(Modifier.weight(1f).height(1.dp).background(C.borde))
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(start = (4 + f.sangria * 24).dp, end = 16.dp)
                .let { if (fondo != null) it.clip(RoundedCornerShape(4.dp)).background(fondo) else it },
            verticalAlignment = Alignment.Top,
        ) {
            // Asa: tocar abre las acciones del bloque; mantener y arrastrar lo mueve.
            Box(Modifier.width(16.dp).heightIn(min = 30.dp).then(asa).clickable(enabled = editable, onClick = onAsa), contentAlignment = Alignment.Center) {
                if (editable) Icono("grip-vertical", tam = 14.dp, color = C.borde)
            }
            Prefijo(f, estado, editable, tinta)
            Box(Modifier.weight(1f)) {
                if (b.esTexto) ContenidoTexto(b, estado, editable, familia, oyente, acciones, tinta)
                else BloqueVisual(b, estado, editable, acciones)
            }
        }
    }
}

@Composable
private fun Prefijo(f: FilaVisible, estado: EstadoEditor, editable: Boolean, tinta: Color) {
    val b = f.b
    val tam = 30.dp
    when (b.tipo) {
        "bulletListItem" -> Box(Modifier.width(24.dp).height(tam), contentAlignment = Alignment.Center) {
            Text(when (f.sangria % 3) { 0 -> "•"; 1 -> "◦"; else -> "▪" }, fontSize = 20.sp, color = tinta)
        }
        "numberedListItem" -> Box(Modifier.widthIn(min = 24.dp).height(tam).padding(end = 4.dp), contentAlignment = Alignment.CenterEnd) {
            Text("${f.numero ?: 1}.", fontSize = 16.sp, color = tinta)
        }
        "checkListItem" -> {
            val hecha = b.propBool("checked")
            Box(
                Modifier.width(28.dp).height(tam).clickable(enabled = editable) { estado.props(b, "checked" to JsonPrimitive(!hecha)) },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(18.dp).clip(RoundedCornerShape(3.dp)).background(if (hecha) Marca else Color.Transparent)
                        .drawBehind { if (!hecha) drawRoundRect(color = Color(0xFF9B9994), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5.dp.toPx()), cornerRadius = androidx.compose.ui.geometry.CornerRadius(3.dp.toPx())) },
                    contentAlignment = Alignment.Center,
                ) { if (hecha) Icono("check", tam = 14.dp, color = Color.White, trazo = 3f) }
            }
        }
        "toggleListItem" -> Triangulo(b, estado, tam)
        "heading" -> if (b.propBool("isToggleable")) Triangulo(b, estado, tam + 4.dp)
        "quote" -> Box(Modifier.padding(start = 4.dp, end = 10.dp, top = 4.dp).width(3.dp).height(26.dp).background(tinta))
        else -> {}
    }
}

@Composable
private fun Triangulo(b: Bloque, estado: EstadoEditor, alto: androidx.compose.ui.unit.Dp) {
    val abierto = b.id in estado.abiertos
    Box(Modifier.width(26.dp).height(alto).clickable { estado.alternaPlegado(b) }, contentAlignment = Alignment.Center) {
        Icono(if (abierto) "chevron-down" else "chevron-right", tam = 16.dp, color = if (b.hijos.isEmpty()) C.borde else C.apagado)
    }
}

/** Tamaño de letra y negrita de cada tipo (los de Notion en el móvil: 30/24/20). */
private fun medidas(b: Bloque): Pair<Float, Boolean> = when (b.tipo) {
    "heading" -> when ((b.props["level"] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt() ?: 1) {
        1 -> 28f to true
        2 -> 23f to true
        else -> 19f to true
    }
    "codeBlock" -> 14f to false
    else -> 16f to false
}

@SuppressLint("ClickableViewAccessibility")
@Composable
private fun ContenidoTexto(
    b: Bloque,
    estado: EstadoEditor,
    editable: Boolean,
    familia: String,
    oyente: OyenteEditor,
    acciones: AccionesEditor,
    tinta: Color,
) {
    val oscuro = C.oscuro
    val (tam, negrita) = medidas(b)
    val tipo = when {
        b.tipo == "codeBlock" -> Typeface.MONOSPACE
        familia == "serif" -> Typeface.SERIF
        familia == "mono" -> Typeface.MONOSPACE
        else -> Typeface.SANS_SERIF
    }
    val apagado = C.apagado.toArgb()
    val marca = Marca.toArgb()
    val hechaTachada = b.tipo == "checkListItem" && b.propBool("checked")
    val campo: @Composable () -> Unit = {
        AndroidView(
            factory = { c ->
                CampoBloque(c).apply {
                    setOnTouchListener { vista, ev ->
                        // Tocar un chip de mención abre su página; un enlace, en solo lectura, se abre.
                        if (ev.action == MotionEvent.ACTION_UP) {
                            val cb = vista as CampoBloque
                            val off = cb.getOffsetForPosition(ev.x, ev.y)
                            val t = cb.text
                            if (t != null && off in 0..t.length) {
                                val chip = t.getSpans((off - 1).coerceAtLeast(0), (off + 1).coerceAtMost(t.length), ChipSpan::class.java).firstOrNull()
                                if (chip != null) { acciones.abreChip(chip.nodo); return@setOnTouchListener true }
                                if (!cb.isFocusable) {
                                    val en = t.getSpans(off, off, EnlaceSpan::class.java).firstOrNull()
                                    if (en != null) { acciones.abreUrl(en.href); return@setOnTouchListener true }
                                }
                            }
                        }
                        false
                    }
                }
            },
            onReset = { it.oyente = null },
            update = { cb ->
                cb.oyente = oyente
                cb.enterParte = b.tipo != "codeBlock"
                cb.pon(b)
                cb.estilo(tam, negrita, tipo, tinta.toArgb(), cursiva = false)
                cb.setHintTextColor(apagado)
                cb.highlightColor = (marca and 0x00FFFFFF) or 0x38000000
                cb.paintFlags = if (hechaTachada) cb.paintFlags or android.graphics.Paint.STRIKE_THRU_TEXT_FLAG else cb.paintFlags and android.graphics.Paint.STRIKE_THRU_TEXT_FLAG.inv()
                if (hechaTachada) cb.setTextColor(apagado)
                cb.isFocusable = editable
                cb.isFocusableInTouchMode = editable
                cb.isCursorVisible = editable
                cb.gravity = when (b.prop("textAlignment")) {
                    "center" -> android.view.Gravity.CENTER_HORIZONTAL
                    "right" -> android.view.Gravity.END
                    else -> android.view.Gravity.START
                } or android.view.Gravity.TOP
                cb.hint = if (editable && estado.enfocado == b.id) when (b.tipo) {
                    "heading" -> "Encabezado"
                    "paragraph" -> "Escribe o pulsa «/» para comandos"
                    "codeBlock" -> "Código"
                    else -> "Lista"
                } else if (b.tipo == "heading" && b.texto.isNullOrEmpty()) "Encabezado" else null
                val p = estado.foco
                if (p != null && p.id == b.id && editable) {
                    estado.foco = null
                    cb.enfoca(p.pos)
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    when (b.tipo) {
        "callout" -> {
            val colorLlamada = coloresLlamada(b.prop("color"), oscuro)
            Row(
                Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(8.dp)).background(colorLlamada).padding(horizontal = 10.dp, vertical = 8.dp),
            ) {
                Text(b.prop("emoji") ?: "💡", fontSize = 20.sp, modifier = Modifier.clickable(enabled = editable) { acciones.eligeEmojiLlamada(b) }.padding(end = 8.dp, top = 2.dp))
                Box(Modifier.weight(1f)) { campo() }
            }
        }
        "codeBlock" -> Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(6.dp)).background(C.superficie).padding(10.dp)) {
            Text(
                b.prop("language") ?: "javascript",
                fontSize = 11.sp, color = C.apagado, fontFamily = FontFamily.Monospace,
                modifier = Modifier.clickable(enabled = editable) { acciones.eligeLenguaje(b) },
            )
            campo()
        }
        else -> campo()
    }
}

/** Fondo de la llamada según su color (los nombres en castellano de la web). */
fun coloresLlamada(nombre: String?, oscuro: Boolean): Color {
    val mapa = mapOf(
        "fondo" to "default", "gris" to "gray", "marron" to "brown", "naranja" to "orange", "amarillo" to "yellow",
        "verde" to "green", "azul" to "blue", "morado" to "purple", "rosa" to "pink", "rojo" to "red",
    )
    return com.monrealperez.notiono.ui.tema.Etiquetas.fondo(mapa[nombre] ?: "orange", oscuro)
}
