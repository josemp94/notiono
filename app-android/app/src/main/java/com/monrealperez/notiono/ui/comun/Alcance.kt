package com.monrealperez.notiono.ui.comun

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Registro
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope

/**
 * Red de seguridad de las corrutinas: un fallo que nadie esperaba (un archivo que ya no se
 * puede leer, un dato con una forma rara) se apunta en el registro de diagnóstico y se
 * avisa, en vez de cerrar la app. Los fallos previstos (sin red, sin permiso) los sigue
 * tratando cada pantalla con su mensaje.
 */
fun manejadorFallos(registro: Registro) = CoroutineExceptionHandler { _, e ->
    registro.anota("fallo", "Fallo inesperado", e)
    Avisos.di("Algo no salió bien. Inténtalo otra vez.")
}

/** El `rememberCoroutineScope` de las pantallas, con la red de seguridad puesta. */
@Composable
fun rememberAlcance(): CoroutineScope {
    val registro = Servicios.de(LocalContext.current).registro
    return rememberCoroutineScope { manejadorFallos(registro) }
}
