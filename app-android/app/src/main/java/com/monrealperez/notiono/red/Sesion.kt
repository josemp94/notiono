package com.monrealperez.notiono.red

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import androidx.core.content.edit

/**
 * La sesión de la app: el token (una fila `Session` del servidor, la misma que usa la
 * web) y el espacio activo. Vive en las preferencias privadas de la app.
 */
class Sesion(ctx: Context, val version: String) {
    private val prefs: SharedPreferences = ctx.getSharedPreferences("sesion", Context.MODE_PRIVATE)

    private val _conectada = MutableStateFlow(prefs.getString("token", null) != null)
    val conectada: StateFlow<Boolean> = _conectada

    val token: String? get() = prefs.getString("token", null)
    var espacio: String?
        get() = prefs.getString("espacio", null)
        set(v) = prefs.edit { putString("espacio", v) }
    val nombre: String? get() = prefs.getString("nombre", null)
    val email: String? get() = prefs.getString("email", null)
    val usuarioId: String? get() = prefs.getString("usuario", null)

    fun guarda(canje: Canje) {
        prefs.edit {
            putString("token", canje.token)
            putString("usuario", canje.user.id)
            putString("nombre", canje.user.name)
            putString("email", canje.user.email)
        }
        _conectada.value = true
    }

    fun olvida() {
        prefs.edit { clear() }
        _conectada.value = false
    }

    /** Lo que hace falta mientras se vuelve del SSO (si Android mata la app entre medias, sigue aquí). */
    var verificadorPendiente: String?
        get() = prefs.getString("verificador", null)
        set(v) = prefs.edit { putString("verificador", v) }
}
