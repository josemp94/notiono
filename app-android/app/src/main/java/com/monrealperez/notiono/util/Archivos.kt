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

    fun comparte(ctx: Context, nombre: String, texto: String, mime: String) = comparte(ctx, nombre, texto.toByteArray(), mime)

    fun comparte(ctx: Context, nombre: String, bytes: ByteArray, mime: String) {
        val dir = File(ctx.cacheDir, "export").apply { mkdirs() }
        val f = File(dir, nombre)
        f.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.ficheros", f)
        val envio = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        Enlaces.lanza(ctx, Intent.createChooser(envio, "Exportar $nombre").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    suspend fun exportaMarkdown(ctx: Context, pageId: String, recordId: String? = null) {
        try {
            val input = if (recordId != null) objeto("id" to pageId, "recordId" to recordId) else objeto("id" to pageId)
            val r = Servicios.de(ctx).repo.consulta("app.exportarMarkdown", input, cachear = false).comoObjeto
            comparte(ctx, nombreSeguro(r.str("titulo").orEmpty()) + ".md", r.str("markdown").orEmpty(), "text/markdown")
        } catch (e: ErrorApi) {
            Avisos.di(e.message ?: "No se pudo exportar")
        }
    }

    /** Word (.docx): lo genera el servidor (el mismo que la web); de una fila, con sus propiedades arriba. */
    suspend fun exportaWord(ctx: Context, pageId: String, recordId: String? = null) {
        try {
            val input = if (recordId != null) objeto("id" to pageId, "recordId" to recordId) else objeto("id" to pageId)
            val r = Servicios.de(ctx).repo.consulta("app.exportarWord", input, cachear = false).comoObjeto
            val bytes = android.util.Base64.decode(r.str("base64").orEmpty(), android.util.Base64.DEFAULT)
            comparte(ctx, nombreSeguro(r.str("nombre").orEmpty().removeSuffix(".docx")) + ".docx", bytes, MIME_WORD)
        } catch (e: ErrorApi) {
            Avisos.di(if (e.sinConexion) "Sin conexión: el Word lo genera el servidor" else e.message ?: "No se pudo exportar")
        }
    }

    /** HTML: el mismo documento que descarga la web (`app.exportarHtml`); de una fila, su cuerpo. */
    suspend fun exportaHtml(ctx: Context, pageId: String, recordId: String? = null) {
        try {
            val r = html(ctx, pageId, recordId, pdf = false)
            comparte(ctx, nombreSeguro(r.first.removeSuffix(".html")) + ".html", r.second, "text/html")
        } catch (e: ErrorApi) {
            Avisos.di(if (e.sinConexion) "Sin conexión: el HTML lo genera el servidor" else e.message ?: "No se pudo exportar")
        }
    }

    private suspend fun html(ctx: Context, pageId: String, recordId: String?, pdf: Boolean): Pair<String, String> {
        val input = buildMap {
            put("id", kotlinx.serialization.json.JsonPrimitive(pageId))
            recordId?.let { put("recordId", kotlinx.serialization.json.JsonPrimitive(it)) }
            if (pdf) put("pdf", objeto("formato" to "A4", "escala" to 100))
        }
        val r = Servicios.de(ctx).repo.consulta("app.exportarHtml", kotlinx.serialization.json.JsonObject(input), cachear = false).comoObjeto
        return r.str("nombre").orEmpty() to r.str("html").orEmpty()
    }

    /** El WebView que se imprime vive hasta que acaba la impresión (si no, el sistema lo pierde). */
    private var imprimiendo: android.webkit.WebView? = null

    /**
     * PDF: ese HTML impreso con el servicio de impresión de Android, que ofrece «Guardar
     * como PDF» (como el PDF de la web, que es imprimir). Las imágenes llevan la cookie de la sesión.
     */
    suspend fun exportaPdf(ctx: Context, pageId: String, recordId: String? = null) {
        val (nombre, documento) = try {
            html(ctx, pageId, recordId, pdf = true)
        } catch (e: ErrorApi) {
            Avisos.di(if (e.sinConexion) "Sin conexión: el PDF lo genera el servidor" else e.message ?: "No se pudo exportar")
            return
        }
        val s = Servicios.de(ctx)
        android.webkit.CookieManager.getInstance().apply {
            setAcceptCookie(true)
            s.sesion.token?.let { setCookie(s.api.base, "notiono_session=$it; path=/") }
            s.sesion.espacio?.let { setCookie(s.api.base, "notiono_ws=$it; path=/") }
        }
        val titulo = nombre.removeSuffix(".html").ifBlank { "Notiono" }
        val w = android.webkit.WebView(ctx)
        imprimiendo = w
        w.webViewClient = object : android.webkit.WebViewClient() {
            override fun onPageFinished(view: android.webkit.WebView, url: String?) {
                val pm = ctx.getSystemService(android.print.PrintManager::class.java) ?: return
                pm.print(titulo, view.createPrintDocumentAdapter(titulo), android.print.PrintAttributes.Builder().setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4).build())
            }
        }
        w.loadDataWithBaseURL(s.api.base + "/", documento, "text/html", "utf-8", null)
    }

    const val MIME_WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

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
