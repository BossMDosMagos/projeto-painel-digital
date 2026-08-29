package com.paineldigital.panel

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors

/** Última posição conhecida do GPS (para usar como origem da rota). */
object LastLocation {
    @Volatile private var lat = 0.0
    @Volatile private var lng = 0.0
    @Volatile private var valid = false

    fun set(newLat: Double, newLng: Double) {
        lat = newLat
        lng = newLng
        valid = true
    }

    fun get(): Navigator.Geo? = if (valid) Navigator.Geo(lat, lng) else null
}

/**
 * Pipeline de navegação:
 * endereço capturado → Nominatim (geocode) → modo bússola (destino)
 * ou → OpenRouteService (turn-by-turn com ruas, quando a chave estiver preenchida).
 *
 * Tudo roda no app; o resultado é injetado no WebView.
 */
object Navigator {
    private const val TAG = "PainelDigital.Nav"
    private const val NOMINATIM =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q="
    private const val ORS_ENDPOINT =
        "https://api.openrouteservice.org/v2/directions/driving-car"

    /**
     * Preencha com a chave gratuita de https://openrouteservice.org
     * para receber turn-by-turn com ruas. Vazio = modo bússola
     * (seta aponta o destino, calculada pelo próprio painel).
     */
    const val ORS_API_KEY: String = ""

    private val pool = Executors.newSingleThreadExecutor()

    private val steps = mutableListOf<Step>()
    private var activeIndex = 0
    private var lastDestination: Geo? = null

    data class Geo(val lat: Double, val lng: Double)
    data class Step(
        val lat: Double,
        val lng: Double,
        val meters: Double,
        val modifier: String,
        val name: String
    )

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
            lastDestination = geo
            if (ORS_API_KEY.isNotBlank()) fetchRouteThenLock(geo) else pushDest(geo, dest)
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

    private fun pushDest(geo: Geo, name: String) {
        val safe = name.replace("'", "")
        inject("atualizarDestino(${geo.lat}, ${geo.lng}, '$safe')")
    }

    fun finishRide() {
        steps.clear()
        activeIndex = 0
        lastDestination = null
        inject("limparNavegacao()")
    }

    /** Chamado pelo TrackingService a cada fix, para o turn-by-turn reativo. */
    fun onPosition(lat: Double, lng: Double) {
        if (steps.isEmpty()) return
        pushCurrentStep(lat, lng)
    }

    // ---- Molde OpenRouteService (ativo só quando ORS_API_KEY estiver preenchida) ----
    private fun fetchRouteThenLock(dest: Geo) {
        try {
            val origin = LastLocation.get() ?: dest
            val payload = JSONObject()
            payload.put("coordinates", JSONArray().apply {
                put(JSONArray().apply { put(origin.lng); put(origin.lat) })
                put(JSONArray().apply { put(dest.lng); put(dest.lat) })
            })
            payload.put("instructions", true)

            val conn = URL(ORS_ENDPOINT).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", ORS_API_KEY)
            conn.connectTimeout = 12000
            conn.readTimeout = 12000
            conn.outputStream.use { it.write(payload.toString().toByteArray()) }

            val text = conn.inputStream.bufferedReader().readText()
            val features = JSONObject(text).getJSONArray("features")
            val stepsArr = features.getJSONObject(0).getJSONObject("properties")
                .getJSONArray("segments").getJSONObject(0).getJSONArray("steps")

            synchronized(steps) {
                steps.clear()
                for (i in 0 until stepsArr.length()) {
                    val s = stepsArr.getJSONObject(i)
                    val man = s.getJSONObject("maneuver")
                    val type = man.getString("type")
                    if (type == "depart" || type == "arrive") continue
                    val loc = man.getJSONArray("location")
                    steps += Step(
                        loc.getDouble(1), loc.getDouble(0),
                        s.optDouble("distance", 0.0),
                        man.optString("modifier", "straight"),
                        s.optString("name", "")
                    )
                }
                activeIndex = 0
            }
            pushCurrentStep()
        } catch (e: Exception) {
            Log.w(TAG, "ORS falhou — caindo para modo bússola", e)
            pushDest(dest, "Destino")
        }
    }

    private fun pushCurrentStep(lat: Double? = null, lng: Double? = null) {
        synchronized(steps) {
            var guard = 0
            while (activeIndex < steps.size && guard++ < steps.size) {
                val s = steps[activeIndex]
                var distM = s.meters
                if (lat != null && lng != null) {
                    distM = haversineM(lat, lng, s.lat, s.lng)
                    if (distM <= 25.0) {
                        activeIndex++ // chegou no ponto da manobra — avança
                        continue
                    }
                }
                val distInt = Math.round(distM).toInt()
                inject("atualizarNavegacao($distInt, '${s.modifier}', '${s.name.replace("'", "")}')")
                return
            }
            if (guard >= 1 && activeIndex >= steps.size) {
                inject("atualizarNavegacao(0, 'final', 'Você chegou')")
            }
        }
    }

    private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val R = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
        return 2 * R * Math.asin(Math.sqrt(a))
    }

    private fun inject(script: String) {
        val i = TrackingBridge.injector
        if (i != null) i(script) else Log.d(TAG, "WebView ainda não pronto: $script")
    }
}