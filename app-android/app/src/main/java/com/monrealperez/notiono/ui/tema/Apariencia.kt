package com.monrealperez.notiono.ui.tema

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Claro, oscuro o como el sistema (Ajustes → Apariencia), como en Notion y en la web. */
object Apariencia {
    enum class Modo(val etiqueta: String, val icono: String) {
        Sistema("Como el sistema", "sun-moon"), Claro("Claro", "sun"), Oscuro("Oscuro", "moon"),
    }

    @Volatile private var flujo: MutableStateFlow<Modo>? = null

    fun modo(ctx: Context): StateFlow<Modo> = flujo ?: synchronized(this) {
        flujo ?: MutableStateFlow(
            runCatching { Modo.valueOf(prefs(ctx).getString("modo", null) ?: "") }.getOrDefault(Modo.Sistema),
        ).also { flujo = it }
    }

    fun pon(ctx: Context, m: Modo) {
        prefs(ctx).edit { putString("modo", m.name) }
        (modo(ctx) as MutableStateFlow).value = m
        // Android 12+: el sistema también lo sabe (barras, arranque, recursos «night»), y lo recuerda.
        if (Build.VERSION.SDK_INT >= 31) {
            ctx.getSystemService(UiModeManager::class.java)?.setApplicationNightMode(
                when (m) {
                    Modo.Claro -> UiModeManager.MODE_NIGHT_NO
                    Modo.Oscuro -> UiModeManager.MODE_NIGHT_YES
                    Modo.Sistema -> UiModeManager.MODE_NIGHT_AUTO
                },
            )
        }
    }

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("apariencia", Context.MODE_PRIVATE)
}

/** ¿Se pinta en oscuro? Lo elegido en Ajustes o, si no se eligió, lo del sistema. */
@Composable
fun esOscuro(): Boolean {
    val modo by Apariencia.modo(LocalContext.current).collectAsState()
    return when (modo) {
        Apariencia.Modo.Claro -> false
        Apariencia.Modo.Oscuro -> true
        Apariencia.Modo.Sistema -> isSystemInDarkTheme()
    }
}

/** Los iconos de las barras del sistema, del color del tema de la app (no del del sistema). */
@Composable
fun BarrasDelTema(actividad: ComponentActivity, oscuro: Boolean) {
    LaunchedEffect(oscuro) {
        actividad.enableEdgeToEdge(
            SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT) { oscuro },
            SystemBarStyle.auto(0xE6FFFFFF.toInt(), 0x801B1B1B.toInt()) { oscuro },
        )
    }
}
