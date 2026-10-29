package com.monrealperez.notiono.copia

import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.int
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.obj
import com.monrealperez.notiono.red.str
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/** Lo que salió mal en la copia, ya en cristiano. `codigo`: el de DSM (o uno propio, negativo). */
class ErrorCopia(val codigo: Int, mensaje: String) : Exception(mensaje) {
    /** DSM pide (otra vez) el código de verificación en dos pasos. */
    val pideCodigo get() = codigo == 403 || codigo == 404
}

/**
 * El NAS por la API web de Synology DSM (`<servidor>/webapi/entry.cgi`), como File Station:
 * entrar (con verificación en dos pasos y token de dispositivo), subir, borrar un archivo y
 * salir. Nada de montar carpetas por SMB: Synology Drive no indexaría lo escrito así.
 */
class Dsm(servidor: String, private val http: OkHttpClient) {
    private val entrada = normaliza(servidor) + "/webapi/entry.cgi"

    data class Entrada(val sid: String, val did: String?)

    /**
     * Entra con `session=FileStation`. Con `did` (el token que dio el NAS tras el código) no
     * vuelve a pedir el código; con `codigo` lo manda y el NAS devuelve un `did` nuevo.
     * Por POST: la contraseña nunca va en la URL.
     */
    suspend fun entra(usuario: String, pass: String, did: String?, codigo: String?): Entrada {
        val form = FormBody.Builder()
            .add("api", "SYNO.API.Auth").add("version", "3").add("method", "login")
            .add("account", usuario).add("passwd", pass)
            .add("session", "FileStation").add("format", "sid")
            .add("enable_device_token", "yes").add("device_name", DISPOSITIVO)
        did?.let { form.add("device_id", it) }
        codigo?.let { form.add("otp_code", it) }
        val d = pide(Request.Builder().url(entrada).post(form.build()).build(), ::errorEntrar)
        val sid = d?.str("sid") ?: throw ErrorCopia(NO_ES_DSM, NO_ES_DSM_TEXTO)
        return Entrada(sid, d.str("did") ?: did)
    }

    /** Sube (o sobrescribe) `nombre` en `carpeta`, creando las carpetas que falten. El archivo, al final: DSM lo exige. */
    suspend fun sube(sid: String, carpeta: String, nombre: String, bytes: ByteArray) {
        val url = entrada.toHttpUrl().newBuilder()
            .addQueryParameter("api", "SYNO.FileStation.Upload").addQueryParameter("version", "2")
            .addQueryParameter("method", "upload").addQueryParameter("_sid", sid).build()
        val cuerpo = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("path", carpeta)
            .addFormDataPart("create_parents", "true")
            .addFormDataPart("overwrite", "true")
            .addFormDataPart("file", nombre, bytes.toRequestBody(MIME_WORD))
            .build()
        pide(Request.Builder().url(url).post(cuerpo).build(), ::errorArchivo)
    }

    /** Borra UN archivo (nunca recursivo). false si ya no estaba. */
    suspend fun borra(sid: String, ruta: String): Boolean = try {
        val form = FormBody.Builder()
            .add("api", "SYNO.FileStation.Delete").add("version", "2").add("method", "delete")
            .add("path", JsonArray(listOf(JsonPrimitive(ruta))).toString())
            .add("recursive", "false").add("_sid", sid)
        pide(Request.Builder().url(entrada).post(form.build()).build(), ::errorArchivo)
        true
    } catch (e: ErrorCopia) {
        if (e.codigo == 408) false else throw e
    }

    suspend fun sale(sid: String) {
        val form = FormBody.Builder()
            .add("api", "SYNO.API.Auth").add("version", "3").add("method", "logout")
            .add("session", "FileStation").add("_sid", sid)
        pide(Request.Builder().url(entrada).post(form.build()).build(), ::errorArchivo)
    }

    /** La respuesta de DSM: `{"success":true,"data":…}` o `{"success":false,"error":{"code":N}}`. */
    private suspend fun pide(req: Request, error: (Int) -> String): JsonObject? = withContext(Dispatchers.IO) {
        val texto = try {
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) throw ErrorCopia(NO_ES_DSM, if (r.code >= 500) "El NAS no responde bien (error ${r.code}); se reintentará" else NO_ES_DSM_TEXTO)
                r.body.string()
            }
        } catch (e: IOException) {
            throw ErrorCopia(SIN_RED, deRed(e))
        }
        val raiz = runCatching { json.parseToJsonElement(texto) as? JsonObject }.getOrNull() ?: throw ErrorCopia(NO_ES_DSM, NO_ES_DSM_TEXTO)
        if (raiz.bool("success")) return@withContext raiz.obj("data")
        val codigo = raiz.obj("error")?.int("code") ?: 0
        throw ErrorCopia(codigo, error(codigo))
    }

    companion object {
        const val DISPOSITIVO = "Notiono Android"
        const val SIN_RED = -1
        const val NO_ES_DSM = -2
        private const val NO_ES_DSM_TEXTO = "Esa dirección no parece la de un Synology: revisa el servidor"
        private val MIME_WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document".toMediaType()

        /** «monrealperez.com/drive/» → «https://monrealperez.com/drive». */
        fun normaliza(servidor: String): String {
            val s = servidor.trim().trimEnd('/')
            return if (s.startsWith("http://") || s.startsWith("https://")) s else "https://$s"
        }

        fun deRed(e: IOException): String = when (e) {
            is SSLException -> "El certificado del NAS no es válido: revisa que la dirección sea la de su certificado"
            is SocketTimeoutException -> "El NAS no responde: ¿está apagado o la dirección es otra?"
            is UnknownHostException -> "No se encuentra el NAS: sin conexión o la dirección está mal escrita"
            is java.net.ConnectException -> "No se pudo conectar con el NAS: revisa la dirección"
            else -> "Sin conexión con el NAS"
        }

        fun errorEntrar(codigo: Int): String = when (codigo) {
            400 -> "Usuario o contraseña del NAS incorrectos"
            401 -> "La cuenta del NAS está desactivada"
            402 -> "Esa cuenta del NAS no tiene permiso para usar File Station"
            403 -> "El NAS pide el código de verificación en dos pasos"
            404 -> "El código de verificación no es correcto"
            406 -> "El NAS exige activar la verificación en dos pasos en esa cuenta: hazlo en DSM"
            407 -> "El NAS ha bloqueado esta conexión por demasiados intentos fallidos"
            408, 409, 410 -> "La contraseña del NAS ha caducado: cámbiala en DSM"
            else -> errorArchivo(codigo)
        }

        fun errorArchivo(codigo: Int): String = when (codigo) {
            105, 106, 107, 119 -> "La sesión del NAS se cerró a mitad; se reintentará"
            402, 421 -> "El NAS está ocupado; se reintentará"
            407 -> "El NAS no deja escribir ahí: revisa los permisos de la carpeta"
            408 -> "No existe esa carpeta en el NAS (la carpeta compartida, p. ej. /home, tiene que existir)"
            411 -> "Esa carpeta del NAS es de solo lectura"
            415, 416 -> "No queda espacio en el NAS (o se ha llegado a la cuota)"
            412, 413, 418, 419, 420 -> "El NAS no acepta el nombre de un archivo o carpeta"
            else -> "El NAS no aceptó la operación (error $codigo)"
        }
    }
}
