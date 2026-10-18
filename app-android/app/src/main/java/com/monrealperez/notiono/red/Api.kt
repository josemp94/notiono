package com.monrealperez.notiono.red

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException

/** Lo que puede salir mal al hablar con el servidor, ya clasificado para la interfaz. */
class ErrorApi(val tipo: Tipo, mensaje: String, val estado: Int = 0) : Exception(mensaje) {
    enum class Tipo { SinConexion, NoAutorizado, NoEncontrado, Prohibido, Peticion, Servidor }

    val sinConexion get() = tipo == Tipo.SinConexion
}

val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    encodeDefaults = true
}

/**
 * Cliente tRPC mínimo: habla con los MISMOS procedimientos que la web.
 *
 * - Consultas por GET (`/api/trpc/<ruta>?input=`), mutaciones por POST.
 * - Envoltorio de superjson: la entrada va como `{"json": …}` y la respuesta llega en
 *   `result.data.json`. Las fechas llegan como cadenas ISO (superjson las marca en
 *   `meta`, que aquí no hace falta).
 * - La sesión viaja como la cookie de la web (`notiono_session`) y el espacio activo
 *   como `notiono_ws`: así el contexto de tRPC del servidor no distingue la app.
 */
class Api(val base: String, val http: OkHttpClient, private val sesion: Sesion) {

    private fun cookies(): String? {
        val token = sesion.token ?: return null
        val ws = sesion.espacio
        return if (ws != null) "notiono_session=$token; notiono_ws=$ws" else "notiono_session=$token"
    }

    private fun Request.Builder.conSesion(): Request.Builder {
        cookies()?.let { header("Cookie", it) }
        header("User-Agent", "NotionoAndroid/${sesion.version}")
        return this
    }

    suspend fun query(ruta: String, input: JsonElement? = null): JsonElement {
        val url = "$base/api/trpc/$ruta".toHttpUrl().newBuilder().apply {
            if (input != null && input != JsonNull) {
                addQueryParameter("input", json.encodeToString(JsonElement.serializer(), envoltorio(input)))
            }
        }.build()
        // Las consultas se pueden cortar a medias (un widget al que se le acaba el tiempo);
        // las mutaciones no: que se corte la pantalla no puede dejar un cambio a medio mandar.
        return ejecuta(Request.Builder().url(url).get().conSesion().build(), interrumpible = true)
    }

    suspend fun mutation(ruta: String, input: JsonElement? = null): JsonElement {
        val cuerpo = json.encodeToString(JsonElement.serializer(), envoltorio(input ?: JsonNull))
        val req = Request.Builder().url("$base/api/trpc/$ruta")
            .post(cuerpo.toRequestBody(JSON))
            .conSesion()
            .build()
        return ejecuta(req)
    }

    private fun envoltorio(input: JsonElement) = buildJsonObject { put("json", input) }

    private suspend fun ejecuta(req: Request, interrumpible: Boolean = false): JsonElement {
        // La respuesta también se lee de la red: un corte o un tiempo agotado a mitad del
        // cuerpo es «sin conexión», no una excepción suelta.
        val llamada = { llama(req) { leeTrpc(it) } }
        return if (interrumpible) runInterruptible(Dispatchers.IO) { llamada() } else withContext(Dispatchers.IO) { llamada() }
    }

    /**
     * Hace la petición y lee la respuesta con `lee`, todo dentro del `try`: un corte a mitad
     * del cuerpo es «sin conexión» y un JSON que no se entiende (la página del proxy con un
     * 200, un campo que falta) es un error del servidor. Nunca sale otra excepción: quien
     * llama solo tiene que capturar [ErrorApi].
     */
    private fun <T> llama(req: Request, lee: (Response) -> T): T =
        try {
            http.newCall(req).execute().use(lee)
        } catch (e: IOException) {
            throw ErrorApi(ErrorApi.Tipo.SinConexion, "Sin conexión con Notiono")
        } catch (e: IllegalArgumentException) {
            // SerializationException es una IllegalArgumentException.
            throw ErrorApi(ErrorApi.Tipo.Servidor, "Respuesta inesperada del servidor")
        }

