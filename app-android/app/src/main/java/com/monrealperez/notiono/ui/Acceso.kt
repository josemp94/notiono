package com.monrealperez.notiono.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.R
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca

/** Entrar: solo SSO (como la web). Se abre en una Custom Tab del sistema. */
@Composable
fun PantallaAcceso(error: String?, onEntrar: () -> Unit) {
    Box(Modifier.fillMaxSize().background(C.fondo).safeDrawingPadding(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.fillMaxWidth().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)).background(Marca), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(108.dp))
            }
            Spacer(Modifier.height(8.dp))
            Text("Notiono", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = C.texto)
            Text(
                "Tu espacio de la familia: páginas, tareas y bases de datos.",
                color = C.apagado,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onEntrar,
                colors = ButtonDefaults.buttonColors(containerColor = Marca, contentColor = Color.White),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) { Text("Entrar con Synology", fontWeight = FontWeight.SemiBold) }
            if (error != null) Text(error, color = Color(0xFFD44C47), textAlign = TextAlign.Center)
            Text(
                "Se abre el inicio de sesión de tu NAS; al terminar vuelves aquí.",
                color = C.apagado,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
