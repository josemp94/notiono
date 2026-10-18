package com.monrealperez.notiono

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.monrealperez.notiono.red.Acceso
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.ui.App
import com.monrealperez.notiono.ui.Destino
import com.monrealperez.notiono.ui.tema.TemaNotiono
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /** A dónde ir por un intent (atajo, widget, enlace, compartir). */
    private val destinos = MutableSharedFlow<Destino>(replay = 1, extraBufferCapacity = 4)
    private val errorAcceso = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val s = Servicios.de(this)
        setContent {
            TemaNotiono {
                App(destinos = destinos, errorAcceso = errorAcceso, onEntrar = {
                    errorAcceso.value = null
                    Acceso.abrir(this, BuildConfig.BASE_URL, s.sesion)
                })
            }
        }
        if (savedInstanceState == null) maneja(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        maneja(intent)
    }

    private fun maneja(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
        val s = Servicios.de(this)
        Acceso.codigoDe(uri)?.let { code ->
            val v = s.sesion.verificadorPendiente ?: return
            lifecycleScope.launch {
                try {
                    val canje = s.api.canjear(code, v)
                    s.sesion.verificadorPendiente = null
                    s.sesion.guarda(canje)
                    Tareas.programaPeriodicas(this@MainActivity)
                } catch (e: ErrorApi) {
                    errorAcceso.value = e.message
                }
            }
            return
        }
        Destino.de(uri)?.let { destinos.tryEmit(it) }
    }
}