    /** POST de JSON a una ruta propia de la web (no tRPC) con la sesión: /api/app/registro. */
    suspend fun postJson(ruta: String, cuerpo: JsonElement): Unit = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(absoluta(ruta)).post(cuerpo.toString().toRequestBody(JSON)).conSesion().build()
        llama(req) { if (!it.isSuccessful) throw errorHttp(it.code, "Error del servidor (${it.code})") }
    }

    /** Sube un archivo a `/api/upload` (portadas, adjuntos, imágenes del editor). */
    suspend fun subir(bytes: ByteArray, nombre: String, mime: String, soloImagen: Boolean = false): Subida =
        withContext(Dispatchers.IO) {
            val cuerpo = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", nombre, bytes.toRequestBody(mime.toMediaType()))
                .build()
            val url = "$base/api/upload" + if (soloImagen) "?kind=image" else ""
            val req = Request.Builder().url(url).post(cuerpo).conSesion().build()
            llama(req) {
                val texto = it.body.string()
                if (!it.isSuccessful) throw errorHttp(it.code, mensajeDe(texto) ?: "No se pudo subir el archivo")
                json.decodeFromString(Subida.serializer(), texto)
            }
        }

    /** Canjea el código que devuelve el SSO por una sesión (ver /api/app/sesion). */
    suspend fun canjear(code: String, verifier: String): Canje = withContext(Dispatchers.IO) {
        val cuerpo = buildJsonObject {
            put("code", code)
            put("verifier", verifier)
        }.toString()
        val req = Request.Builder().url("$base/api/app/sesion").post(cuerpo.toRequestBody(JSON)).build()
        llama(req) {
            val texto = it.body.string()
            if (!it.isSuccessful) throw errorHttp(it.code, mensajeDe(texto) ?: "No se pudo iniciar sesión")
            json.decodeFromString(Canje.serializer(), texto)
        }
    }

    /** Versión del APK que hay desplegado (para ofrecer actualizar). */
    suspend fun versionPublicada(): VersionApk = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$base/api/app/version").get().build()
        llama(req) {
            if (!it.isSuccessful) throw errorHttp(it.code, "No se pudo consultar la versión")
            json.decodeFromString(VersionApk.serializer(), it.body.string())
        }
    }

    /** GET a una ruta propia de la web (no tRPC) con la sesión: /api/geo… */
    suspend fun getJson(ruta: String): JsonElement = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(absoluta(ruta)).get().conSesion().build()
        llama(req) {
            val texto = it.body.string()
            if (!it.isSuccessful) throw errorHttp(it.code, mensajeDe(texto) ?: "Error del servidor (${it.code})")
            // parseToJsonElement acepta texto suelto sin comillas (la página HTML del proxy): eso no es una respuesta.
            json.parseToJsonElement(texto).takeIf { e -> e is JsonObject || e is kotlinx.serialization.json.JsonArray }
                ?: throw ErrorApi(ErrorApi.Tipo.Servidor, "Respuesta inesperada del servidor")
        }
    }

    /** URL absoluta para lo que el servidor da como ruta («/api/asset/…»). */
    fun absoluta(ruta: String): String =
        if (ruta.startsWith("http://") || ruta.startsWith("https://")) ruta else base + (if (ruta.startsWith("/")) ruta else "/$ruta")

    companion object {
        val JSON = "application/json".toMediaType()

        /** Lee una respuesta tRPC: el dato o un [ErrorApi] tipado. */
        fun leeTrpc(res: Response): JsonElement {
            val texto = res.body.string()
            val raiz = runCatching { json.parseToJsonElement(texto).jsonObject }.getOrNull()
                ?: throw errorHttp(res.code, "Respuesta inesperada del servidor (${res.code})")
            val error = raiz["error"]
            if (error != null) {
                val e = (error as? JsonObject)?.get("json") as? JsonObject ?: (error as? JsonObject)
                val datos = e?.get("data") as? JsonObject
                val codigo = datos?.str("code")
                val mensaje = e?.str("message") ?: "Error del servidor"
                throw ErrorApi(
                    when (codigo) {
                        "UNAUTHORIZED" -> ErrorApi.Tipo.NoAutorizado
                        "NOT_FOUND" -> ErrorApi.Tipo.NoEncontrado
                        "FORBIDDEN" -> ErrorApi.Tipo.Prohibido
                        "BAD_REQUEST", "PARSE_ERROR", "CONFLICT", "PAYLOAD_TOO_LARGE" -> ErrorApi.Tipo.Peticion
                        else -> if (res.code == 401) ErrorApi.Tipo.NoAutorizado else ErrorApi.Tipo.Servidor
                    },
                    mensaje,
                    res.code,
                )
            }
            if (!res.isSuccessful) throw errorHttp(res.code, "Error del servidor (${res.code})")
            val resultado = (raiz["result"] as? JsonObject)?.get("data")
            // Con superjson el dato va en `json`; sin él, tal cual.
            return ((resultado as? JsonObject)?.get("json")) ?: resultado ?: JsonNull
        }

        fun errorHttp(codigo: Int, mensaje: String) = ErrorApi(
            when (codigo) {
                401 -> ErrorApi.Tipo.NoAutorizado
                403 -> ErrorApi.Tipo.Prohibido
                404 -> ErrorApi.Tipo.NoEncontrado
                in 400..499 -> ErrorApi.Tipo.Peticion
                else -> ErrorApi.Tipo.Servidor
            },
            mensaje,
            codigo,
        )

        private fun mensajeDe(texto: String): String? =
            runCatching { json.parseToJsonElement(texto).jsonObject.str("error") }.getOrNull()
    }
}

@kotlinx.serialization.Serializable
data class Subida(val id: String, val url: String, val name: String? = null, val mime: String? = null)

@kotlinx.serialization.Serializable
data class Canje(val token: String, val maxAge: Long = 0, val user: UsuarioCanje)

@kotlinx.serialization.Serializable
data class UsuarioCanje(val id: String, val name: String? = null, val email: String)

@kotlinx.serialization.Serializable
data class VersionApk(val version: String, val versionCode: Int, val bytes: Long = 0, val fecha: String? = null, val url: String)
