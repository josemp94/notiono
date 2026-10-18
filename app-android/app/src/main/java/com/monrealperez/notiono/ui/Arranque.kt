package com.monrealperez.notiono.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import com.monrealperez.notiono.avisos.Avisador
import com.monrealperez.notiono.red.VersionApk
import com.monrealperez.notiono.ui.comun.Avisos
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import com.monrealperez.notiono.util.Actualizador
import kotlinx.coroutines.launch

/**
 * Lo que se mira al abrir la app: permiso para los avisos (Android 13+, una vez) y si
 * hay una versión nueva del APK (como mucho una vez al día).
 */
@Composable
fun AlArrancar() {
    val ctx = LocalContext.current
    val alcance = rememberCoroutineScope()
    var nueva by remember { mutableStateOf<VersionApk?>(null) }
    var progreso by remember { mutableStateOf<Float?>(null) }
    val permiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        val prefs = ctx.getSharedPreferences("avisos", android.content.Context.MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= 33 && Avisador.activo(ctx) && !Avisador.permitido(ctx) && !prefs.getBoolean("pedido", false)) {
            prefs.edit { putBoolean("pedido", true) }
            permiso.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        nueva = Actualizador.nueva(ctx)
    }
    val v = nueva ?: return
    AlertDialog(
        onDismissRequest = { if (progreso == null) nueva = null },
        containerColor = C.fondo,
        title = { Text("Hay una versión nueva de Notiono") },
        text = {
            if (progreso != null) LinearProgressIndicator({ progreso ?: 0f }, color = Marca)
            else Text("La ${v.version} ya está en tu Notiono. Se baja y Android te pedirá confirmar la instalación (se instala encima, sin perder nada).", color = C.apagado)
        },
        confirmButton = {
            TextButton(enabled = progreso == null, onClick = {
                if (!Actualizador.puedeInstalar(ctx)) {
                    Avisos.di("Permite a Notiono instalar actualizaciones y vuelve a intentarlo desde Ajustes")
                    Actualizador.pidePermiso(ctx)
                    nueva = null
                    return@TextButton
                }
                alcance.launch {
                    try {
                        val apk = Actualizador.baja(ctx, v) { progreso = it }
                        Actualizador.instala(ctx, apk)
                    } catch (e: Exception) {
                        Avisos.di(e.message ?: "No se pudo bajar la actualización")
                    } finally {
                        progreso = null
                        nueva = null
                    }
                }
            }) { Text("Actualizar", color = Marca) }
        },
        dismissButton = { TextButton({ nueva = null }) { Text("Ahora no", color = C.texto) } },
    )
}
