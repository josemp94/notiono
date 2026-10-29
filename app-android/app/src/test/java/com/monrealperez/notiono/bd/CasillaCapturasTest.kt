package com.monrealperez.notiono.bd

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.github.takahirom.roborazzi.captureRoboImage
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.Canje
import com.monrealperez.notiono.red.UsuarioCanje
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.TemaNotiono
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Capturas de la Lista y el Kanban con casillas, en claro y oscuro (solo al grabar:
 * `-Proborazzi.test.record=true`; salen en `app/build/capturas/casilla/`).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class CasillaCapturasTest {
    @get:Rule val compose = createComposeRule()

    private fun datos(tipo: String, config: String) = """{
        "collection":{"id":"c1"},
        "fields":[{"id":"t","name":"Nombre","type":"text"},{"id":"h","name":"Hecha","type":"checkbox"}],
        "views":[{"id":"v1","name":"Tareas","type":"$tipo","config":$config}],
        "view":{"id":"v1","name":"Tareas","type":"$tipo","config":$config},
        "filas":[
          {"id":"r1","cells":{"t":"Comprar pan","h":true}},
          {"id":"r2","cells":{"t":"Llamar al fontanero"}},
          {"id":"r3","cells":{"t":"Revisar facturas","h":false}},
          {"id":"r4","cells":{"t":"Regar las plantas","h":true}},
          {"id":"r5","cells":{"t":"Preparar la reunión"}}
        ],
        "nivel":"edit"
    }"""

    private fun foto(nombre: String, tipo: String, config: String, oscuro: Boolean) {
        assumeTrue(System.getProperty("roborazzi.test.record") == "true")
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        WorkManagerTestInitHelper.initializeTestWorkManager(ctx)
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = "http://127.0.0.1:9"
        val s = Servicios.de(ctx)
        s.sesion.guarda(Canje("tok", 0, UsuarioCanje("u1", "Ana", "ana@example.com")))
        s.repo.cache.guarda(s.repo.cache.clave("app.vista", objeto("pageId" to "p1")), json.parseToJsonElement(datos(tipo, config)))
        val est = EstadoBD("p1", s, s.alcance).apply { cacheada() }
        compose.setContent {
            TemaNotiono(oscuro) {
                Box(Modifier.fillMaxSize().background(C.fondo)) {
                    if (tipo == "list") VistaLista(est) {} else VistaKanban(est, {}, {})
                }
            }
        }
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("build/capturas/casilla/$nombre.png")
        Servicios.baseDePrueba = null
    }

    @Test fun listaClaro() = foto("app-lista-claro", "list", "{}", false)
    @Test fun listaOscuro() = foto("app-lista-oscuro", "list", "{}", true)
    @Test fun kanbanClaro() = foto("app-kanban-claro", "kanban", """{"groupByFieldId":"h"}""", false)
    @Test fun kanbanOscuro() = foto("app-kanban-oscuro", "kanban", """{"groupByFieldId":"h"}""", true)
}
