package com.paineldigital.panel

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import java.util.Locale

/** Ponte entre o serviço de GPS e o WebView (injeta no JS do painel). */
object TrackingBridge {
    @Volatile
    var injector: ((String) -> Unit)? = null
}

/**
 * Serviço de primeiro plano que mantém o processo vivo e o GPS ativo mesmo com
 * o app em segundo plano. Cada leitura vira uma chamada a
 * window.__panelNativePos(lat, lng, acc, speedMS, timestamp) no WebView.
 */
class TrackingService : Service(), LocationListener {

    private var locationManager: LocationManager? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        startTracking()
        return START_STICKY
    }

    private fun startAsForeground() {
        val pi = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .setContentIntent(pi)
            .build()

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun startTracking() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PainelDigital:GPS")
        wakeLock?.acquire()

        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager

        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER
        )

        providers.forEach { provider ->
            try {
                if (locationManager?.isProviderEnabled(provider) == true) {
                    locationManager?.requestLocationUpdates(
                        provider,
                        MIN_TIME_MS,
                        MIN_DISTANCE_M,
                        this,
                        Looper.getMainLooper()
                    )
                }
            } catch (_: SecurityException) {
                // a Activity pede a permissão; sem ela o rastreio é ignorado
            } catch (_: IllegalArgumentException) {
                // fornecedor indisponível
            }
        }
    }

    override fun onLocationChanged(location: Location) {
        LastLocation.set(location.latitude, location.longitude)
        Navigator.onPosition(location.latitude, location.longitude)

        val injector = TrackingBridge.injector ?: return

        val lat = "%.7f".format(Locale.US, location.latitude)
        val lng = "%.7f".format(Locale.US, location.longitude)
        val acc = if (location.hasAccuracy()) "%.1f".format(Locale.US, location.accuracy) else "null"
        val speed = if (location.hasSpeed()) "%.2f".format(Locale.US, location.speed) else "null"
        val ts = location.time

        val script = "window.__panelNativePos && window.__panelNativePos(" +
            "$lat,$lng,$acc,$speed,$ts);"

        injector(script)
    }

    override fun onDestroy() {
        locationManager?.removeUpdates(this)
        locationManager = null
        try {
            wakeLock?.release()
        } catch (_: Exception) {
        }
        wakeLock = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notif_channel),
                NotificationManager.IMPORTANCE_LOW
            )
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val CHANNEL_ID = "painel_tracking"
        private const val NOTIF_ID = 1001
        private const val MIN_TIME_MS = 1000L
        private const val MIN_DISTANCE_M = 0.5f
    }
}