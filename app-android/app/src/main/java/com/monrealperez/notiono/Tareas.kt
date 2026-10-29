package com.monrealperez.notiono

import android.content.Context
import com.monrealperez.notiono.avisos.Avisador

/** Lo que corre en segundo plano con WorkManager (avisos, widgets, copia en el NAS). */
object Tareas {
    fun programaPeriodicas(ctx: Context) {
        Avisador.programa(ctx)
        com.monrealperez.notiono.widgets.Widgets.programa(ctx)
        Servicios.de(ctx).copia.programa()
    }
}
