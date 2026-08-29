package com.paineldigital.panel

import android.util.Log
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors

/**
 * Pipeline de navegação (Android):
 * endereço capturado → Nominatim (geocode) → injeta o destino no painel via
 * window.atualizarDestino(lat,lng,nome). Quem traça a rota turn-by-turn é o
 * próprio painel (roteador público OSRM, direto do WebView — sem chave).
 */
object Navigator {
    private const val TAG = "PainelDigital.Nav"
    private const val NOMINATIM =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q="

    private val pool = Executors.newSingleThreadExecutor()

    fun on99Text(raw: String) {
        pool.execute {
            val dest = extractDestination(raw)
            if (dest.isNullOrEmpty()) {
                Log.d(TAG, "Nenhum endereço de destino claro em: $raw")
                return@execute
            }
            Log.d(TAG, "Destino capturado: $dest")
            val geo = geocode(dest)
            if (geo == null) {
                Log.w(TAG, "Geocodificação falhou para: $dest")
                return@execute
            }
            injectDest(geo, dest)
        }
    }

    /** Heurística de extração do destino (ajustável conforme a notificação real da 99). */
    fun extractDestination(raw: String): String? {
        val clean = raw.replace(Regex("\\s+"), " ").trim()
        val lines = clean.split("\n", "•", "·").map { it.trim() }.filter { it.isNotEmpty() }

        for (line in lines) {
            if (line.contains("destino", true)) {
                val after = line.substringAfter("destino:", ignoreCase = true)
                    .substringAfter("destino=", ignoreCase = true)
                    .substringAfterLast("destino", ignoreCase = true)
                    .trim(' ', ':', '-', '>', '\u2022')
                if (after.length >= 3) return after
            }
        }
        // Fallback: última linha com cara de endereço (contém dígito)
        return lines.lastOrNull()?.takeIf { it.any(Char::isDigit) }
    }

    private fun geocode(address: String): Geo? {
        return try {
            val encoded = URLEncoder.encode(address, "UTF-8")
            val conn = URL(NOMINATIM + encoded).openConnection() as HttpURLConnection
            conn.setRequestProperty("User-Agent", "PainelDigital/1.0 (wrapper Android)")
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.bufferedReader().readText()
            val arr = JSONArray(body)
            if (arr.length() == 0) return null
            val o = arr.getJSONObject(0)
            Geo(o.getDouble("lat"), o.getDouble("lon"))
        } catch (e: Exception) {
            Log.w(TAG, "geocode falhou", e)
            null
        }
    }

    private fun injectDest(geo: Geo, name: String) {
        val safe = name.replace("'", "")
        val script = "atualizarDestino(${geo.lat}, ${geo.lng}, '$safe')"
        val i = TrackingBridge.injector
        if (i != null) i(script) else Log.d(TAG, "WebView ainda não pronto: $script")
    }

    fun finishRide() {
        val i = TrackingBridge.injector
        if (i != null) i("limparNavegacao()") else Log.d(TAG, "WebView ainda não pronto")
    }

    data class Geo(val lat: Double, val lng: Double)
}