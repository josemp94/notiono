package com.monrealperez.notiono.compartir

import android.content.Intent
import android.text.SpannableString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CompartirTest {
    @Test
    fun textoConFormatoNoLlegaVacio() {
        // Hay apps que comparten un CharSequence con formato: getStringExtra daba null.
        val conFormato = Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_TEXT, SpannableString("lista de la compra"))
        assertEquals("lista de la compra", textoCompartido(conFormato, Intent.EXTRA_TEXT))
        assertEquals("adiós", textoCompartido(Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_TEXT, "adiós"), Intent.EXTRA_TEXT))
        assertNull(textoCompartido(Intent(Intent.ACTION_SEND), Intent.EXTRA_TEXT))
    }
}
