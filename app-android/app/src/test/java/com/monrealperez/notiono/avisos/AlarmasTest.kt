package com.monrealperez.notiono.avisos

import android.Manifest
import android.app.AlarmManager
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.respuestaTrpc
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowAlarmManager
import java.time.Instant

/**
 * Los recordatorios en el móvil: se bajan y se programan con alarmas exactas, se quitan los
 * que ya no están, se reprograman tras reiniciar sin red, suenan una sola vez y no se repiten
 * cuando el mismo aviso llega por la bandeja.
 */
@RunWith(RobolectricTestRunner::class)
class AlarmasTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private var lista = "[]"
    private val am get() = shadowOf(ctx.getSystemService(AlarmManager::class.java))
    private val dentroDe1h = Instant.ofEpochMilli(System.currentTimeMillis() + 3600_000L).toString()
    private val dentroDe2h = Instant.ofEpochMilli(System.currentTimeMillis() + 7200_000L).toString()

    private fun rec(key: String, cuando: String, titulo: String) =
        """{"key":"$key","cuando":"$cuando","titulo":"$titulo","texto":"$titulo · hoy a las 17:00","pageId":"bd1","recordId":"r-$key"}"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.url.encodedPath.endsWith("app.recordatorios") -> respuestaTrpc(lista)
                else -> respuestaTrpc("{}")
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        Servicios.de(ctx).sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        ShadowAlarmManager.setCanScheduleExactAlarms(true)
        shadowOf(ctx as Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
        ctx.getSharedPreferences("recordatorios", Context.MODE_PRIVATE).edit().clear().commit()
    }

    /** Las alarmas de recordatorios (sin la de medianoche), por su hora. */
    private fun alarmas() = am.scheduledAlarms.filter { it.operation?.intentDataString()?.startsWith("notiono-recordatorio") == true }

    private fun android.app.PendingIntent.intentDataString(): String? = shadowOf(this).savedIntent.dataString

    @Test
    fun seProgramanExactasYSeQuitanLasQueYaNoEstan() = runBlocking {
        lista = "[${rec("a", dentroDe1h, "Llevar el coche")},${rec("b", dentroDe2h, "Pagar el seguro")}]"
        Alarmas.actualiza(ctx, "prueba")
        val a = alarmas()
        assertEquals(2, a.size)
        assertEquals(setOf(Instant.parse(dentroDe1h).toEpochMilli(), Instant.parse(dentroDe2h).toEpochMilli()), a.map { it.triggerAtTime }.toSet())
        assertTrue("exactas y aunque el móvil duerma", a.all { it.allowWhileIdle && it.windowLengthMs == ShadowAlarmManager.WINDOW_EXACT && it.type == AlarmManager.RTC_WAKEUP })
        // Y la de medianoche para el Calendario.
        assertTrue(am.scheduledAlarms.any { it.operation != null && shadowOf(it.operation).savedIntent.action == "com.monrealperez.notiono.MEDIANOCHE" })
        // Se quita un recordatorio en la web: su alarma, fuera.
        lista = "[${rec("b", dentroDe2h, "Pagar el seguro")}]"
        Alarmas.actualiza(ctx, "prueba")
        assertEquals(listOf(Instant.parse(dentroDe2h).toEpochMilli()), alarmas().map { it.triggerAtTime })
    }

    @Test
    fun sinPermisoDeAlarmasExactasSiguenSonando() = runBlocking {
        ShadowAlarmManager.setCanScheduleExactAlarms(false)
        lista = "[${rec("a", dentroDe1h, "Llevar el coche")}]"
        Alarmas.actualiza(ctx, "prueba")
        val a = alarmas().single()
        assertTrue(a.allowWhileIdle)
        assertTrue(Permisos.faltan(ctx).contains("alarmas exactas"))
    }

    @Test
    fun trasReiniciarSeReprogramanSinRed() {
        lista = "[${rec("a", dentroDe1h, "Llevar el coche")}]"
        runBlocking { Alarmas.actualiza(ctx, "prueba") }
        // Reiniciar borra todas las alarmas del sistema; y sin red.
        alarmas().forEach { ctx.getSystemService(AlarmManager::class.java).cancel(it.operation!!) }
        assertEquals(0, alarmas().size)
        servidor.close()
        ReprogramaReceiver().onReceive(ctx, Intent(Intent.ACTION_BOOT_COMPLETED))
        assertEquals(listOf(Instant.parse(dentroDe1h).toEpochMilli()), alarmas().map { it.triggerAtTime })
    }

    @Test
    fun suenaUnaVezYLaBandejaNoLoRepite() {
        lista = "[${rec("a", dentroDe1h, "Llevar el coche")}]"
        runBlocking { Alarmas.actualiza(ctx, "prueba") }
        val nm = shadowOf(ctx.getSystemService(NotificationManager::class.java))
        val alarma = alarmas().single()
        am.fireAlarm(alarma)
        org.robolectric.shadows.ShadowLooper.idleMainLooper()
        assertEquals(1, nm.allNotifications.size)
        val n = nm.allNotifications.single()
        assertEquals("Llevar el coche", n.extras.getString("android.title"))
        // Tocarla abre la fila.
        assertEquals("notiono://fila/bd1/r-a", shadowOf(n.contentIntent).savedIntent.dataString)
        // El servidor crea a la vez el aviso de la bandeja con la misma clave: no sale otra vez.
        val r = Alarmas.guardados(ctx).single()
        assertTrue(!Alarmas.muestra(ctx, r))
        assertEquals(1, nm.allNotifications.size)
        // Y ya no se vuelve a programar.
        runBlocking { Alarmas.actualiza(ctx, "prueba") }
        assertEquals(0, alarmas().size)
        assertTrue(Servicios.de(ctx).registro.eventos().any { it.tipo == "avisos" && "recordatorio a su hora · enseñado" in it.mensaje })
    }
}
