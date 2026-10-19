package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.time.LocalDate
import java.time.YearMonth

/** El widget Calendario: las cuentas de la agenda y lo que pinta (mes, puntos, agenda, acciones). */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class CalendarioTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private val hoy = LocalDate.of(2026, 10, 19)
    private val ts = Muestras.tareas

    @Before
    fun prepara() {
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios.de(ctx).sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
    }

    @After
    fun cierra() {
        Servicios.de(ctx).sesion.olvida()
        File(ctx.filesDir, "widgets").deleteRecursively()
    }

    @Test
    fun rejillaDeLunesADomingo() {
        val r = Agenda.rejilla(YearMonth.of(2026, 10))
        assertEquals(42, r.size)
        assertEquals(LocalDate.of(2026, 9, 28), r.first()) // el 1-oct-2026 es jueves
        assertEquals(java.time.DayOfWeek.MONDAY, r.first().dayOfWeek)
        val (desde, hasta) = Agenda.rango(YearMonth.of(2026, 10), hoy)
        assertEquals(LocalDate.of(2026, 9, 18), desde)
        assertEquals(LocalDate.of(2026, 12, 20), hasta)
        assertEquals("Octubre 2026", Agenda.nombreMes(YearMonth.of(2026, 10)))
    }

    @Test
    fun agendaDeHoyConVencidasYHoras() {
        val (titulo, lineas) = Agenda.delDia(ts, hoy, hoy)
        assertEquals("Hoy · 19 oct", titulo)
        val textos = lineas.map { if (it is Agenda.Linea.Tarea) "${it.t.titulo}|${it.detalle}|${it.vencida}" else "# ${(it as Agenda.Linea.Cabecera).texto}" }
        // Las de hoy (las de todo el día y después por hora) y luego las vencidas sin hacer.
        assertEquals(listOf(
            "Comprar el regalo|null|false", "Llamar al fontanero|10:00|false", "Recoger a Lucía|17:30|false",
            "# Vencidas", "Renovar el DNI|16 oct|true",
        ), textos)
    }

    @Test
    fun unDiaSinNadaEnseñaLoProximo() {
        val (titulo, lineas) = Agenda.delDia(ts, LocalDate.of(2026, 10, 22), hoy)
        assertTrue(titulo, titulo.endsWith("· nada"))
        assertEquals("Lo próximo", (lineas.first() as Agenda.Linea.Cabecera).texto)
        assertEquals("Viaje a Lisboa", (lineas[1] as Agenda.Linea.Tarea).t.titulo)
    }

    @Test
    fun unRangoSaleTodosSusDias() {
        val viaje = ts.first { it.titulo == "Viaje a Lisboa" }
        assertTrue(viaje.en(LocalDate.of(2026, 10, 25)))
        val (_, lineas) = Agenda.delDia(ts, LocalDate.of(2026, 10, 25), hoy)
        assertEquals("hasta 26 oct", (lineas.single() as Agenda.Linea.Tarea).detalle)
    }

    @Test
    fun proximosDias() {
        val l = Agenda.proximosDias(ts, hoy)
        val cabeceras = l.filterIsInstance<Agenda.Linea.Cabecera>().map { it.texto }
        assertEquals(listOf("Vencidas", "Hoy", "Mié 21 oct", "Sáb 24 oct", "Vie 30 oct"), cabeceras)
        // La cita del 4 de noviembre queda fuera de los 14 días.
        assertTrue(l.none { it is Agenda.Linea.Tarea && it.t.titulo == "Cita del médico" })
    }

    private fun textos(rv: RemoteViews) = Arnes.textos(ctx, rv)

    @Test
    fun grandePintaElMesConHoyYLaAgenda() {
        val primera = JsonObject(emptyMap())
        val t = textos(CalendarioReceiver.grande(ctx, 7, YearMonth.of(2026, 10), hoy, hoy, ts, null, primera))
        assertTrue("$t", t.containsAll(listOf("Octubre 2026", "L", "D", "1", "19", "31", "Hoy · 19 oct", "Vencidas", "Renovar el DNI", "Recoger a Lucía", "17:30")))
    }

    @Test
    fun pequeñoPintaLosProximosDias() {
        val t = textos(CalendarioReceiver.pequeño(ctx, 7, "Tareas", hoy, ts, null, JsonObject(emptyMap())))
        assertTrue("$t", t.containsAll(listOf("Tareas", "Vencidas", "Hoy", "Recoger a Lucía", "Mié 21 oct", "Revisar la caldera", "09:00")))
    }

    @Test
    fun elegirDiaYCambiarDeMes() {
        val id = Arnes.pon(ctx, CalendarioReceiver::class.java, ConfigWidget(fuentes = listOf(FuenteCal("bd1", "f"))))
        val datos = json.parseToJsonElement("""{"desde":"2000-01-01","hasta":"2100-01-01","fuentes":[{"p":"bd1","n":"Tareas","f":"f"}],
            "items":[{"p":"bd1","r":"r1","t":"Pagar el seguro","i":"${LocalDate.now().withDayOfMonth(1)}","h":false}]}""")
        Instantaneas.guarda(ctx, id, Instantanea(CalendarioReceiver().clave(Configs.lee(ctx, id)), datos, System.currentTimeMillis()))
        val pintados = mutableMapOf<Int, RemoteViews>()
        Widgets.alPintar = { i, rv -> pintados[i] = rv }
        try {
            fun accion(a: String, v: String) = CalendarioReceiver().onReceive(ctx, Intent(ctx, CalendarioReceiver::class.java).setAction(a)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra(Widgets.EXTRA_VALOR, v))
            val dia1 = LocalDate.now().withDayOfMonth(1)
            accion(Widgets.ACCION_DIA, dia1.toString())
            assertEquals(dia1.toString(), Configs.lee(ctx, id).dia)
            assertTrue(textos(pintados[id]!!).isNotEmpty())
            accion(Widgets.ACCION_MES, "1")
            val siguiente = YearMonth.now().plusMonths(1)
            assertEquals(siguiente.toString(), Configs.lee(ctx, id).mes)
            assertEquals(siguiente.atDay(1).toString(), Configs.lee(ctx, id).dia)
            accion(Widgets.ACCION_MES, "-1")
            assertEquals(LocalDate.now().toString(), Configs.lee(ctx, id).dia, "volver al mes de hoy elige hoy")
        } finally {
            Widgets.alPintar = null
        }
    }

    private fun assertEquals(esperado: Any?, real: Any?, mensaje: String) = org.junit.Assert.assertEquals(mensaje, esperado, real)
}
