package com.monrealperez.notiono

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.monrealperez.notiono.datos.ColaWorker
import kotlinx.coroutines.FlowPreview
import com.monrealperez.notiono.widgets.Widgets
import com.monrealperez.notiono.avisos.Alarmas
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

@OptIn(FlowPreview::class)
class NotionoApp : Application(), SingletonImageLoader.Factory {
    override fun onCreate() {
        super.onCreate()
        val s = Servicios.de(this)
        // Los cierres inesperados quedan en el registro de diagnóstico (y se mandan al volver).
        s.registro.capturaCierres()
        // Lo que quedó sin enviar la última vez sale en cuanto haya red.
        ColaWorker.programa(this)
        if (s.sesion.token != null) Tareas.programaPeriodicas(this)
        // Lo que cambia la app se ve al momento en los widgets.
        s.alcance.launch {
            s.repo.cambios
                .filter { it.startsWith("bloques:") || it.startsWith("vista:") || it.startsWith("pagina:") || it == "arbol" || it == "favoritos" || it == "recientes" }
                .debounce(1500)
                .collect { Widgets.actualizaTodo(this@NotionoApp, "cambio") }
        }
        // Lo editado en la app va a la copia en el NAS un rato después (si está conectada).
        s.alcance.launch {
            s.repo.cambios
                .filter { it.startsWith("bloques:") || it.startsWith("vista:") || it.startsWith("pagina:") || it == "arbol" }
                .debounce(1500)
                .collect { s.copia.trasEditar() }
        }
        // Una fecha cambiada en la app: sus recordatorios, a reprogramar.
        s.alcance.launch {
            s.repo.cambios.filter { it.startsWith("vista:") }.debounce(3000).collect { Alarmas.actualiza(this@NotionoApp, "cambio") }
        }
        // Entrar o salir cambia lo que pueden enseñar (y de quién son los recordatorios).
        s.alcance.launch {
            s.sesion.conectada.drop(1).collect {
                Widgets.actualizaTodo(this@NotionoApp, "sesion")
                Alarmas.actualiza(this@NotionoApp, "sesion")
            }
        }
        s.alcance.launch { runCatching { Widgets.publicaVistasPrevias(this@NotionoApp) } }
        Widgets.limpiaRestosDeGlance(this)
    }

    // Las imágenes (portadas, adjuntos, iconos subidos) por el mismo cliente HTTP.
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { Servicios.de(this@NotionoApp).http })) }
            .crossfade(true)
            .build()
}
