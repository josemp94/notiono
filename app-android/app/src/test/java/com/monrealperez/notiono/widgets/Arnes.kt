package com.monrealperez.notiono.widgets

import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.ComponentName
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.TextView
import org.robolectric.Shadows.shadowOf
import java.util.concurrent.atomic.AtomicInteger

/** Lo común de las pruebas de widgets: ponerlos en un «escritorio» de Robolectric y leer lo que enseñan. */
object Arnes {
    private val siguiente = AtomicInteger(100)

    /** Pone un widget de esa clase (como si la persona lo hubiera añadido) con su configuración. */
    fun pon(ctx: Context, clase: Class<out ProveedorWidget>, config: ConfigWidget? = null): Int {
        val id = siguiente.incrementAndGet()
        val nombre = ComponentName(ctx, clase)
        val s = shadowOf(AppWidgetManager.getInstance(ctx))
        s.bindAppWidgetId(id, nombre)
        s.putWidgetInfo(id, AppWidgetProviderInfo().apply { provider = nombre })
        if (config != null) Configs.guarda(ctx, id, config)
        return id
    }

    /** Lo que vería la persona: el RemoteViews aplicado dentro de un AppWidgetHostView (si no, las listas salen vacías). */
    fun vista(ctx: Context, rv: RemoteViews, anchoDp: Int = 320, altoDp: Int = 320): View {
        val anfitrion = AppWidgetHostView(ctx)
        val d = ctx.resources.displayMetrics.density
        val v = rv.apply(ctx, anfitrion)
        anfitrion.addView(v, FrameLayout.LayoutParams((anchoDp * d).toInt(), (altoDp * d).toInt()))
        return v
    }

    /** Los textos visibles (también los de las filas de las listas), en orden. */
    fun textos(v: View): List<String> = when {
        v.visibility != View.VISIBLE -> emptyList()
        v is TextView -> listOf(v.text.toString()).filter { it.isNotBlank() }
        v is AdapterView<*> -> (0 until (v.adapter?.count ?: 0)).flatMap { textos(v.adapter.getView(it, null, FrameLayout(v.context))) }
        v is ViewGroup -> (0 until v.childCount).flatMap { textos(v.getChildAt(it)) }
        else -> emptyList()
    }

    fun textos(ctx: Context, rv: RemoteViews) = textos(vista(ctx, rv))
}
