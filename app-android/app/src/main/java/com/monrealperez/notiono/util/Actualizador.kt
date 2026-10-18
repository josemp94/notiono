package com.monrealperez.notiono.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.edit
import com.monrealperez.notiono.BuildConfig
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.VersionApk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.File

/**
 * Actualizaciones de la app. Al no ser ya una TWA, desplegar la web no actualiza el
 * móvil: la app pregunta a `/api/app/version` (al abrir, como mucho una vez al día, y
 * desde Ajustes) y, si hay una versión más nueva, baja `/notiono.apk` y lo instala.
 */
object Actualizador {
    private const val DIA = 24 * 3600 * 1000L

    /** La versión publicada si es más nueva que esta; null si no hay o no se puede saber. */
    suspend fun nueva(ctx: Context, forzar: Boolean = false): VersionApk? {
        val prefs = ctx.getSharedPreferences("actualizar", Context.MODE_PRIVATE)
        if (!forzar && System.currentTimeMillis() - prefs.getLong("ultima", 0) < DIA) return null
        val v = runCatching { Servicios.de(ctx).api.versionPublicada() }.getOrNull() ?: return null
        prefs.edit { putLong("ultima", System.currentTimeMillis()) }
        return v.takeIf { it.versionCode > BuildConfig.VERSION_CODE }
    }

    /** Baja el APK (con progreso 0–1) y devuelve el fichero. */
    suspend fun baja(ctx: Context, v: VersionApk, progreso: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val s = Servicios.de(ctx)
        val dir = File(ctx.getExternalFilesDir(null), "Download").apply { mkdirs() }
        val destino = File(dir, "notiono-${v.version}.apk")
        val req = Request.Builder().url(s.api.absoluta(v.url)).build()
        s.http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) error("No se pudo bajar la actualización (${res.code})")
            val total = res.body.contentLength().takeIf { it > 0 } ?: v.bytes
            res.body.byteStream().use { ent ->
                destino.outputStream().use { sal ->
                    val buf = ByteArray(64 * 1024)
                    var leidos = 0L
                    while (true) {
                        val n = ent.read(buf)
                        if (n < 0) break
                        sal.write(buf, 0, n)
                        leidos += n
                        if (total > 0) progreso((leidos.toFloat() / total).coerceIn(0f, 1f))
                    }
                }
            }
        }
        destino
    }

    /** ¿Android deja instalar desde la app? Si no, hay que mandar a la persona a darle permiso. */
    fun puedeInstalar(ctx: Context) = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ctx.packageManager.canRequestPackageInstalls()

    fun pidePermiso(ctx: Context) {
        ctx.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    fun instala(ctx: Context, apk: File) {
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.ficheros", apk)
        ctx.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
