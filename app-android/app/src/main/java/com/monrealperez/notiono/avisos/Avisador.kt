package com.monrealperez.notiono.avisos

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.monrealperez.notiono.MainActivity
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.bool
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.bandeja.textoAviso
import java.util.concurrent.TimeUnit

/**
 * Avisos de la bandeja en Android, sin Firebase: WorkManager mira cada 15 minutos (lo
 * mínimo que deja Android) si hay avisos nuevos sin leer y los saca como notificación.
 * También dispara los vencimientos (`notifications.checkDue`), como la web al abrirse, y
 * baja los recordatorios para sus alarmas (ver [Alarmas]: esas sí suenan a su hora).
 */
object Avisador {
    const val CANAL = "bandeja"
    private const val TRABAJO = "avisos"

    fun activo(ctx: Context) = ctx.getSharedPreferences("avisos", Context.MODE_PRIVATE).getBoolean("activo", true)

    fun activar(ctx: Context, si: Boolean) {
        ctx.getSharedPreferences("avisos", Context.MODE_PRIVATE).edit { putBoolean("activo", si) }
        if (si) programa(ctx) else WorkManager.getInstance(ctx).cancelUniqueWork(TRABAJO)
    }

    fun programa(ctx: Context) {
        if (!activo(ctx)) return
        creaCanal(ctx)
        val req = PeriodicWorkRequestBuilder<AvisosWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(TRABAJO, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun creaCanal(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CANAL, ctx.getString(R.string.canal_avisos), NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = ctx.getString(R.string.canal_avisos_desc) },
        )
    }

    fun permitido(ctx: Context) = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Saca como notificación los avisos sin leer que aún no se habían enseñado. */
    suspend fun revisa(ctx: Context) {
        val s = Servicios.de(ctx)
        if (s.sesion.token == null) return
        runCatching { s.api.mutation("notifications.checkDue") }
        val lista = s.api.query("notifications.list").comoLista.map { it.comoObjeto }
        val prefs = ctx.getSharedPreferences("avisos", Context.MODE_PRIVATE)
        val vistos = prefs.getStringSet("vistos", null) ?: emptySet()
        val primeraVez = !prefs.contains("vistos")
        val nuevos = lista.filter { !it.bool("read") && it.str("id") !in vistos }
        // La primera vez no se avisa de lo viejo: solo se apunta como visto.
        if (!primeraVez && nuevos.isNotEmpty() && !Permisos.notificaciones(ctx)) {
            s.registro.anota("avisos", "bandeja · ${nuevos.size} nuevos sin poder enseñarlos: falta el permiso de notificaciones")
        }
        if (!primeraVez && permitido(ctx)) {
            for (a in nuevos.take(5)) {
                // Un recordatorio que ya sonó por su alarma no se repite (y si no sonó, sale aquí y la alarma ya no).
                if (a.str("type") == "reminder" && a.str("key") != null) {
                    Alarmas.muestra(ctx, Recordatorio(a.str("key")!!, a.str("createdAt").orEmpty(), a.str("title") ?: "Recordatorio",
                        textoAviso(a).text, a.str("pageId").orEmpty(), a.str("recordId")))
                    continue
                }
                val abrir = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse(com.monrealperez.notiono.ui.bandeja.enlaceDeAviso(a)))
                val pi = PendingIntent.getActivity(ctx, a.str("id").hashCode(), abrir, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                val n = NotificationCompat.Builder(ctx, CANAL)
                    .setSmallIcon(R.drawable.ic_notificacion)
                    .setColor(0xFFFF5C28.toInt())
                    .setContentTitle("Notiono")
                    .setContentText(textoAviso(a).text)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(textoAviso(a).text))
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .build()
                try {
                    NotificationManagerCompat.from(ctx).notify(a.str("id").hashCode(), n)
                } catch (_: SecurityException) {
                }
            }
        }
        // Basta con los de la lista actual (las 50 últimas): lo que sale de ella no vuelve. Antes
        // se acumulaban y se recortaban a 500 de un conjunto sin orden, y alguno aún sin leer se
        // podía caer y volver a avisar cada 15 minutos.
        prefs.edit { putStringSet("vistos", lista.mapNotNull { it.str("id") }.toSet()) }
    }
}

class AvisosWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = try {
        Alarmas.actualiza(applicationContext, "periodico")
        Avisador.revisa(applicationContext)
        Result.success()
    } catch (e: Exception) {
        Servicios.de(applicationContext).registro.anota("avisos", "bandeja · fallo", e)
        Result.retry()
    }
}
