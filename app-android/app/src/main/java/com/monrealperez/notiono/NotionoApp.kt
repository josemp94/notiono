package com.monrealperez.notiono

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.monrealperez.notiono.datos.ColaWorker

class NotionoApp : Application(), SingletonImageLoader.Factory {
    override fun onCreate() {
        super.onCreate()
        val s = Servicios.de(this)
        // Lo que quedó sin enviar la última vez sale en cuanto haya red.
        ColaWorker.programa(this)
        if (s.sesion.token != null) Tareas.programaPeriodicas(this)
    }

    // Las imágenes (portadas, adjuntos, iconos subidos) por el mismo cliente HTTP.
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { Servicios.de(this@NotionoApp).http })) }
            .crossfade(true)
            .build()
}
