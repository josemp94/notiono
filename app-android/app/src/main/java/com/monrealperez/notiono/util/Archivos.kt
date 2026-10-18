package com.monrealperez.notiono.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Avisos
import java.io.File
import java.text.Normalizer

/** Exportar: el archivo se genera y se ofrece con el menú de compartir (Guardar en Archivos, Drive, WhatsApp…). */
object Archivos {
    /** Nombre de archivo sin acentos, espacios ni símbolos (los envíos por WhatsApp se rompen con ellos). */
    fun nombreSeguro(s: String): String {
        val sinTildes = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        return sinTildes.replace(Regex("[^A-Za-z0-9._-]+"), "_").trim('_').take(80).ifBlank { "Sin_titulo" }
    }

    fun comparte(ctx: Context, nombre: String, texto: String, mime: String) {
        val dir = File(ctx.cacheDir, "export").apply { mkdirs() }
        val f = File(dir, nombre)
        f.writeText(texto)
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.ficheros", f)
        val envio = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        Enlaces.lanza(ctx, Intent.createChooser(envio, "Exportar $nombre").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    suspend fun exportaMarkdown(ctx: Context, pageId: String) {
        try {
            val r = Servicios.de(ctx).repo.consulta("app.exportarMarkdown", objeto("id" to pageId), cachear = false).comoObjeto
            comparte(ctx, nombreSeguro(r.str("titulo").orEmpty()) + ".md", r.str("markdown").orEmpty(), "text/markdown")
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo exportar")
        }
    }

    suspend fun exportaCsv(ctx: Context, pageId: String) {
        try {
            val s = Servicios.de(ctx)
            val v = s.repo.consulta("app.vista", objeto("pageId" to pageId), cachear = false).comoObjeto
            val colId = v["collection"]?.comoObjeto?.str("id") ?: return
            val r = s.repo.consulta("db.exportCsv", objeto("collectionId" to colId), cachear = false).comoObjeto
            comparte(ctx, nombreSeguro(r.str("name").orEmpty()) + ".csv", r.str("csv").orEmpty(), "text/csv")
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo exportar")
        }
    }
}
