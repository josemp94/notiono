package com.monrealperez.notiono.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream

/** Leer lo que el usuario elige (galería, cámara, archivos) para subirlo a /api/upload. */
object Imagenes {
    private const val MAX = 8 * 1024 * 1024 // el límite de /api/upload

    fun nombre(ctx: Context, uri: Uri): String =
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        } ?: uri.lastPathSegment?.substringAfterLast('/') ?: "archivo"

    /** Un archivo cualquiera tal cual: (bytes, nombre, tipo). */
    fun leeArchivo(ctx: Context, uri: Uri): Triple<ByteArray, String, String> {
        val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("No se pudo leer el archivo")
        if (bytes.size > MAX) error("El archivo no puede superar los 8 MB.")
        return Triple(bytes, nombre(ctx, uri), ctx.contentResolver.getType(uri) ?: "application/octet-stream")
    }

    /**
     * Una imagen, reducida si hace falta para no subir fotos de 12 MP (y caber en 8 MB).
     * Los GIF se suben tal cual (reducirlos perdería la animación).
     */
    fun lee(ctx: Context, uri: Uri, maxLado: Int = 2400): Triple<ByteArray, String, String> {
        val tipo = ctx.contentResolver.getType(uri) ?: "image/jpeg"
        if (tipo == "image/gif") return leeArchivo(ctx, uri)
        val bmp: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(ctx.contentResolver, uri)) { dec, info, _ ->
                val lado = maxOf(info.size.width, info.size.height)
                if (lado > maxLado) {
                    val f = maxLado.toFloat() / lado
                    dec.setTargetSize((info.size.width * f).toInt().coerceAtLeast(1), (info.size.height * f).toInt().coerceAtLeast(1))
                }
                dec.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            // Android 8: primero las medidas y luego la imagen ya reducida al leerla (una foto
            // de 12 MP entera son ~48 MB y puede agotar la memoria de la app).
            val medidas = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, medidas) }
            var muestra = 1
            while (maxOf(medidas.outWidth, medidas.outHeight) / (muestra * 2) >= maxLado) muestra *= 2
            val b = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = muestra }) }
                ?: error("No se pudo leer la imagen")
            val lado = maxOf(b.width, b.height)
            if (lado > maxLado) Bitmap.createScaledBitmap(b, b.width * maxLado / lado, b.height * maxLado / lado, true) else b
        }
        val png = tipo == "image/png"
        val out = ByteArrayOutputStream()
        bmp.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, 88, out)
        val base = nombre(ctx, uri).substringBeforeLast('.')
        return Triple(out.toByteArray(), base + if (png) ".png" else ".jpg", if (png) "image/png" else "image/jpeg")
    }
}
