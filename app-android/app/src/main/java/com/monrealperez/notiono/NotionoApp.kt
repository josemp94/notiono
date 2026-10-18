package com.monrealperez.notiono

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.monrealperez.notiono.datos.ColaWorker
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

@OptIn(FlowPreview::class)
class NotionoApp : Application(), SingletonImageLoader.Factory {
    override fun onCreate() {
        super.onCreate()
        val s = Servicios.de(this)
        // Lo que quedó sin enviar la última vez sale en cuanto haya red.
        ColaWorker.programa(this)
        if (s.sesion.token != null) Tareas.programaPeriodicas(this)
        // Lo que cambia la app se ve al momento en los widgets.
        s.alcance.launch {
            s.repo.cambios
                .filter { it.startsWith("bloques:") || it.startsWith("vista:") || it.startsWith("pagina:") || it == "arbol" }
                .debounce(1500)
                .collect { com.monrealperez.notiono.widgets.Widgets.actualizaTodo(this@NotionoApp) }
        }
    }

    // Las imágenes (portadas, adjuntos, iconos subidos) por el mismo cliente HTTP.
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { Servicios.de(this@NotionoApp).http })) }
            .crossfade(true)
            .build()
}
