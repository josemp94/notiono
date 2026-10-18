package com.monrealperez.notiono

import android.net.Uri
import com.monrealperez.notiono.red.Acceso
import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.Sesion
import okhttp3.OkHttpClient
import okhttp3.Request

/** Un Notiono de verdad en local para las pruebas que lo necesitan (scripts/integracion-android.ts, scripts/capturas-android.ts). */
object NotionoLocal {
    val base: String = System.getProperty("notiono.integracion").orEmpty()

    /** Entra como la app: SSO (falso) en la «Custom Tab» + canje del código con PKCE. */
    suspend fun entra(api: Api, sesion: Sesion, http: OkHttpClient) {
        val verificador = Acceso.nuevoVerificador()
        val vuelta = Uri.parse(recorreSso(http.newBuilder().followRedirects(false).build(), Acceso.urlInicio(base, verificador).toString()))
        sesion.guarda(api.canjear(Acceso.codigoDe(vuelta)!!, verificador))
    }

    /** La Custom Tab: recorre las redirecciones del SSO hasta `notiono://auth?code=…`. */
    private fun recorreSso(http: OkHttpClient, inicio: String): String {
        var url = inicio
        val cookies = mutableListOf<String>()
        repeat(5) {
            http.newCall(Request.Builder().url(url).header("Cookie", cookies.joinToString("; ")).build()).execute().use { r ->
                cookies += r.headers("Set-Cookie").map { it.substringBefore(';') }
                val destino = r.header("Location") ?: error("el SSO no redirige (${r.code})")
                if (destino.startsWith("notiono://")) return destino
                url = destino
            }
        }
        error("demasiadas redirecciones")
    }
}
