package com.monrealperez.notiono.compartir

import android.content.Intent
import android.net.Uri
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

    @Test
    fun unoOVariosArchivos() {
        val a = Uri.parse("content://galeria/1")
        val b = Uri.parse("content://galeria/2")
        assertEquals(listOf(a), archivosCompartidos(Intent(Intent.ACTION_SEND).setType("image/jpeg").putExtra(Intent.EXTRA_STREAM, a)))
        assertEquals(listOf(a, b), archivosCompartidos(Intent(Intent.ACTION_SEND_MULTIPLE).setType("image/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(a, b))))
        assertEquals(emptyList<Uri>(), archivosCompartidos(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "hola")))
        // Un EXTRA_STREAM que no es una Uri (apps raras): nada, sin cerrarse.
        assertEquals(emptyList<Uri>(), archivosCompartidos(Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, "no soy una uri")))
    }
}
