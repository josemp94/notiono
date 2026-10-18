package com.monrealperez.notiono.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import com.monrealperez.notiono.Servicios
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

@Composable
fun App(destinos: Flow<Destino>, errorAcceso: StateFlow<String?>, onEntrar: () -> Unit) {
    val s = Servicios.de(LocalContext.current)
    val conectada by s.sesion.conectada.collectAsState()
    val error by errorAcceso.collectAsState()
    if (!conectada) {
        PantallaAcceso(error, onEntrar)
        return
    }
    Principal(destinos)
}
