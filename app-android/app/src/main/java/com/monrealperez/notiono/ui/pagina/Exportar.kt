package com.monrealperez.notiono.ui.pagina

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.Hoja
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Archivos
import kotlinx.coroutines.launch

/**
 * «Exportar», como el de Notion y la web: «Formato de exportación» (PDF, HTML, Markdown y
 * CSV) y Word (.docx), que Notion no tiene, como un formato más. De una base de datos,
 * su CSV. El archivo se ofrece con el menú de compartir; el PDF, con el de imprimir.
 */
@Composable
fun HojaExportar(pageId: String, recordId: String?, esBd: Boolean, onCerrar: () -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val formatos = if (esBd) listOf("markdown" to "Markdown y CSV")
    else listOf("pdf" to "PDF", "html" to "HTML", "markdown" to "Markdown y CSV", "word" to "Word (.docx)")
    var formato by remember { mutableStateOf(formatos.first().first) }
    Hoja(onCerrar, "Exportar") {
        Text("Formato de exportación", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(start = 16.dp, top = 4.dp, bottom = 2.dp))
        for ((f, nombre) in formatos) {
            FilaMenu(nombre, "file-down", derecha = { if (formato == f) Icono("check", color = Marca) }) { formato = f }
        }
        if (formato == "pdf") Text("Se abre el menú de imprimir: elige «Guardar como PDF».", fontSize = 12.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), horizontalArrangement = Arrangement.End) {
            Button(
                {
                    onCerrar()
                    s.alcance.launch {
                        when {
                            esBd -> Archivos.exportaCsv(ctx, pageId)
                            formato == "pdf" -> Archivos.exportaPdf(ctx, pageId, recordId)
                            formato == "html" -> Archivos.exportaHtml(ctx, pageId, recordId)
                            formato == "word" -> Archivos.exportaWord(ctx, pageId, recordId)
                            else -> Archivos.exportaMarkdown(ctx, pageId, recordId)
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Marca),
            ) { Text("Exportar", color = androidx.compose.ui.graphics.Color.White) }
        }
    }
}
