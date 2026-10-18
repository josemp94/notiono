package com.monrealperez.notiono.util

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import com.monrealperez.notiono.ui.comun.Avisos

/** Abrir enlaces y archivos fuera de la app (navegador, reproductor, descargas). */
object Enlaces {
    fun abre(ctx: Context, url: String) {
        val uri = Uri.parse(url)
        try {
            if (uri.scheme == "http" || uri.scheme == "https") {
                CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(CustomTabColorSchemeParams.Builder().setToolbarColor(0xFFFF5C28.toInt()).build())
                    .build().launchUrl(ctx, uri)
            } else ctx.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Avisos.di("No hay ninguna app para abrir este enlace")
        }
    }

    /** Vídeo y audio con el reproductor del sistema; el resto, con la app que toque. */
    fun abreArchivo(ctx: Context, url: String, tipo: String) {
        val mime = when (tipo) { "video" -> "video/*"; "audio" -> "audio/*"; else -> null }
        try {
            val i = Intent(Intent.ACTION_VIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (mime != null) i.setDataAndType(Uri.parse(url), mime) else i.data = Uri.parse(url)
            ctx.startActivity(i)
        } catch (e: ActivityNotFoundException) {
            abre(ctx, url)
        }
    }

    /** Descarga con el gestor de descargas de Android (con su aviso y su carpeta). */
    fun descarga(ctx: Context, url: String, nombre: String) {
        val dm = ctx.getSystemService(DownloadManager::class.java) ?: return abre(ctx, url)
        dm.enqueue(
            DownloadManager.Request(Uri.parse(url))
                .setTitle(nombre)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Archivos.nombreSeguro(nombre.substringBeforeLast('.')) + nombre.substringAfterLast('.', "").let { if (it.isNotEmpty()) ".$it" else "" }),
        )
        Avisos.di("Descargando «$nombre»")
    }
}
