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
import com.monrealperez.notiono.ui.tema.BarrasDelTema
import com.monrealperez.notiono.ui.tema.TemaNotiono
import com.monrealperez.notiono.ui.tema.esOscuro
import com.monrealperez.notiono.widgets.Widgets
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /**
     * A dónde ir por un intent (atajo, widget, enlace, compartir). Un canal y no un flujo con
     * repetición: cada destino se atiende una vez aunque la pantalla principal se vuelva a
     * montar (entrar tras caducar la sesión repetía el último: otra fila nueva, la cámara…).
     */
    private val destinos = Channel<Destino>(Channel.BUFFERED)
    private val errorAcceso = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val s = Servicios.de(this)
        setContent {
            val oscuro = esOscuro()
            BarrasDelTema(this, oscuro)
            TemaNotiono(oscuro) {
                App(destinos = destinos.receiveAsFlow(), errorAcceso = errorAcceso, onEntrar = {
                    errorAcceso.value = null
                    Acceso.abrir(this, BuildConfig.BASE_URL, s.sesion)
                })
            }
        }
        if (savedInstanceState == null) maneja(intent)
        // Al abrir la app: recordatorios programados, widgets al día (si el sistema no dejó
        // repintarlos en segundo plano, aquí se recuperan) y el registro al servidor.
        s.alcance.launch {
            com.monrealperez.notiono.avisos.Permisos.anota(applicationContext)
            com.monrealperez.notiono.avisos.Alarmas.actualiza(applicationContext, "abrir")
            Widgets.actualizaTodo(applicationContext, "abrir")
            s.registro.envia(s.api, s.sesion.token != null)
        }
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
                    // Lo que quedó en la cola de la sesión anterior sale ya, no al próximo arranque.
                    com.monrealperez.notiono.datos.ColaWorker.programa(this@MainActivity)
                } catch (e: ErrorApi) {
                    errorAcceso.value = e.message
                }
            }
            return
        }
        Destino.de(uri)?.let { destinos.trySend(it) }
    }
}
