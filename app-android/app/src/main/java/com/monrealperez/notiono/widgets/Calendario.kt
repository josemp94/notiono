package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import com.monrealperez.notiono.R
import com.monrealperez.notiono.red.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

/** Una tarea con fecha del widget Calendario (de `app.calendario`). */
data class TareaCal(val pageId: String, val recordId: String, val titulo: String, val inicio: String, val fin: String?, val hecha: Boolean) {
    val dia: LocalDate get() = LocalDate.parse(inicio.take(10))
    val ultimoDia: LocalDate get() = runCatching { LocalDate.parse((fin ?: inicio).take(10)) }.getOrDefault(dia).let { if (it.isBefore(dia)) dia else it }
    /** «10:00» si la fecha lleva hora. */
    val hora: String? get() = inicio.substringAfter('T', "").take(5).ifBlank { null }
    fun en(d: LocalDate) = !d.isBefore(dia) && !d.isAfter(ultimoDia)
    fun vencida(hoy: LocalDate) = !hecha && ultimoDia.isBefore(hoy)
}

/**
 * Las cuentas del calendario, sin Android: la rejilla del mes, la agenda de un día y la de
 * los próximos días. Se prueban en `CalendarioTest`.
 */
object Agenda {
    private val ES = Locale.forLanguageTag("es-ES")

