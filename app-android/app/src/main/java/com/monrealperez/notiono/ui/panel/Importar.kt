package com.monrealperez.notiono.ui.panel

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.jsonDe
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.util.Csv

/** Importar un .md (página) o un .csv (base de datos), como el botón «Importar» de la web. */
object Importar {
    fun nombreDe(ctx: Context, uri: Uri): String =
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        } ?: uri.lastPathSegment ?: "archivo"

    /** Devuelve el id de la página creada (o null si falló, con el aviso ya dado). */
    suspend fun archivo(ctx: Context, uri: Uri, padre: String?): String? {
        val s = Servicios.de(ctx)
        val nombre = nombreDe(ctx, uri)
        val titulo = nombre.substringBeforeLast('.')
        val texto = runCatching { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } }.getOrNull()
        if (texto == null) {
            Avisos.di("No se pudo leer el archivo")
            return null
        }
        return try {
            Avisos.di("Importando «$nombre»…")
            val id = if (nombre.endsWith(".csv", ignoreCase = true)) {
                val filas = Csv.lee(texto)
                if (filas.isEmpty()) {
                    Avisos.di("El CSV está vacío.")
                    return null
                }
                // La detección de tipos de columna la hace el servidor (db.importCsv), como en la web.
                s.repo.mutacion(
                    "db.importCsv",
                    objeto("parentId" to padre, "name" to titulo.ifBlank { "Base de datos" }, "headers" to filas[0], "rows" to filas.drop(1)),
                    encolable = false, etiquetas = listOf("arbol"),
                )?.comoObjeto?.str("id")
            } else {
                // El mismo conversor de Markdown que la web (en el servidor).
                val bloques = s.repo.mutacion("app.markdownABloques", objeto("markdown" to texto), encolable = false)
                val pagina = s.repo.mutacion("pages.create", objeto("parentId" to padre, "title" to titulo), encolable = false)
                    ?.comoObjeto?.str("id") ?: return null
                s.repo.mutacion("pages.updateContent", objeto("id" to pagina, "content" to jsonDe(bloques)), encolable = false, etiquetas = listOf("arbol"))
                pagina
            }
            Avisos.di("Importado")
            id
        } catch (e: ErrorApi) {
            Avisos.di("No se pudo importar: ${e.message}")
            null
        }
    }

    /** Vuelca un CSV como filas de una BD que ya existe (el «Merge with CSV» de la web). */
    suspend fun csvEnBd(ctx: Context, uri: Uri, pageId: String) {
        val s = Servicios.de(ctx)
        val texto = runCatching { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } }.getOrNull()
        val filas = texto?.let { Csv.lee(it) }
        if (filas.isNullOrEmpty()) {
            Avisos.di("El CSV está vacío o no se pudo leer")
            return
        }
        try {
            val v = s.repo.consulta("app.vista", objeto("pageId" to pageId), cachear = false).comoObjeto
            val colId = (v["collection"] as? kotlinx.serialization.json.JsonObject)?.str("id") ?: return
            s.repo.mutacion("db.importCsvInto", objeto("collectionId" to colId, "headers" to filas[0], "rows" to filas.drop(1)),
                encolable = false, etiquetas = listOf("vista:$pageId"))
            Avisos.di("Importadas ${filas.size - 1} filas")
        } catch (e: ErrorApi) {
            Avisos.di("No se pudo importar: ${e.message}")
        }
    }
}
