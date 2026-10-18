package com.monrealperez.notiono.red

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import java.security.MessageDigest
import java.security.SecureRandom
import android.util.Base64

/**
 * Inicio de sesión como cualquier app nativa (RFC 8252): el SSO de Synology se abre
 * en una Custom Tab del sistema; al terminar, el servidor vuelve a la app con
 * `notiono://auth?code=…` y la app canjea el código con su verificador PKCE.
 */
object Acceso {
    fun nuevoVerificador(): String {
        val b = ByteArray(32)
        SecureRandom().nextBytes(b)
        return b64(b)
    }

    fun challenge(verificador: String): String =
        b64(MessageDigest.getInstance("SHA-256").digest(verificador.toByteArray(Charsets.US_ASCII)))

    private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    fun urlInicio(base: String, verificador: String): Uri =
        Uri.parse("$base/api/auth/oidc/start").buildUpon()
            .appendQueryParameter("app", "1")
            .appendQueryParameter("challenge", challenge(verificador))
            .build()

    fun abrir(ctx: Context, base: String, sesion: Sesion) {
        val v = nuevoVerificador()
        sesion.verificadorPendiente = v
        val color = CustomTabColorSchemeParams.Builder().setToolbarColor(0xFFFF5C28.toInt()).build()
        CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(color)
            .setShowTitle(true)
            .build()
            .launchUrl(ctx, urlInicio(base, v))
    }

    /** ¿Es la vuelta del SSO? Devuelve el código. */
    fun codigoDe(uri: Uri?): String? =
        uri?.takeIf { it.scheme == "notiono" && it.host == "auth" }?.getQueryParameter("code")
}
