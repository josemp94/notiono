package com.monrealperez.notiono.editor

import android.os.Looper
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** El bloque «Dibujo» en la app: el puente con la página del lienzo y el bloque que queda. */
@RunWith(RobolectricTestRunner::class)
class DibujoTest {
    @Test
    fun elPuenteDevuelveLoGuardadoEnElHiloPrincipal() {
        val recibido = mutableListOf<DibujoGuardado>()
        var cerrado = false
        val puente = PuenteDibujo({ recibido += it }, { cerrado = true })
        val hilo = Thread { puente.guardado("""{"escena":"/api/asset/e1","imagen":"/api/asset/p1","texto":"pan"}""") }
        hilo.start(); hilo.join()
        assertEquals(0, recibido.size) // aún no: espera al hilo principal
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(listOf(DibujoGuardado("/api/asset/e1", "/api/asset/p1", "pan")), recibido)
        puente.guardado("esto no es JSON")
        puente.cerrar()
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(1, recibido.size)
        assertEquals(true, cerrado)
    }

    @Test
    fun convertirUnParrafoEnDibujoDejaUnBloqueSinTextoConSusProps() {
        val estado = EstadoEditor(Paleta.clara, true)
        estado.carga(listOf(Bloque.nuevo("paragraph", texto = "boceto").aJson()))
        val b = estado.raiz[0]
        estado.convierte(b, "drawing")
        assertNull(b.texto)
        estado.props(b, "escena" to JsonPrimitive("/api/asset/e"), "imagen" to JsonPrimitive("/api/asset/p"))
        val j = b.aJson()
        assertEquals("drawing", j["type"]!!.jsonPrimitive.content)
        assertEquals("/api/asset/p", j["props"]!!.jsonObject["imagen"]!!.jsonPrimitive.content)
        assertEquals("", j["props"]!!.jsonObject["texto"]!!.jsonPrimitive.content)
    }

    @Test
    fun enOscuroLaVistaPreviaSeInvierteComoEnLaWeb() {
        // invert(93%) hue-rotate(180deg): blanco → 18, negro → 237 (los tres canales).
        val fila = { i: Int, c: Float -> (0..2).sumOf { (MATRIZ_OSCURO[i * 5 + it] * c).toDouble() } + MATRIZ_OSCURO[i * 5 + 4] }
        for (i in 0..2) {
            assertEquals(17.85, fila(i, 255f), 0.1)
            assertEquals(237.15, fila(i, 0f), 0.1)
        }
    }
}
