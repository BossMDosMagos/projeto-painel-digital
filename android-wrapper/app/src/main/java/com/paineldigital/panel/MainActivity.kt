package com.paineldigital.panel

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

/**
 * Painel Digital — wrapper Android.
 *
 * Abre o PWA em fullscreen e deixa o rastreio GPS por conta do
 * [TrackingService] (foreground service), que injeta as leituras direto no
 * JavaScript do painel via window.__panelNativePos — funcionando inclusive
 * com o app em segundo plano.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK

        webView = WebView(this)
        webView.setBackgroundColor(Color.BLACK)
        setContentView(webView)

        configureWebView()
        keepImmersive()

        // Ponte: o serviço manda leituras, nós injetamos no WebView
        TrackingBridge.injector = { script ->
            runOnUiThread {
                if (::webView.isInitialized) webView.evaluateJavascript(script, null)
            }
        }

        requestNeededPermissions()

        // Serviço de primeiro plano: mantém o processo vivo e o GPS ativo
        try {
            startForegroundService(Intent(this, TrackingService::class.java))
        } catch (e: Exception) {
            // pode falhar se as permissões ainda não foram concedidas; o app segue abrindo
        }

        if (savedInstanceState == null) {
            webView.loadUrl(targetUrl())
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun targetUrl(): String =
        "https://bossmdosmagos.github.io/projeto-painel-digital/?native=1"

    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setLoadsImagesAutomatically(true)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith("https://")) {
                    view.loadUrl(url)
                }
                return false
            }
        }
    }

    private fun keepImmersive() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }

    override fun onResume() {
        super.onResume()
        keepImmersive()
    }

    // IMPORTANTE: não chamar webView.onPause() — assim o JS do painel
    // continua rodando (e recebendo o GPS) mesmo com o app em segundo plano.
    override fun onPause() {
        super.onPause()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        TrackingBridge.injector = null
        super.onDestroy()
    }

    private fun requestNeededPermissions() {
        val needed = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }
}