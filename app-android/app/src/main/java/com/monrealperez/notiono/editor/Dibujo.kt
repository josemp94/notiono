package com.monrealperez.notiono.editor

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.tema.C
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import java.net.URLEncoder

/** Lo que devuelve el lienzo: URL de la escena (trazos en JSON) y de la vista previa (PNG). Vacías = sin trazos. */
data class DibujoGuardado(val escena: String, val imagen: String, val texto: String)

/**
 * El puente que llama la página `/dibujo` (`window.NotionoApp`). Llega en un hilo del
 * WebView: se pasa al principal antes de tocar el documento.
 */
class PuenteDibujo(private val onGuardado: (DibujoGuardado) -> Unit, private val onCerrar: () -> Unit) {
    private val principal = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun guardado(json: String) {
        val o = runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull() ?: return
        val g = DibujoGuardado(o.str("escena").orEmpty(), o.str("imagen").orEmpty(), o.str("texto").orEmpty())
        principal.post { onGuardado(g) }
    }

    @JavascriptInterface
    fun cerrar() {
        principal.post { onCerrar() }
    }
}

/**
 * El lienzo del bloque «Dibujo»: la misma página que en la web (Excalidraw en `/dibujo`)
 * en un WebView a pantalla completa con la cookie de la sesión de la app. Así el formato
 * es el mismo y se edita igual de bien a pulso (dedo o lápiz, pellizco para el zoom).
 * Atrás pulsa el «Cerrar» de la página, que pregunta si hay cambios sin guardar.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LienzoDibujo(escena: String, onCerrar: () -> Unit, onGuardado: (DibujoGuardado) -> Unit) {
    val ctx = LocalContext.current
    val s = Servicios.de(ctx)
    val oscuro = C.oscuro
    val url = remember(escena) {
        s.api.absoluta("/dibujo?escena=${URLEncoder.encode(escena, "UTF-8")}&tema=${if (oscuro) "dark" else "light"}")
    }
    val vista = remember { arrayOfNulls<WebView>(1) }
    Dialog(
        onDismissRequest = {
            vista[0]?.evaluateJavascript("document.querySelector('.lienzo-dibujo [aria-label=\"Cerrar\"]')?.click()", null) ?: onCerrar()
        },
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize().background(C.fondo).systemBarsPadding()) {
            AndroidView(
                factory = { c ->
                    CookieManager.getInstance().apply {
                        setAcceptCookie(true)
                        s.sesion.token?.let { setCookie(s.api.base, "notiono_session=$it; path=/") }
                        s.sesion.espacio?.let { setCookie(s.api.base, "notiono_ws=$it; path=/") }
                        flush()
                    }
                    WebView(c).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        webViewClient = WebViewClient()
                        webChromeClient = WebChromeClient() // el «¿Salir sin guardar?» de la página
                        addJavascriptInterface(PuenteDibujo(onGuardado, onCerrar), "NotionoApp")
                        loadUrl(url)
                        vista[0] = this
                    }
                },
                onRelease = { it.destroy() },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/**
 * La vista previa es un PNG claro; en oscuro se invierte como en la web
 * (`invert(93%) hue-rotate(180deg)`: el blanco pasa a casi negro y los colores conservan su tono).
 */
val MATRIZ_OSCURO = floatArrayOf(
    0.49364f, -1.2298f, -0.12384f, 0f, 237.15f,
    -0.36636f, -0.3698f, -0.12384f, 0f, 237.15f,
    -0.36636f, -1.2298f, 0.73616f, 0f, 237.15f,
    0f, 0f, 0f, 1f, 0f,
)
val InvierteOscuro = ColorFilter.colorMatrix(ColorMatrix(MATRIZ_OSCURO))
