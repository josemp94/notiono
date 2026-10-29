package com.monrealperez.notiono.avisos

import android.Manifest
import android.app.AlarmManager
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.ui.pagina.AtajosRecordar
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowAlarmManager
import java.time.Instant
import java.util.concurrent.LinkedBlockingQueue

/**
 * «Recordarme…» en la app: los atajos con la hora de Madrid (como la web) y los botones de
 * la notificación del recordatorio, «Hecho» y «Posponer 1 h», contra un servidor falso.
 */
@RunWith(RobolectricTestRunner::class)
class RecordarTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    private val pedidas = LinkedBlockingQueue<String>()
    @Volatile private var sinRed = false

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (sinRed) return MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build()
                val cuerpo = request.body?.utf8().orEmpty()
                pedidas.add("${request.url.encodedPath} $cuerpo")
                return when {
                    request.url.encodedPath == "/api/recordatorio" && cuerpo.contains("\"posponer\"") ->
                        MockResponse.Builder().body("""{"pospuesto":{"key":"pos:p1","cuando":"2030-01-01T10:00:00.000Z"}}""").build()
                    request.url.encodedPath == "/api/recordatorio" -> MockResponse.Builder().body("""{"hecha":true}""").build()
                    else -> MockResponse.Builder().body("""{"result":{"data":{"json":[]}}}""").build()
                }
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

    @Test
    fun losAtajosVanEnHoraDeMadridComoEnLaWeb() {
        val jueves = Instant.parse("2026-10-22T08:14:30Z") // 10:14 en Madrid (verano)
        assertEquals("2026-10-22T11:15", AtajosRecordar.atajo("1h", jueves))
        assertEquals("2026-10-22T19:00", AtajosRecordar.atajo("tarde", jueves))
        assertEquals("2026-10-23T09:00", AtajosRecordar.atajo("manana", jueves))
        assertNull("a las 19:30 ya no hay «esta tarde»", AtajosRecordar.atajo("tarde", Instant.parse("2026-10-22T17:30:00Z")))
        // El sábado del cambio de hora a las 22:00: mañana ya es domingo.
        assertEquals("2026-10-25T09:00", AtajosRecordar.atajo("manana", Instant.parse("2026-10-24T20:00:00Z")))
        // Primavera: 01:30 CET + 1 h = 03:30 CEST.
        assertEquals("2026-03-29T03:30", AtajosRecordar.atajo("1h", Instant.parse("2026-03-29T00:30:00Z")))
        assertEquals("mañana a las 9:00", AtajosRecordar.cuando("2026-10-23T09:00", jueves))
    }

    private fun rec() = Recordatorio("rem:r1:f:x", Instant.now().toString(), "Comprar pan", "Comprar pan · hoy a las 17:00", "bd1", "r1")

    @Test
    fun laNotificacionLlevaHechoYPosponer() {
        Alarmas.muestra(ctx, rec())
        val n = shadowOf(ctx.getSystemService(NotificationManager::class.java)).allNotifications.single()
        assertEquals(listOf("Hecho", "Posponer 1 h"), n.actions.map { it.title.toString() })
    }

    @Test
    fun hechoLlamaAlServidorYQuitaLaNotificacion() = runBlocking {
        Alarmas.muestra(ctx, rec())
        Alarmas.accion(ctx, "hecho", rec())
        val p = pedidas.poll(5, java.util.concurrent.TimeUnit.SECONDS)!!
        assertTrue(p, p.startsWith("/api/recordatorio ") && p.contains("\"accion\":\"hecho\"") && p.contains("\"recordId\":\"r1\""))
        assertTrue(shadowOf(ctx.getSystemService(NotificationManager::class.java)).allNotifications.isEmpty())
    }

    @Test
    fun posponerProgramaOtraAlarmaConLaKeyDelServidorYSinRedUnaLocal() = runBlocking {
        Alarmas.accion(ctx, "posponer", rec())
        assertTrue(pedidas.poll(5, java.util.concurrent.TimeUnit.SECONDS)!!.contains("\"accion\":\"posponer\""))
        val guardado = Alarmas.guardados(ctx).single()
        assertEquals("pos:p1", guardado.key)
        assertEquals("2030-01-01T10:00:00.000Z", guardado.cuando)
        val am = shadowOf(ctx.getSystemService(AlarmManager::class.java))
        assertTrue(am.scheduledAlarms.any { shadowOf(it.operation).savedIntent.dataString == "notiono-recordatorio://pos%3Ap1" })
        // Sin red: suena igual dentro de una hora (alarma local), y se apunta el fallo.
        sinRed = true
        val antes = System.currentTimeMillis()
        Alarmas.accion(ctx, "posponer", rec().copy(key = "rem:otro"))
        val local = Alarmas.guardados(ctx).single { it.key.startsWith("local:rem:otro") }
        assertTrue(local.ms - antes in 3_590_000..3_610_000)
    }
}
