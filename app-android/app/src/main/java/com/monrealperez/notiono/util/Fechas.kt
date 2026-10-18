package com.monrealperez.notiono.util

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Fechas como las enseña la web (es-ES): «5 ago 2026», «hoy», «hace 3 min». */
object Fechas {
    val es: Locale = Locale.forLanguageTag("es-ES")
    private val MESES = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

    fun instante(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

    /** «hace 5 min», «ayer», «12 oct»… para avisos, comentarios e historial. */
    fun haceCuanto(iso: String?, ahora: Instant = Instant.now()): String {
        val t = instante(iso) ?: return ""
        val s = ChronoUnit.SECONDS.between(t, ahora)
        return when {
            s < 60 -> "ahora"
            s < 3600 -> "hace ${s / 60} min"
            s < 86400 -> "hace ${s / 3600} h"
            s < 2 * 86400 -> "ayer"
            s < 7 * 86400 -> "hace ${s / 86400} días"
            else -> {
                val d = t.atZone(ZoneId.systemDefault()).toLocalDate()
                val año = if (d.year != LocalDate.now().year) " ${d.year}" else ""
                "${d.dayOfMonth} ${MESES[d.monthValue - 1]}$año"
            }
        }
    }

    /** «18 oct 2026, 17:42» (Fecha de creación/edición, como la web). */
    fun fechaHora(iso: String?): String {
        val t = instante(iso) ?: return ""
        val d = t.atZone(ZoneId.systemDefault())
        return "%02d %s %d, %02d:%02d".format(d.dayOfMonth, MESES[d.monthValue - 1], d.year, d.hour, d.minute)
    }

    /** «5 ago 2026» de un «YYYY-MM-DD…». */
    fun largo(ymd: String): String {
        val d = runCatching { LocalDate.parse(ymd.take(10)) }.getOrNull() ?: return ymd
        return "${d.dayOfMonth} ${MESES[d.monthValue - 1]} ${d.year}"
    }

    /** «hoy», «mañana», «hace 2 días»… si está cerca; si no, el largo (fechaTarea de la web). */
    fun relativa(ymd: String, hoy: LocalDate = LocalDate.now()): String {
        val d = runCatching { LocalDate.parse(ymd.take(10)) }.getOrNull() ?: return ymd
        val dias = ChronoUnit.DAYS.between(hoy, d)
        val base = when {
            dias == 0L -> "hoy"
            dias == -1L -> "ayer"
            dias == 1L -> "mañana"
            dias in -6..-2 -> "hace ${-dias} días"
            dias in 2..6 -> "en $dias días"
            else -> largo(ymd)
        }
        val hora = ymd.drop(11).take(5)
        return if (hora.length == 5) "$base $hora" else base
    }

    fun hoy(): String = LocalDate.now().toString()

    fun ymd(d: LocalDate) = d.toString()

    fun dt(fecha: LocalDate, hora: String?) = if (hora.isNullOrBlank()) fecha.toString() else "${fecha}T$hora"

    @Suppress("unused")
    val formatoHora: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    fun ahoraLocal(): LocalDateTime = LocalDateTime.now()
}
