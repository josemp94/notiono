package com.monrealperez.notiono.editor

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Typeface
import android.text.Editable
import android.text.InputType
import android.text.Spanned
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import kotlinx.serialization.json.JsonElement

/** Lo que el campo le cuenta al editor. */
interface OyenteCampo {
    fun enter(campo: CampoBloque, pos: Int)
    fun retrocesoAlInicio(campo: CampoBloque)
    fun cambio(campo: CampoBloque, ini: Int, antes: Int, despues: Int)
    fun seleccion(campo: CampoBloque, a: Int, b: Int)
    fun foco(campo: CampoBloque, tiene: Boolean)
    fun tab(campo: CampoBloque, atras: Boolean)
    /** Justo antes de que cambie el texto (para poder deshacerlo). */
    fun antesDeCambiar(campo: CampoBloque) {}
    /** Ctrl+Z / Ctrl+Mayús+Z de un teclado físico. */
    fun deshacer(campo: CampoBloque, rehacer: Boolean) {}
}

/**
 * El campo de texto de un bloque: un EditText de Android de verdad, no un campo de
 * Compose. `BasicTextField` pierde los spans al editar y, con teclados como Gboard, no
 * avisa del Retroceso cuando el cursor está al principio (Gboard manda
 * `deleteSurroundingText` sobre nada y no hay tecla que escuchar). Aquí el
 * `InputConnection` es propio y lo intercepta, igual que el Enter (que Gboard manda
 * como el texto "\n").
 *
 * El texto que edita ES el `SpannableStringBuilder` del bloque (sin copias): lo que se
 * escribe queda ya en el modelo, con sus estilos.
 */
@SuppressLint("ViewConstructor", "AppCompatCustomView")
class CampoBloque(ctx: Context) : EditText(ctx) {
    var oyente: OyenteCampo? = null
    var bloque: Bloque? = null

    /** En los bloques de código Enter es un salto de línea, no un bloque nuevo. */
    var enterParte = true

    /** Para no avisar de cambios mientras se coloca el texto desde el modelo. */
    private var poniendo = false

    init {
        background = null
        setPadding(0, dp(3f), 0, dp(3f))
        gravity = Gravity.TOP or Gravity.START
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
            InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_AUTO_CORRECT
        imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN
        isSingleLine = false
        setHorizontallyScrolling(false)
        // El Editable del campo es el del bloque, no una copia.
        setEditableFactory(object : Editable.Factory() {
            override fun newEditable(source: CharSequence): Editable = source as? Editable ?: super.newEditable(source)
        })
        addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {
                if (!poniendo) oyente?.antesDeCambiar(this@CampoBloque)
            }
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                if (!poniendo) oyente?.cambio(this@CampoBloque, start, before, count)
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    /** Coloca el texto del bloque (si no es ya el mismo objeto). */
    fun pon(b: Bloque) {
        bloque = b
        val t = b.texto ?: return
        if (text !== t) {
            poniendo = true
            val sel = selectionStart
            setText(t, BufferType.EDITABLE)
            if (sel in 0..t.length) setSelection(sel)
            poniendo = false
        }
    }

    fun estilo(tamSp: Float, negrita: Boolean, familia: Typeface, color: Int, cursiva: Boolean = false) {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, tamSp)
        setTypeface(familia, when {
            negrita && cursiva -> Typeface.BOLD_ITALIC
            negrita -> Typeface.BOLD
            cursiva -> Typeface.ITALIC
            else -> Typeface.NORMAL
        })
        setTextColor(color)
    }

    fun enfoca(pos: Int) {
        requestFocus()
        val t = text ?: return
        setSelection(pos.coerceIn(0, t.length))
        post {
            val imm = context.getSystemService(InputMethodManager::class.java)
            imm?.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    override fun onSelectionChanged(selStart: Int, selEnd: Int) {
        super.onSelectionChanged(selStart, selEnd)
        if (!poniendo) oyente?.seleccion(this, selStart, selEnd)
    }

    override fun onFocusChanged(focused: Boolean, direction: Int, previouslyFocusedRect: android.graphics.Rect?) {
        super.onFocusChanged(focused, direction, previouslyFocusedRect)
        oyente?.foco(this, focused)
    }

    private fun alInicio() = selectionStart == 0 && selectionEnd == 0

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val base = super.onCreateInputConnection(outAttrs) ?: return null
        // Que el teclado enseñe la tecla de salto de línea, no «Hecho».
        outAttrs.imeOptions = outAttrs.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION.inv()
        return object : InputConnectionWrapper(base, true) {
            override fun commitText(texto: CharSequence?, nuevaPos: Int): Boolean {
                if (enterParte && texto != null && texto.toString() == "\n") {
                    oyente?.enter(this@CampoBloque, selectionStart)
                    return true
                }
                return super.commitText(texto, nuevaPos)
            }

            override fun deleteSurroundingText(antes: Int, despues: Int): Boolean {
                if (antes > 0 && despues == 0 && alInicio()) {
                    oyente?.retrocesoAlInicio(this@CampoBloque)
                    return true
                }
                return super.deleteSurroundingText(antes, despues)
            }

            override fun deleteSurroundingTextInCodePoints(antes: Int, despues: Int): Boolean {
                if (antes > 0 && despues == 0 && alInicio()) {
                    oyente?.retrocesoAlInicio(this@CampoBloque)
                    return true
                }
                return super.deleteSurroundingTextInCodePoints(antes, despues)
            }

            override fun sendKeyEvent(event: KeyEvent): Boolean {
                if (event.action == KeyEvent.ACTION_DOWN) {
                    if (event.keyCode == KeyEvent.KEYCODE_DEL && alInicio()) {
                        oyente?.retrocesoAlInicio(this@CampoBloque)
                        return true
                    }
                    if ((event.keyCode == KeyEvent.KEYCODE_ENTER || event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) && enterParte && !event.isShiftPressed) {
                        oyente?.enter(this@CampoBloque, selectionStart)
                        return true
                    }
                    if (esDeshacer(event)) return true
                }
                return super.sendKeyEvent(event)
            }
        }
    }

    // Teclado físico.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when {
            keyCode == KeyEvent.KEYCODE_DEL && alInicio() -> { oyente?.retrocesoAlInicio(this); return true }
            (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) && enterParte && !event.isShiftPressed -> {
                oyente?.enter(this, selectionStart); return true
            }
            keyCode == KeyEvent.KEYCODE_TAB -> { oyente?.tab(this, event.isShiftPressed); return true }
            esDeshacer(event) -> return true
        }
        return super.onKeyDown(keyCode, event)
    }

    /** Ctrl+Z deshace y Ctrl+Mayús+Z o Ctrl+Y rehacen, en todo el documento (no solo en este campo). */
    private fun esDeshacer(e: KeyEvent): Boolean {
        if (!e.isCtrlPressed) return false
        when {
            e.keyCode == KeyEvent.KEYCODE_Z -> oyente?.deshacer(this, rehacer = e.isShiftPressed)
            e.keyCode == KeyEvent.KEYCODE_Y -> oyente?.deshacer(this, rehacer = true)
            else -> return false
        }
        return true
    }

    /** Aplica estilos pendientes (B sin selección) a lo recién escrito. */
    fun aplicaPendientes(ini: Int, fin: Int, pendientes: Map<String, JsonElement>, pal: Paleta) {
        val t = text ?: return
        if (fin <= ini) return
        for ((k, v) in pendientes) t.setSpan(Inline.spanDeEstilo(k, v, pal), ini, fin, Spanned.SPAN_EXCLUSIVE_INCLUSIVE)
    }
}
