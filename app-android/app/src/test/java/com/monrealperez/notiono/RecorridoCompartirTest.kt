package com.monrealperez.notiono

import android.content.Context
import android.content.Intent
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import com.monrealperez.notiono.compartir.CompartirActivity
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import org.junit.Assert.assertNotNull
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** «Compartir con Notiono» desde otra app, contra el Notiono local (lo comprueba `scripts/recorrido-android.ts`). */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w390dp-h844dp-xxhdpi")
class RecorridoCompartirTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun compartirTextoConEnlace() = runBlocking {
        assumeTrue("sin Notiono local (scripts/recorrido-android.ts)", NotionoLocal.base.isNotEmpty())
        Servicios::class.java.getDeclaredField("instancia").apply { isAccessible = true }.set(null, null)
        Servicios.baseDePrueba = NotionoLocal.base
        val s = Servicios.de(ctx)
        NotionoLocal.entra(s.api, s.sesion, s.http)
        val intent = Intent(ctx, CompartirActivity::class.java).setAction(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "Recibo del súper\nPan, leche y fruta\nhttps://example.com/recibo")
        val escenario = ActivityScenario.launch<CompartirActivity>(intent)
        compose.waitUntil(20_000) { compose.onAllNodesWithText("Página nueva").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Página nueva").performClick()
        // Se crea la página (y la pantalla de compartir se cierra).
        var id: String? = null
        val fin = System.currentTimeMillis() + 20_000
        while (id == null && System.currentTimeMillis() < fin) {
            compose.waitForIdle()
            Thread.sleep(200)
            id = runCatching {
                kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.IO) {
                    (s.repo.consulta("pages.search", objeto("query" to "Recibo del súper"), cachear = false) as JsonArray)
                        .firstOrNull()?.comoObjeto?.str("id")
                }
            }.getOrNull()
        }
        assertNotNull("la página compartida", id)
        File("build/recorrido-compartir.json").writeText(objeto("pagina" to id).toString())
        escenario.close()
    }
}
