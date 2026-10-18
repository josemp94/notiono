package com.monrealperez.notiono.util

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** Abrir otras apps sin que haya ninguna que lo atienda: se avisa, la app sigue. */
@RunWith(RobolectricTestRunner::class)
class EnlacesTest {
    private val app get() = ApplicationProvider.getApplicationContext<Application>()

    @Test
    fun sinAppDeCorreoNoSeCierra() {
        shadowOf(app).checkActivities(true)
        assertFalse(Enlaces.lanza(app, Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:ana@example.com")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)))
    }

    @Test
    fun descargarAlgoQueNoEsHttpNoSeCierra() {
        // El gestor de descargas solo acepta http(s): antes lanzaba IllegalArgumentException.
        Enlaces.descarga(app, "content://otra.app/archivo.pdf", "archivo.pdf")
    }
}
