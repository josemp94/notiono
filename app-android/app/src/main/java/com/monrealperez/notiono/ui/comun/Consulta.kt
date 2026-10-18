package com.monrealperez.notiono.ui.comun

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.ErrorApi
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonElement

/** Estado de una consulta en pantalla: lo último que se tiene, si carga y si falló. */
@Stable
class EstadoConsulta {
    var datos by mutableStateOf<JsonElement?>(null)
    var cargando by mutableStateOf(true)
    var error by mutableStateOf<ErrorApi?>(null)
    internal var vuelta by mutableIntStateOf(0)
    fun recargar() {
        vuelta++
    }
}

/**
 * Consulta tRPC con caché: pinta al instante lo guardado y luego lo fresco. Se repite
 * cuando el repositorio avisa de un cambio con alguna de las `etiquetas`, cada
 * `cadaMs` si se pide, y con [EstadoConsulta.recargar].
 */
@Composable
fun rememberConsulta(
    ruta: String,
    input: JsonElement? = null,
    etiquetas: Set<String> = emptySet(),
    cadaMs: Long = 0,
): EstadoConsulta {
    val repo = Servicios.de(LocalContext.current).repo
    val estado = remember(ruta, input) { EstadoConsulta().apply { datos = repo.cacheada(ruta, input) } }
    LaunchedEffect(ruta, input, estado.vuelta) {
        estado.cargando = true
        try {
            estado.datos = repo.consulta(ruta, input)
            estado.error = null
        } catch (e: ErrorApi) {
            estado.error = e
        } finally {
            estado.cargando = false
        }
    }
    if (etiquetas.isNotEmpty()) {
        LaunchedEffect(ruta, input, etiquetas) {
            repo.cambios.collect { if (it in etiquetas) estado.recargar() }
        }
    }
    if (cadaMs > 0) {
        LaunchedEffect(ruta, input, cadaMs) {
            while (true) {
                delay(cadaMs)
                runCatching { estado.datos = repo.consulta(ruta, input) }
            }
        }
    }
    return estado
}
