package com.monrealperez.notiono.ui.plantillas

import androidx.compose.foundation.border
import com.monrealperez.notiono.ui.comun.rememberAlcance
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.LocalNavegador
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.comun.BarraSuperior
import com.monrealperez.notiono.ui.comun.BotonIcono
import com.monrealperez.notiono.ui.comun.Esqueleto
import com.monrealperez.notiono.ui.comun.IconoPagina
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.comun.rememberConsulta
import kotlinx.coroutines.launch

/** La galería de plantillas de la web: cada una crea su página o base de datos. */
@Composable
fun PantallaPlantillas(padre: String? = null) {
    val s = Servicios.de(LocalContext.current)
    val n = LocalNavegador.current
    val alcance = rememberAlcance()
    val q = rememberConsulta("app.plantillas")
    var creando by remember { mutableStateOf<String?>(null) }
    val lista = q.datos?.comoLista?.map { it.comoObjeto }
    Column(Modifier.fillMaxSize()) {
        BarraSuperior("Plantillas", izquierda = { BotonIcono("arrow-left", { n.atras() }) })
        if (lista == null) Esqueleto()
        else LazyColumn(Modifier.padding(horizontal = 16.dp)) {
            items(lista, key = { it.str("key") ?: "" }) { t ->
                val key = t.str("key")!!
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(10.dp))
                        .border(1.dp, C.borde, RoundedCornerShape(10.dp))
                        .clickable(enabled = creando == null) {
                            creando = key
                            alcance.launch {
                                try {
                                    val r = s.repo.mutacion("pages.createFromTemplate", objeto("key" to key, "parentId" to padre), encolable = false, etiquetas = listOf("arbol"))
                                    r?.comoObjeto?.str("id")?.let { n.pagina(it) }
                                } catch (e: ErrorApi) {
                                    Avisos.di(e.message ?: "No se pudo crear")
                                } finally {
                                    creando = null
                                }
                            }
                        }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconoPagina(t.str("icon"), 28.dp)
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(t.str("name").orEmpty(), fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = C.texto)
                        Text(if (creando == key) "Creando…" else t.str("description").orEmpty(), fontSize = 13.sp, color = C.apagado)
                    }
                }
            }
        }
    }
}
