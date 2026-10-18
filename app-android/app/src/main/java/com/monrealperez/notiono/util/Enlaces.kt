package com.monrealperez.notiono.util

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import androidx.activity.result.ActivityResultLauncher
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import com.monrealperez.notiono.ui.comun.Avisos

/** Abrir enlaces y archivos fuera de la app (navegador, reproductor, descargas). */
object Enlaces {
    /**
     * Abre otra app. Si no hay ninguna que lo atienda (un móvil sin app de correo, sin
     * cámara…) o Android no lo deja, avisa en vez de cerrar la app. Devuelve si se abrió.
     */
    fun lanza(ctx: Context, intent: Intent, siNo: String = "No hay ninguna app para abrir esto"): Boolean =
        try {
            ctx.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            Avisos.di(siNo)
            false
        } catch (e: SecurityException) {
            Avisos.di(siNo)
            false
        }

    /** Lo mismo para los lanzadores de resultado (cámara, selector de archivos). */
    fun <I> lanza(lanzador: ActivityResultLauncher<I>, entrada: I, siNo: String = "No hay ninguna app para esto"): Boolean =
        try {
            lanzador.launch(entrada)
            true
        } catch (e: ActivityNotFoundException) {
            Avisos.di(siNo)
            false
        }

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
        } catch (e: SecurityException) {
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
        // En Android 8 y 9 escribir en Descargas pide un permiso que la app no tiene, y una
        // URL que no es http(s) no la acepta el gestor: entonces, el navegador la baja.
        try {
            dm.enqueue(
                DownloadManager.Request(Uri.parse(url))
                    .setTitle(nombre)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Archivos.nombreSeguro(nombre.substringBeforeLast('.')) + nombre.substringAfterLast('.', "").let { if (it.isNotEmpty()) ".$it" else "" }),
            )
            Avisos.di("Descargando «$nombre»")
        } catch (e: RuntimeException) {
            abre(ctx, url)
        }
    }
}