    /** Las 6 semanas (de lunes a domingo) que pinta la rejilla de un mes. */
    fun rejilla(mes: YearMonth): List<LocalDate> {
        val primero = mes.atDay(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        return (0L until 42L).map { primero.plusDays(it) }
    }

    /** Lo que se pide al servidor: la rejilla entera y, para la agenda, del último mes a dos meses vista. */
    fun rango(mes: YearMonth, hoy: LocalDate): Pair<LocalDate, LocalDate> {
        val r = rejilla(mes)
        return minOf(r.first(), hoy.minusDays(31)) to maxOf(r.last(), hoy.plusDays(62))
    }

    fun nombreMes(mes: YearMonth): String = mes.format(DateTimeFormatter.ofPattern("LLLL yyyy", ES)).replaceFirstChar { it.titlecase(ES) }

    /** «Hoy», «Mañana», «Ayer» o «mié 21 oct». */
    fun nombreDia(d: LocalDate, hoy: LocalDate): String = when (d) {
        hoy -> "Hoy"
        hoy.plusDays(1) -> "Mañana"
        hoy.minusDays(1) -> "Ayer"
        else -> d.format(DateTimeFormatter.ofPattern("EEE d MMM", ES)).replace(".", "").replaceFirstChar { it.titlecase(ES) }
    }

    fun corta(d: LocalDate): String = d.format(DateTimeFormatter.ofPattern("d MMM", ES)).replace(".", "")

    /** Primero las de todo el día, luego por hora. */
    private fun orden(ts: List<TareaCal>) = ts.sortedWith(compareBy({ it.hora != null }, { it.hora }, { it.titulo }))

    /** Una línea de agenda: una cabecera de día o una tarea con su detalle (hora, fecha, «→ 23 oct»). */
    sealed interface Linea {
        data class Cabecera(val texto: String) : Linea
        data class Tarea(val t: TareaCal, val detalle: String?, val vencida: Boolean) : Linea
    }

    private fun detalle(t: TareaCal, d: LocalDate): String? = when {
        t.ultimoDia != t.dia && d == t.dia -> listOfNotNull(t.hora, "→ ${corta(t.ultimoDia)}").joinToString(" ")
        t.ultimoDia != t.dia -> "hasta ${corta(t.ultimoDia)}"
        else -> t.hora
    }

    /**
     * La agenda del día elegido (el calendario grande). Hoy, también las vencidas sin hacer.
     * Si ese día no hay nada, «lo próximo» después de él.
     */
    fun delDia(ts: List<TareaCal>, d: LocalDate, hoy: LocalDate): Pair<String, List<Linea>> {
        val vencidas = if (d == hoy) orden(ts.filter { it.vencida(hoy) }).map { Linea.Tarea(it, corta(it.ultimoDia), true) } else emptyList()
        val delDia = orden(ts.filter { it.en(d) }).map { Linea.Tarea(it, detalle(it, d), it.vencida(hoy)) }
        val titulo = nombreDia(d, hoy).let { if (it.length <= 7) "$it · ${corta(d)}" else it }
        if (delDia.isNotEmpty() || vencidas.isNotEmpty()) {
            // Lo del día bajo el título de la agenda; las vencidas, después y con su cabecera.
            return titulo to (delDia + (if (vencidas.isEmpty()) emptyList() else listOf(Linea.Cabecera("Vencidas")) + vencidas))
        }
        val proximas = ts.filter { it.dia.isAfter(d) }.sortedWith(compareBy({ it.dia }, { it.hora })).take(8)
            .map { Linea.Tarea(it, listOfNotNull(nombreDia(it.dia, hoy), it.hora).joinToString(" · "), false) }
        return "$titulo · nada" to (if (proximas.isEmpty()) emptyList() else listOf(Linea.Cabecera("Lo próximo")) + proximas)
    }

    /** La agenda de los próximos días (el calendario pequeño): vencidas y luego día a día. */
    fun proximosDias(ts: List<TareaCal>, hoy: LocalDate, dias: Int = 14): List<Linea> {
        val out = mutableListOf<Linea>()
        val vencidas = orden(ts.filter { it.vencida(hoy) })
        if (vencidas.isNotEmpty()) {
            out += Linea.Cabecera("Vencidas")
            vencidas.forEach { out += Linea.Tarea(it, corta(it.ultimoDia), true) }
        }
        for (i in 0 until dias) {
            val d = hoy.plusDays(i.toLong())
            // Cada tarea, el día que empieza (o hoy, si empezó antes y sigue).
            val delDia = orden(ts.filter { !it.vencida(hoy) && (it.dia == d || (d == hoy && it.dia.isBefore(hoy) && it.en(hoy))) })
            if (delDia.isEmpty()) continue
            out += Linea.Cabecera(nombreDia(d, hoy))
            delDia.forEach { out += Linea.Tarea(it, detalle(it, d), false) }
        }
        return out.take(60)
    }

    fun tareas(datos: JsonObject?): List<TareaCal> = (datos?.get("items") as? JsonArray)?.mapNotNull { e ->
        val o = e as? JsonObject ?: return@mapNotNull null
        fun s(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val inicio = s("i") ?: return@mapNotNull null
        runCatching { LocalDate.parse(inicio.take(10)) }.getOrNull() ?: return@mapNotNull null
        TareaCal(s("p").orEmpty(), s("r").orEmpty(), s("t") ?: "Sin título", inicio, s("f"), (o["h"] as? JsonPrimitive)?.content == "true")
    } ?: emptyList()
}

/** Widget «Calendario»: las tareas con fecha de una o varias BD; mes y agenda, o los próximos días. */
class CalendarioReceiver : ProveedorWidget() {
    override val tipo = "calendario"

    private fun hoy() = LocalDate.now()
    private fun mes(c: ConfigWidget) = c.mes?.let { runCatching { YearMonth.parse(it) }.getOrNull() } ?: YearMonth.from(hoy())

    override fun consultas(c: ConfigWidget): List<Consulta> {
        if (c.fuentes.isEmpty()) return emptyList()
        val (desde, hasta) = Agenda.rango(mes(c), hoy())
        return listOf(Consulta("app.calendario", buildJsonObject {
            put("fuentes", buildJsonArray {
                c.fuentes.forEach { f -> add(buildJsonObject { put("pageId", f.pageId); f.fieldId?.let { put("fieldId", it) }; put("mios", f.mios) }) }
            })
            put("desde", desde.toString())
            put("hasta", hasta.toString())
        }))
    }

    /** Lo guardado vale aunque cambie el mes: solo cuentan las bases de datos elegidas. */
    override fun clave(c: ConfigWidget) = "calendario|" + c.fuentes.joinToString(",") { "${it.pageId}:${it.fieldId}:${it.mios}" }

    override fun resume(c: ConfigWidget, respuestas: List<JsonElement>): JsonElement {
        val r = respuestas[0] as JsonObject
        val (desde, hasta) = Agenda.rango(mes(c), hoy())
        return buildJsonObject {
            put("desde", desde.toString())
            put("hasta", hasta.toString())
            put("fuentes", buildJsonArray {
                (r["fuentes"] as JsonArray).forEach { e ->
                    val f = e as JsonObject
                    add(buildJsonObject { put("p", f.str("pageId").orEmpty()); put("n", f.str("nombre").orEmpty()); f.str("fieldId")?.let { put("f", it) } })
                }
            })
            put("items", buildJsonArray {
                (r["items"] as JsonArray).take(400).forEach { e ->
                    val t = e as JsonObject
                    add(buildJsonObject {
                        put("p", t.str("pageId").orEmpty()); put("r", t.str("recordId").orEmpty()); put("t", t.str("titulo").orEmpty().take(200))
                        put("i", t.str("inicio").orEmpty()); t.str("fin")?.let { put("f", it) }; put("h", (t["hecha"] as? JsonPrimitive)?.content == "true")
                    })
                }
            })
        }
    }

    override fun accion(ctx: Context, id: Int, accion: String?, valor: String): Boolean {
        val c = Configs.lee(ctx, id)
        when (accion) {
            Widgets.ACCION_DIA -> {
                val d = runCatching { LocalDate.parse(valor) }.getOrNull() ?: return true
                Configs.guarda(ctx, id, c.copy(dia = d.toString(), mes = YearMonth.from(d).toString()))
            }
            Widgets.ACCION_MES -> {
                val m = mes(c).plusMonths(valor.toLongOrNull() ?: 0)
                // En el mes de hoy se elige hoy; en otro, su día 1.
                val d = if (m == YearMonth.from(hoy())) hoy() else m.atDay(1)
                Configs.guarda(ctx, id, c.copy(mes = m.toString(), dia = d.toString()))
                val guardado = Instantaneas.lee(ctx, id)?.datos as? JsonObject
                val desde = guardado?.str("desde")?.let(LocalDate::parse)
                val hasta = guardado?.str("hasta")?.let(LocalDate::parse)
                val r = Agenda.rejilla(m)
                pinta(ctx, id)
                // Un mes que no estaba en lo traído: a por él.
                if (desde == null || hasta == null || r.first().isBefore(desde) || r.last().isAfter(hasta)) refrescaDetras(ctx, intArrayOf(id), "mes")
                return true
            }
            else -> return false
        }
        pinta(ctx, id)
        return true
    }

    override fun vista(ctx: Context, id: Int, c: ConfigWidget, e: EstadoWidget, opciones: Bundle?): Pintado {
        if (c.fuentes.isEmpty()) return Pintado(fallo(ctx, "Toca para elegir las bases de datos", Widgets.piConfigura(ctx, id)), "config")
        if (!e.conSesion) return Pintado(fallo(ctx, "${Widgets.INICIA_SESION} para ver tus tareas."), "sesion")
        val d = e.datos as? JsonObject
        val ts = Agenda.tareas(d)
        val hoy = hoy()
        val mes = mes(c)
        val elegido = c.dia?.let { runCatching { LocalDate.parse(it) }.getOrNull() }?.takeIf { YearMonth.from(it) == mes } ?: if (mes == YearMonth.from(hoy)) hoy else mes.atDay(1)
        // Lo traído no cubre este mes (se acaba de cambiar): sin puntos y «Cargando…».
        val desde = d?.str("desde")?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val hasta = d?.str("hasta")?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val r = Agenda.rejilla(mes)
        val cubre = desde != null && hasta != null && !r.first().isBefore(desde) && !r.last().isAfter(hasta)
        val aviso = e.aviso() ?: if (!cubre && d != null) "Cargando…" else null
        val fuentes = (d?.get("fuentes") as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
        val primera = fuentes.firstOrNull() ?: JsonObject(mapOf("p" to JsonPrimitive(c.fuentes.first().pageId)))
        val titulo = c.titulo ?: fuentes.singleOrNull()?.str("n")?.ifBlank { null } ?: "Próximos días"
        val grande = grande(ctx, id, mes, elegido, hoy, if (cubre) ts else emptyList(), aviso, primera)
        val pequeño = pequeño(ctx, id, titulo, hoy, ts, e.aviso(), primera)
        val rv = if (Build.VERSION.SDK_INT >= 31) RemoteViews(mapOf(SizeF(100f, 40f) to pequeño, SizeF(200f, GRANDE_DESDE) to grande))
        else if ((opciones?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0) >= GRANDE_DESDE) grande else pequeño
        return Pintado(rv, e.que(ts.size), ts.size)
    }

    override fun muestra(ctx: Context): RemoteViews {
        val hoy = Muestras.HOY_CALENDARIO
        val primera = JsonObject(mapOf("p" to JsonPrimitive("muestra")))
        return grande(ctx, 0, YearMonth.from(hoy), hoy, hoy, Muestras.tareas, null, primera)
    }

    companion object {
        /** Desde este alto (dp) cabe el mes en rejilla; por debajo, la agenda de los próximos días. */
        const val GRANDE_DESDE = 280f

        private fun nueva(ctx: Context, fuente: JsonObject, dia: LocalDate) = Widgets.piAbre(
            ctx, "notiono://nuevafila/${fuente.str("p")}?" + (fuente.str("f")?.let { "campo=$it&" } ?: "") + "fecha=$dia",
        )

        private fun filas(lineas: List<Agenda.Linea>, hoy: LocalDate): List<Fila> = lineas.mapIndexed { i, l ->
            when (l) {
                is Agenda.Linea.Cabecera -> Fila("c$i${l.texto}".hashCode().toLong(), estilo(l.texto, negrita = true), color = if (l.texto == "Vencidas") R.color.widget_rojo else R.color.widget_apagado, tamSp = 12f, altoDp = 3)
                is Agenda.Linea.Tarea -> Fila(
                    "t$i${l.t.recordId}".hashCode().toLong(), estilo(l.t.titulo, tachado = l.t.hecha),
                    color = if (l.t.hecha) R.color.widget_apagado else if (l.vencida) R.color.widget_rojo else R.color.widget_texto,
                    detalle = l.detalle, colorDetalle = if (l.vencida && !l.t.hecha) R.color.widget_rojo else R.color.widget_apagado,
                    alTocar = "notiono://fila/${l.t.pageId}/${l.t.recordId}", altoDp = 3,
                )
            }
        }

        fun pequeño(ctx: Context, id: Int, titulo: String, hoy: LocalDate, ts: List<TareaCal>, aviso: String?, fuente: JsonObject): RemoteViews =
            vistaLista(
                ctx, id, CalendarioReceiver::class.java, titulo, Widgets.piAbre(ctx, "notiono://pagina/${fuente.str("p")}"),
                nueva(ctx, fuente, hoy), aviso, filas(Agenda.proximosDias(ts, hoy), hoy), "Nada en los próximos días.",
            )

        fun grande(ctx: Context, id: Int, mes: YearMonth, elegido: LocalDate, hoy: LocalDate, ts: List<TareaCal>, aviso: String?, fuente: JsonObject): RemoteViews {
            val (tituloAgenda, lineas) = Agenda.delDia(ts, elegido, hoy)
            val rv = vistaLista(
                ctx, id, CalendarioReceiver::class.java, Agenda.nombreMes(mes), Widgets.piAbre(ctx, "notiono://pagina/${fuente.str("p")}"),
                nueva(ctx, fuente, elegido), aviso, filas(lineas, hoy), "Nada este día.", R.layout.widget_calendario,
            )
            rv.setTextViewText(R.id.cal_agenda, tituloAgenda)
            rv.setOnClickPendingIntent(R.id.cal_anterior, Widgets.piAccion(ctx, CalendarioReceiver::class.java, Widgets.ACCION_MES, id, "-1"))
            rv.setOnClickPendingIntent(R.id.cal_siguiente, Widgets.piAccion(ctx, CalendarioReceiver::class.java, Widgets.ACCION_MES, id, "1"))
            val dias = Agenda.rejilla(mes)
            // La sexta semana solo si el mes la usa.
            rv.setViewVisibility(R.id.cal_f5, if (YearMonth.from(dias[35]) == mes) View.VISIBLE else View.GONE)
            dias.forEachIndexed { i, d ->
                val num = ID_DIAS[i]
                rv.setTextViewText(num, d.dayOfMonth.toString())
                when {
                    d == hoy -> {
                        rv.setInt(num, "setBackgroundResource", R.drawable.widget_dia_hoy)
                        rv.setTextColor(num, android.graphics.Color.WHITE)
                    }
                    else -> {
                        rv.setInt(num, "setBackgroundResource", if (d == elegido) R.drawable.widget_dia_elegido else 0)
                        rv.colorTexto(ctx, num, if (YearMonth.from(d) == mes) R.color.widget_texto else R.color.widget_apagado)
                    }
                }
                val delDia = ts.filter { it.en(d) }
                rv.setViewVisibility(ID_PUNTOS[i], if (delDia.isEmpty()) View.INVISIBLE else View.VISIBLE)
                if (delDia.any { it.vencida(hoy) }) rv.colorTexto(ctx, ID_PUNTOS[i], R.color.widget_rojo)
                rv.setOnClickPendingIntent(ID_CELDAS[i], Widgets.piAccion(ctx, CalendarioReceiver::class.java, Widgets.ACCION_DIA, id, d.toString()))
            }
            return rv
        }

        // Las 42 celdas de layout/widget_calendario.xml (número, punto y zona de toque).
        private val ID_DIAS = intArrayOf(
            R.id.cal_d0, R.id.cal_d1, R.id.cal_d2, R.id.cal_d3, R.id.cal_d4, R.id.cal_d5, R.id.cal_d6,
            R.id.cal_d7, R.id.cal_d8, R.id.cal_d9, R.id.cal_d10, R.id.cal_d11, R.id.cal_d12, R.id.cal_d13,
            R.id.cal_d14, R.id.cal_d15, R.id.cal_d16, R.id.cal_d17, R.id.cal_d18, R.id.cal_d19, R.id.cal_d20,
            R.id.cal_d21, R.id.cal_d22, R.id.cal_d23, R.id.cal_d24, R.id.cal_d25, R.id.cal_d26, R.id.cal_d27,
            R.id.cal_d28, R.id.cal_d29, R.id.cal_d30, R.id.cal_d31, R.id.cal_d32, R.id.cal_d33, R.id.cal_d34,
            R.id.cal_d35, R.id.cal_d36, R.id.cal_d37, R.id.cal_d38, R.id.cal_d39, R.id.cal_d40, R.id.cal_d41,
        )
        private val ID_PUNTOS = intArrayOf(
            R.id.cal_p0, R.id.cal_p1, R.id.cal_p2, R.id.cal_p3, R.id.cal_p4, R.id.cal_p5, R.id.cal_p6,
            R.id.cal_p7, R.id.cal_p8, R.id.cal_p9, R.id.cal_p10, R.id.cal_p11, R.id.cal_p12, R.id.cal_p13,
            R.id.cal_p14, R.id.cal_p15, R.id.cal_p16, R.id.cal_p17, R.id.cal_p18, R.id.cal_p19, R.id.cal_p20,
            R.id.cal_p21, R.id.cal_p22, R.id.cal_p23, R.id.cal_p24, R.id.cal_p25, R.id.cal_p26, R.id.cal_p27,
            R.id.cal_p28, R.id.cal_p29, R.id.cal_p30, R.id.cal_p31, R.id.cal_p32, R.id.cal_p33, R.id.cal_p34,
            R.id.cal_p35, R.id.cal_p36, R.id.cal_p37, R.id.cal_p38, R.id.cal_p39, R.id.cal_p40, R.id.cal_p41,
        )
        private val ID_CELDAS = intArrayOf(
            R.id.cal_c0, R.id.cal_c1, R.id.cal_c2, R.id.cal_c3, R.id.cal_c4, R.id.cal_c5, R.id.cal_c6,
            R.id.cal_c7, R.id.cal_c8, R.id.cal_c9, R.id.cal_c10, R.id.cal_c11, R.id.cal_c12, R.id.cal_c13,
            R.id.cal_c14, R.id.cal_c15, R.id.cal_c16, R.id.cal_c17, R.id.cal_c18, R.id.cal_c19, R.id.cal_c20,
            R.id.cal_c21, R.id.cal_c22, R.id.cal_c23, R.id.cal_c24, R.id.cal_c25, R.id.cal_c26, R.id.cal_c27,
            R.id.cal_c28, R.id.cal_c29, R.id.cal_c30, R.id.cal_c31, R.id.cal_c32, R.id.cal_c33, R.id.cal_c34,
            R.id.cal_c35, R.id.cal_c36, R.id.cal_c37, R.id.cal_c38, R.id.cal_c39, R.id.cal_c40, R.id.cal_c41,
        )
    }
}
