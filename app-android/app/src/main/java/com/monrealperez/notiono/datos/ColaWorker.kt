package com.monrealperez.notiono.datos

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.monrealperez.notiono.Servicios

/** Envía la cola de cambios hechos sin conexión en cuanto vuelve la red. */
class ColaWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val s = Servicios.de(applicationContext)
        if (s.sesion.token == null) return Result.success()
        return if (s.repo.vaciaCola()) Result.success() else Result.retry()
    }

    companion object {
        fun programa(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<ColaWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("cola", ExistingWorkPolicy.KEEP, req)
        }
    }
}
