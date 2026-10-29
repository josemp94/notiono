package com.monrealperez.notiono.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.annotation.ColorRes
import androidx.annotation.DrawableRes
import androidx.core.widget.RemoteViewsCompat
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.editor.Inline
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.emojiDe
import com.monrealperez.notiono.util.Fechas
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import kotlin.math.roundToInt

// ---------------- Piezas comunes de las vistas ----------------

/** Color de texto de un recurso: desde Android 12 lo resuelve el escritorio (claro u oscuro según él). */
internal fun RemoteViews.colorTexto(ctx: Context, id: Int, @ColorRes color: Int) {
    if (Build.VERSION.SDK_INT >= 31) setColorStateList(id, "setTextColor", color) else setTextColor(id, ctx.getColor(color))
}

internal fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).roundToInt()

internal fun estilo(texto: String, negrita: Boolean = false, tachado: Boolean = false): CharSequence {
    if (!negrita && !tachado) return texto
    return SpannableString(texto).apply {
        if (negrita) setSpan(StyleSpan(Typeface.BOLD), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (tachado) setSpan(StrikethroughSpan(), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
}

/** Qué se pintó, para el registro: aviso (sin datos), vacío, datos recién traídos o caché. */
internal fun EstadoWidget.que(elementos: Int): String = when {
    datos == null -> "aviso"
    elementos == 0 -> "vacio"
    fallo != null -> "cache"
    fecha != null && System.currentTimeMillis() - fecha < 120_000 -> "datos"
    else -> "cache"
}

/** Una fila de lista (layout `widget_fila`), con lo que toque de cada cosa. */
internal class Fila(
    val clave: Long,
    val texto: CharSequence,
    @ColorRes val color: Int = R.color.widget_texto,
    val tamSp: Float = 13f,
    val sangriaDp: Int = 0,
    val maxLineas: Int = 1,
    val detalle: String? = null,
    @ColorRes val colorDetalle: Int = R.color.widget_apagado,
    @DrawableRes val marca: Int? = null,
    val alMarcar: String? = null,
    val alTocar: String? = null,
    val emoji: String? = null,
    val iconoPagina: Boolean = false,
    val estrella: Boolean = false,
    val separador: Boolean = false,
    val altoDp: Int = 0,
)

internal fun vistaFila(ctx: Context, f: Fila): RemoteViews {
    if (f.separador) return RemoteViews(ctx.packageName, R.layout.widget_linea)
    return RemoteViews(ctx.packageName, R.layout.widget_fila).apply {
        setTextViewText(R.id.fila_texto, f.texto)
        setTextViewTextSize(R.id.fila_texto, TypedValue.COMPLEX_UNIT_SP, f.tamSp)
        setInt(R.id.fila_texto, "setMaxLines", f.maxLineas)
        if (f.color != R.color.widget_texto) colorTexto(ctx, R.id.fila_texto, f.color)
        setViewPadding(R.id.fila, dp(ctx, f.sangriaDp), dp(ctx, f.altoDp), dp(ctx, 8), dp(ctx, f.altoDp))
        if (f.detalle != null) {
            setViewVisibility(R.id.fila_detalle, View.VISIBLE)
            setTextViewText(R.id.fila_detalle, f.detalle)
            if (f.colorDetalle != R.color.widget_apagado) colorTexto(ctx, R.id.fila_detalle, f.colorDetalle)
        }
        if (f.marca != null) {
            setViewVisibility(R.id.fila_marca, View.VISIBLE)
            setImageViewResource(R.id.fila_marca_icono, f.marca)
            f.alMarcar?.let { setOnClickFillInIntent(R.id.fila_marca, Widgets.relleno(it)) }
        }
        if (f.emoji != null || f.iconoPagina) {
            setViewVisibility(R.id.fila_icono, View.VISIBLE)
            if (!f.emoji.isNullOrBlank()) {
                setTextViewText(R.id.fila_emoji, f.emoji)
                setViewVisibility(R.id.fila_pagina, View.GONE)
            }
        }
        if (f.estrella) setViewVisibility(R.id.fila_estrella, View.VISIBLE)
        f.alTocar?.let { setOnClickFillInIntent(R.id.fila, Widgets.relleno(it)) }
    }
}

/**
 * Lo común de los widgets con lista: cabecera (título que abre, «+» opcional y refrescar),
 * la línea de estado (que refresca al tocarla) y la lista, o un texto si está vacía.
 */
internal fun vistaLista(
    ctx: Context,
    id: Int,
    clase: Class<out ProveedorWidget>,
    titulo: String,
    abrir: PendingIntent?,
    mas: PendingIntent?,
    aviso: String?,
    filas: List<Fila>,
    vacio: String?,
    @androidx.annotation.LayoutRes layout: Int = R.layout.widget_base,
): RemoteViews = RemoteViews(ctx.packageName, layout).apply {
    setTextViewText(R.id.widget_titulo, titulo)
    abrir?.let { setOnClickPendingIntent(R.id.widget_titulo, it) }
    if (mas != null) {
        setViewVisibility(R.id.widget_mas, View.VISIBLE)
        setOnClickPendingIntent(R.id.widget_mas, mas)
    } else if (layout == R.layout.widget_base) setViewVisibility(R.id.widget_mas, View.GONE)
    val refrescar = Widgets.piAccion(ctx, clase, Widgets.ACCION_REFRESCAR, id)
    setOnClickPendingIntent(R.id.widget_refrescar, refrescar)
    if (aviso != null) {
        setViewVisibility(R.id.widget_aviso, View.VISIBLE)
        setTextViewText(R.id.widget_aviso, aviso)
        // Sin nada más que enseñar, el aviso es lo principal: más grande.
        setTextViewTextSize(R.id.widget_aviso, TypedValue.COMPLEX_UNIT_SP, if (filas.isEmpty()) 13f else 11f)
        setOnClickPendingIntent(R.id.widget_aviso, refrescar)
    }
    if (filas.isEmpty() && vacio != null && aviso == null) {
        setViewVisibility(R.id.widget_vacio, View.VISIBLE)
        setTextViewText(R.id.widget_vacio, vacio)
    }
    val items = RemoteViewsCompat.RemoteCollectionItems.Builder()
        .setHasStableIds(true)
        .setViewTypeCount(2)
        .apply { filas.distinctBy { it.clave }.forEach { addItem(it.clave, vistaFila(ctx, it)) } }
        .build()
    RemoteViewsCompat.setRemoteAdapter(ctx, this, id, R.id.widget_lista, items)
    setPendingIntentTemplate(R.id.widget_lista, Widgets.piPlantilla(ctx, id))
}

/** El dato de una fila que marca su casilla (lo reparte [AccionWidgetActivity]). */
internal fun marcaUri(tipo: String, id: Int, vararg q: Pair<String, String>): String =
    "notiono-widget://$tipo?widget=$id&" + q.joinToString("&") { (k, v) -> "$k=${android.net.Uri.encode(v)}" }

private fun JsonObject.texto(k: String) = (this[k] as? JsonPrimitive)?.content

// ---------------- Nota ----------------

/** Widget «Nota»: una página (texto, títulos, listas) y sus casillas, marcables desde aquí. */
class NotaReceiver : ProveedorWidget() {
    override val tipo = "nota"

    override fun consultas(c: ConfigWidget) =
        c.pagina?.let { listOf(Consulta("app.pagina", objeto("id" to it)), Consulta("app.bloques", objeto("id" to it))) } ?: emptyList()

    /** El título y los bloques ya en el orden en que se leen, con su sangría y su número. */
    override fun resume(c: ConfigWidget, respuestas: List<JsonElement>): JsonElement {
        val pagina = respuestas[0] as JsonObject
        val bloques = ((respuestas[1] as JsonObject)["bloques"] as JsonArray).mapNotNull { it as? JsonObject }
        return buildJsonObject {
            put("titulo", pagina.str("title").orEmpty())
            put("bloques", buildJsonArray { planos(bloques).take(80).forEach { add(it) } })
        }
    }

    override fun alternaLocal(ctx: Context, id: Int, elemento: String) {
        val i = Instantaneas.lee(ctx, id) ?: return
        val d = i.datos as? JsonObject ?: return
        val bs = (d["bloques"] as? JsonArray)?.map { b ->
            val o = b as JsonObject
            if (o.texto("i") == elemento) JsonObject(o + ("c" to JsonPrimitive(o.texto("c") != "true"))) else o
        } ?: return
        Instantaneas.guarda(ctx, id, i.copy(datos = JsonObject(d + ("bloques" to JsonArray(bs)))))
    }

    override fun vista(ctx: Context, id: Int, c: ConfigWidget, e: EstadoWidget, opciones: Bundle?): Pintado {
        val pagina = c.pagina ?: return Pintado(
            fallo(ctx, if (c.recientes) "Abre alguna página en Notiono y saldrá aquí." else "Toca para elegir una página", if (c.recientes) null else Widgets.piConfigura(ctx, id)),
            "config",
        )
        if (!e.conSesion) return Pintado(fallo(ctx, "${Widgets.INICIA_SESION} para ver esta nota."), "sesion")
        val d = e.datos as? JsonObject
        val bloques = (d?.get("bloques") as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
        val titulo = d?.texto("titulo")?.ifBlank { null } ?: c.titulo ?: "Nota"
        val rv = nota(ctx, id, pagina, titulo, bloques, e.aviso())
        if (c.recientes) {
            // ‹ y ›: a la anterior y a la siguiente de las últimas abiertas (pintan al momento, sin red).
            for ((vista, accion) in listOf(R.id.widget_anterior to Widgets.ACCION_ANTERIOR, R.id.widget_siguiente to Widgets.ACCION_SIGUIENTE)) {
                rv.setViewVisibility(vista, android.view.View.VISIBLE)
                rv.setOnClickPendingIntent(vista, Widgets.piAccion(ctx, NotaReceiver::class.java, accion, id))
            }
        }
        return Pintado(rv, e.que(bloques.size), bloques.size)
    }

    /** ‹ › de «Mis notas recientes»: cambia de página, pinta ya (lo guardado o «Cargando…») y refresca detrás. */
    override fun accion(ctx: Context, id: Int, accion: String?, valor: String): Boolean {
        if (accion != Widgets.ACCION_ANTERIOR && accion != Widgets.ACCION_SIGUIENTE) return false
        val c = Configs.lee(ctx, id)
        val s = Servicios.de(ctx)
        val siguiente = vecina(s.recientes.lista(c.espacio ?: s.espacioActivo()).map { it.pageId to it.title }, c.pagina, if (accion == Widgets.ACCION_SIGUIENTE) 1 else -1)
            ?: return true
        Configs.guarda(ctx, id, c.copy(pagina = siguiente.first, titulo = siguiente.second.ifBlank { null }))
        pinta(ctx, id)
        refrescaDetras(ctx, intArrayOf(id), "flecha")
        return true
    }

    override fun muestra(ctx: Context): RemoteViews = nota(ctx, 0, "muestra", Muestras.TITULO_NOTA, planos(Muestras.nota), null)

    companion object {
        /** La página de al lado en la lista (dando la vuelta); sin la actual en la lista, la primera. */
        fun vecina(lista: List<Pair<String, String>>, actual: String?, paso: Int): Pair<String, String>? {
            if (lista.isEmpty()) return null
            val i = lista.indexOfFirst { it.first == actual }
            if (i < 0) return lista.first()
            return lista[Math.floorMod(i + paso, lista.size)]
        }

        /** Bloques con su sangría y, en las listas numeradas, su número; en el orden en que se leen. */
        fun planos(bs: List<JsonObject>, nivel: Int = 0): List<JsonObject> {
            var n = 0
            return bs.flatMap { b ->
                val tipo = b.str("type").orEmpty()
                val props = b["props"] as? JsonObject
                n = if (tipo != "numberedListItem") 0
                else if (n > 0) n + 1
                else (props?.get("start") as? JsonPrimitive)?.content?.toIntOrNull() ?: 1
                val plano = buildJsonObject {
                    put("i", b.str("id").orEmpty())
                    put("t", tipo)
                    put("x", Inline.textoPlano(b["content"]).take(400))
                    put("n", nivel)
                    put("num", n)
                    put("c", (props?.get("checked") as? JsonPrimitive)?.content == "true")
                    put("l", (props?.get("level") as? JsonPrimitive)?.content ?: "")
                }
                listOf(plano) + planos((b["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList(), nivel + 1)
            }
        }

        fun nota(ctx: Context, id: Int, pagina: String, titulo: String, bloques: List<JsonObject>, aviso: String?): RemoteViews {
            val abrir = "notiono://pagina/$pagina"
            val filas = bloques.mapIndexedNotNull { i, b ->
                val texto = b.texto("x").orEmpty()
                val sangria = (b.texto("n")?.toIntOrNull() ?: 0) * 12
                val clave = (b.texto("i") ?: "$i").hashCode().toLong()
                when (b.texto("t")) {
                    "heading" -> Fila(clave, estilo(texto, negrita = true), tamSp = when (b.texto("l")) { "1" -> 17f; "2" -> 15f; else -> 14f }, sangriaDp = sangria, maxLineas = 2, alTocar = abrir)
                    "checkListItem" -> {
                        val hecha = b.texto("c") == "true"
                        Fila(
                            clave, estilo(texto, tachado = hecha), color = if (hecha) R.color.widget_apagado else R.color.widget_texto, sangriaDp = sangria, maxLineas = 3,
                            marca = if (hecha) R.drawable.widget_previa_casilla_hecha else R.drawable.widget_previa_casilla,
                            alMarcar = marcaUri("casilla", id, "pagina" to pagina, "id" to (b.texto("i") ?: "")), alTocar = abrir,
                        )
                    }
                    "bulletListItem" -> Fila(clave, "•  $texto", sangriaDp = sangria, maxLineas = 3, alTocar = abrir)
                    "numberedListItem" -> Fila(clave, "${b.texto("num")}.  $texto", sangriaDp = sangria, maxLineas = 3, alTocar = abrir)
                    "toggleListItem" -> Fila(clave, "▸  $texto", sangriaDp = sangria, maxLineas = 3, alTocar = abrir)
                    "quote", "callout" -> Fila(clave, texto, color = R.color.widget_apagado, sangriaDp = sangria, maxLineas = 4, alTocar = abrir)
                    "divider" -> Fila(clave, "", separador = true)
                    "paragraph", "codeBlock" -> if (texto.isNotBlank()) Fila(clave, texto, sangriaDp = sangria, maxLineas = 6, alTocar = abrir) else null
                    else -> null
                }
            }
            return vistaLista(ctx, id, NotaReceiver::class.java, titulo, Widgets.piAbre(ctx, abrir), null, aviso, filas, "Esta página está vacía.")
        }
    }
}

// ---------------- Lista de una BD ----------------

/** Widget «Lista»: las filas de una vista (p. ej. Tareas pendientes), con casilla y «+». */
class ListaReceiver : ProveedorWidget() {
    override val tipo = "lista"

    override fun consultas(c: ConfigWidget) = c.pagina?.let {
        listOf(Consulta("app.vista", JsonObject(objeto("pageId" to it) + (c.vista?.let { v -> mapOf("viewId" to JsonPrimitive(v)) } ?: emptyMap()))))
    } ?: emptyList()

    /** Nombre de la BD y, de cada fila, título, detalle (fecha, estado…) y si está hecha. */
    override fun resume(c: ConfigWidget, respuestas: List<JsonElement>): JsonElement = resumeVista(respuestas[0] as JsonObject)

    override fun alternaLocal(ctx: Context, id: Int, elemento: String) {
        val i = Instantaneas.lee(ctx, id) ?: return
        val d = i.datos as? JsonObject ?: return
        val fs = (d["filas"] as? JsonArray)?.map { f ->
            val o = f as JsonObject
            if (o.texto("i") == elemento) JsonObject(o + ("h" to JsonPrimitive(o.texto("h") != "true"))) else o
        } ?: return
        Instantaneas.guarda(ctx, id, i.copy(datos = JsonObject(d + ("filas" to JsonArray(fs)))))
    }

    override fun vista(ctx: Context, id: Int, c: ConfigWidget, e: EstadoWidget, opciones: Bundle?): Pintado {
        val pagina = c.pagina ?: return Pintado(fallo(ctx, "Toca para elegir una base de datos", Widgets.piConfigura(ctx, id)), "config")
        if (!e.conSesion) return Pintado(fallo(ctx, "${Widgets.INICIA_SESION} para ver esta lista."), "sesion")
        val d = e.datos as? JsonObject
        val filas = d?.objs("filas") ?: emptyList()
        val titulo = c.titulo ?: d?.texto("nombre") ?: "Base de datos"
        return Pintado(lista(ctx, id, pagina, titulo, d?.texto("casilla"), filas, e.aviso()), e.que(filas.size), filas.size)
    }

    override fun muestra(ctx: Context): RemoteViews {
        val d = resumeVista(buildJsonObject { put("fields", JsonArray(Muestras.campos)); put("filas", JsonArray(Muestras.filas)) })
        return lista(ctx, 0, "muestra", Muestras.TITULO_LISTA, d.texto("casilla"), d.objs("filas"), null)
    }

    companion object {
        fun resumeVista(v: JsonObject): JsonObject {
            val campos = v.objs("fields")
            check(v["filas"] is JsonArray) { "Respuesta con forma inesperada" }
            val titulo = campos.firstOrNull { it.str("type") == "text" } ?: campos.firstOrNull()
            val casilla = campos.firstOrNull { it.str("type") == "checkbox" }
            val clave = campos.firstOrNull { it.str("type") == "date" } ?: campos.firstOrNull { it.str("type") == "status" } ?: campos.firstOrNull { it.str("type") == "select" }
            return buildJsonObject {
                put("nombre", v.obj("collection")?.str("name") ?: "")
                casilla?.str("id")?.let { put("casilla", it) }
                put("filas", buildJsonArray {
                    v.objs("filas").take(50).forEach { f ->
                        val celdas = f["cells"] as? JsonObject ?: JsonObject(emptyMap())
                        val textos = f["textos"] as? JsonObject ?: JsonObject(emptyMap())
                        add(buildJsonObject {
                            put("i", f.str("id").orEmpty())
                            put("t", titulo?.let { (celdas[it.str("id")] as? JsonPrimitive)?.content }?.ifBlank { null }?.take(200) ?: "Sin título")
                            put("d", clave?.let { (textos[it.str("id")] as? JsonPrimitive)?.content }.orEmpty().take(40))
                            put("h", casilla != null && (celdas[casilla.str("id")] as? JsonPrimitive)?.content == "true")
                        })
                    }
                })
            }
        }

        fun lista(ctx: Context, id: Int, pagina: String, titulo: String, casilla: String?, filas: List<JsonObject>, aviso: String?): RemoteViews {
            val fs = filas.map { f ->
                val hecha = f.texto("h") == "true"
                val fila = f.texto("i").orEmpty()
                Fila(
                    fila.hashCode().toLong(), estilo(f.texto("t").orEmpty(), tachado = hecha),
                    color = if (hecha) R.color.widget_apagado else R.color.widget_texto,
                    detalle = f.texto("d")?.ifBlank { null },
                    // La casilla es un círculo grande: se completa tocándolo (como en las apps de tareas).
                    marca = if (casilla == null) null else if (hecha) R.drawable.widget_hecho else R.drawable.widget_circulo_vacio,
                    alMarcar = casilla?.let { marcaUri("fila", id, "pagina" to pagina, "id" to fila, "campo" to it, "valor" to (!hecha).toString()) },
                    alTocar = "notiono://fila/$pagina/$fila",
                    altoDp = if (casilla == null) 6 else 0,
                )
            }
            return vistaLista(
                ctx, id, ListaReceiver::class.java, titulo, Widgets.piAbre(ctx, "notiono://pagina/$pagina"),
                Widgets.piAbre(ctx, "notiono://nuevafila/$pagina"), aviso, fs, "Nada por aquí.",
            )
        }
    }
}

// ---------------- Páginas recientes ----------------

/** Una fila del widget «Páginas recientes». `detalle`: «hace 5 min» (vacío en las favoritas). */
data class PaginaWidget(val id: String, val titulo: String, val icono: String?, val detalle: String, val favorita: Boolean = false)

/** Widget «Páginas recientes»: las favoritas arriba y luego las últimas abiertas en el móvil. */
class RecientesReceiver : ProveedorWidget() {
    override val tipo = "recientes"

    override fun consultas(c: ConfigWidget) = listOf(Consulta("favorites.list", null))

    override fun resume(c: ConfigWidget, respuestas: List<JsonElement>): JsonElement = buildJsonArray {
        respuestas[0].comoLista.map { it.comoObjeto }.forEach { add(buildJsonObject { put("i", it.str("id").orEmpty()); put("t", it.str("title").orEmpty()); it.str("icon")?.let { ic -> put("ic", ic) } }) }
    }

    override fun vista(ctx: Context, id: Int, c: ConfigWidget, e: EstadoWidget, opciones: Bundle?): Pintado {
        if (!e.conSesion) return Pintado(fallo(ctx, "${Widgets.INICIA_SESION} para ver tus páginas."), "sesion")
        val s = Servicios.de(ctx)
        val favoritas = (e.datos as? JsonArray)?.mapNotNull { it as? JsonObject }
            ?.map { PaginaWidget(it.texto("i").orEmpty(), it.texto("t").orEmpty(), it.texto("ic"), "", favorita = true) } ?: emptyList()
        val vistas = s.recientes.lista(s.espacioActivo()).filter { r -> favoritas.none { it.id == r.pageId } }
            .map { PaginaWidget(it.pageId, it.title, it.icon, Fechas.haceCuanto(Instant.ofEpochMilli(it.visto).toString())) }
        val paginas = (favoritas + vistas).take(30)
        // Las recientes son del móvil: con ellas, el fallo de las favoritas va como marca.
        val aviso = e.aviso()?.takeIf { e.datos != null || vistas.isEmpty() }
        return Pintado(recientes(ctx, id, paginas, aviso), e.que(paginas.size), paginas.size)
    }

    override fun muestra(ctx: Context): RemoteViews = recientes(ctx, 0, Muestras.recientes, null)

    companion object {
        fun recientes(ctx: Context, id: Int, paginas: List<PaginaWidget>, aviso: String?): RemoteViews {
            val filas = paginas.map { p ->
                Fila(
                    p.id.hashCode().toLong(), p.titulo.ifBlank { "Sin título" }, emoji = emojiDe(p.icono), iconoPagina = true,
                    detalle = p.detalle.ifBlank { null }, estrella = p.favorita, alTocar = "notiono://pagina/${p.id}", altoDp = 5,
                )
            }
            return vistaLista(
                ctx, id, RecientesReceiver::class.java, "Páginas recientes", Widgets.piAbre(ctx, "notiono://inicio"),
                Widgets.piAbre(ctx, "notiono://nueva"), aviso, filas, "Las páginas que abras en la app saldrán aquí.",
            )
        }
    }
}

// ---------------- Nota rápida ----------------

/** Widget «Nota rápida»: un botón que abre una nota nueva (o el final de la página elegida). */
class RapidaReceiver : ProveedorWidget() {
    override val tipo = "rapida"
    override val conDatos = false

    override fun vista(ctx: Context, id: Int, c: ConfigWidget, e: EstadoWidget, opciones: Bundle?) =
        Pintado(rapida(ctx, if (c.pagina != null) "notiono://rapida?en=${c.pagina}" else "notiono://nueva", c.titulo), "datos")

    override fun muestra(ctx: Context) = rapida(ctx, "notiono://nueva", null)

    companion object {
        fun rapida(ctx: Context, uri: String, titulo: String?) = RemoteViews(ctx.packageName, R.layout.widget_rapida).apply {
            setTextViewText(R.id.widget_titulo, titulo?.let { "Añadir a $it" } ?: "Nota rápida")
            setOnClickPendingIntent(R.id.widget_raiz, Widgets.piAbre(ctx, uri))
        }
    }
}

// ---------------- Acciones rápidas ----------------

/** Widget «Acciones rápidas»: página nueva, tarea nueva (en la BD elegida), foto y buscar. */
class AccionesReceiver : ProveedorWidget() {
    override val tipo = "acciones"
    override val conDatos = false

    override fun vista(ctx: Context, id: Int, c: ConfigWidget, e: EstadoWidget, opciones: Bundle?): Pintado {
        // Los nombres solo caben si el widget tiene algo de alto.
        val alto = opciones?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0
        return Pintado(acciones(ctx, c.pagina, alto == 0 || alto >= 64), "datos", if (c.pagina != null) 4 else 3)
    }

    override fun muestra(ctx: Context) = acciones(ctx, "muestra", true)

    companion object {
        fun acciones(ctx: Context, bdTareas: String?, conNombre: Boolean) = RemoteViews(ctx.packageName, R.layout.widget_acciones).apply {
            setOnClickPendingIntent(R.id.acc_pagina, Widgets.piAbre(ctx, "notiono://nueva"))
            if (bdTareas != null) setOnClickPendingIntent(R.id.acc_tarea, Widgets.piAbre(ctx, "notiono://nuevafila/$bdTareas"))
            else setViewVisibility(R.id.acc_tarea, View.GONE)
            setOnClickPendingIntent(R.id.acc_foto, Widgets.piAbre(ctx, "notiono://foto"))
            setOnClickPendingIntent(R.id.acc_buscar, Widgets.piAbre(ctx, "notiono://buscar"))
            if (!conNombre) listOf(R.id.acc_pagina_nombre, R.id.acc_tarea_nombre, R.id.acc_foto_nombre, R.id.acc_buscar_nombre).forEach { setViewVisibility(it, View.GONE) }
        }
    }
}
