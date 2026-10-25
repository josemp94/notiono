package com.monrealperez.notiono.avisos

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.core.content.edit
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.errorTrpc
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

/**
 * Los avisos del sistema traen los de TODOS los espacios (2.4.0): «te han compartido una
 * página» o «te han añadido a un espacio» llegan aunque la app esté en otro, dicen de qué
 * espacio son y al tocarlos se pasa a él. Con un servidor viejo, los del activo.
 */
@RunWith(RobolectricTestRunner::class)
class AvisadorEspaciosTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var servidor: MockWebServer
    @Volatile private var conAvisosApp = true

    private val avisos = """[
      {"id":"n1","type":"share","read":false,"createdAt":"2026-10-25T10:00:00.000Z","actor":{"name":"Gio"},"page":{"id":"p1","title":"Viaje"},"espacio":{"id":"w2","name":"Trabajo"}},
      {"id":"n2","type":"space","read":false,"createdAt":"2026-10-25T10:00:00.000Z","title":"Casa de Gio","actor":{"name":"Gio"},"espacio":{"id":"w3","name":"Casa de Gio"}},
      {"id":"n3","type":"mention","read":false,"createdAt":"2026-10-25T10:00:00.000Z","actor":{"name":"Luis"},"page":{"id":"p9","title":"Notas"},"espacio":{"id":"w1","name":"Mío"}}
    ]"""

    @Before
    fun prepara() {
        servidor = MockWebServer()
        servidor.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.url.encodedPath.endsWith("app.avisos") ->
                    if (conAvisosApp) respuestaTrpc(avisos) else errorTrpc(404, "NOT_FOUND", "No procedure found on path \"app.avisos\"")
                request.url.encodedPath.endsWith("notifications.list") ->
                    respuestaTrpc("""[{"id":"n3","type":"mention","read":false,"workspaceId":"w1","actor":{"name":"Luis"},"page":{"id":"p9","title":"Notas"}}]""")
                else -> respuestaTrpc("{}")
            }
        }
        servidor.start()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = servidor.url("/").toString().trimEnd('/')
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.sesion.espacio = "w1"
        shadowOf(ctx as Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        // No es la primera vez (la primera solo apunta lo que hay como visto).
        ctx.getSharedPreferences("avisos", Context.MODE_PRIVATE).edit { putStringSet("vistos", setOf("viejo")) }
    }

    @After
    fun cierra() {
        servidor.close()
        Servicios.de(ctx).sesion.olvida()
        Servicios.baseDePrueba = null
        ctx.getSharedPreferences("avisos", Context.MODE_PRIVATE).edit { clear() }
    }

    private fun sacadas(): List<Notification> = shadowOf(ctx.getSystemService(NotificationManager::class.java)).allNotifications

    private fun Notification.titulo() = extras.getString(Notification.EXTRA_TITLE)
    private fun Notification.texto() = extras.getCharSequence(Notification.EXTRA_TEXT).toString()
    private fun Notification.enlace() = shadowOf(contentIntent).savedIntent.dataString

    @Test
    fun losDeOtroEspacioDicenCualYAbrenEnEl() = runBlocking {
        Avisador.revisa(ctx)
        val n = sacadas()
        assertEquals(3, n.size)
        val share = n.single { it.texto().contains("compartido") }
        assertEquals("Notiono · Trabajo", share.titulo())
        assertEquals("Gio ha compartido «Viaje» contigo", share.texto())
        assertEquals("notiono://pagina/p1?ws=w2", share.enlace())
        val alta = n.single { it.texto().contains("añadido") }
        assertEquals("Gio te ha añadido al espacio «Casa de Gio»", alta.texto())
        assertEquals("notiono://espacio/w3", alta.enlace())
        // Los del espacio activo, como siempre.
        val mencion = n.single { it.texto().contains("mencionó") }
        assertEquals("Notiono", mencion.titulo())
        assertEquals("notiono://pagina/p9?ws=w1", mencion.enlace())
        // Y no se repiten.
        Avisador.revisa(ctx)
        assertEquals(3, sacadas().size)
    }

    @Test
    fun conUnServidorDeAntesLosDelActivo() = runBlocking {
        conAvisosApp = false
        Avisador.revisa(ctx)
        val n = sacadas()
        assertEquals(1, n.size)
        assertTrue(n[0].texto().contains("Luis te mencionó"))
    }
}
