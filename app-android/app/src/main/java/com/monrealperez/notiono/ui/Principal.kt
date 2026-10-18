package com.monrealperez.notiono.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import kotlinx.coroutines.flow.SharedFlow

@Composable
fun Principal(destinos: SharedFlow<Destino>) {
    Text("Notiono")
}
