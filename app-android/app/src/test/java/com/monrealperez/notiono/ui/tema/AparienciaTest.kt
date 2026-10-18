package com.monrealperez.notiono.ui.tema

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AparienciaTest {
    @Test
    fun loElegidoSeRecuerdaYLoSabeElSistema() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        Apariencia.pon(ctx, Apariencia.Modo.Oscuro)
        assertEquals(Apariencia.Modo.Oscuro, Apariencia.modo(ctx).value)
        Apariencia.pon(ctx, Apariencia.Modo.Sistema)
        assertEquals(Apariencia.Modo.Sistema, Apariencia.modo(ctx).value)
        assertEquals("Sistema", ctx.getSharedPreferences("apariencia", Context.MODE_PRIVATE).getString("modo", null))
    }
}
