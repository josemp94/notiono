package com.monrealperez.notiono

import android.content.Context
import com.monrealperez.notiono.datos.Cache
import com.monrealperez.notiono.datos.Cola
import com.monrealperez.notiono.datos.ColaWorker
import com.monrealperez.notiono.datos.Recientes
import com.monrealperez.notiono.datos.Repo
import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.Sesion
import okhttp3.Cache as CacheHttp
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

/** Las piezas compartidas de la app (una por proceso). */
class Servicios private constructor(ctx: Context) {
    val sesion = Sesion(ctx, BuildConfig.VERSION_NAME)
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .cache(CacheHttp(File(ctx.cacheDir, "http"), 64L * 1024 * 1024))
        .build()
    val api = Api(BuildConfig.BASE_URL, http, sesion)
    val cache = Cache(ctx.filesDir)
    val cola = Cola(ctx.filesDir)
    val repo = Repo(api, cache, cola) { ColaWorker.programa(ctx) }
    val recientes = Recientes(ctx)

    /** Para lo que tiene que terminar aunque se cierre la pantalla (mandar lo pendiente al salir). */
    val alcance = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main.immediate)

    /** El espacio activo: el elegido o, si no se ha elegido ninguno, el que dio el servidor. */
    fun espacioActivo(): String? =
        sesion.espacio ?: (repo.cacheada("auth.me") as? kotlinx.serialization.json.JsonObject)
            ?.get("workspace")?.let { it as? kotlinx.serialization.json.JsonObject }
            ?.get("id")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }

    companion object {
        @Volatile private var instancia: Servicios? = null

        fun de(ctx: Context): Servicios =
            instancia ?: synchronized(this) { instancia ?: Servicios(ctx.applicationContext).also { instancia = it } }
    }
}
