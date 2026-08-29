package com.paineldigital.panel

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Lê as notificações do app da 99 (com.taxis99) para detectar a corrida e
 * capturar o endereço de destino automaticamente.
 *
 * IMPORTANTE: o usuário precisa ativar "Acesso a notificações" para este app
 * (Configurações → Apps → Acesso especial → Acesso a notificações),
 * senão o sistema não vincula o serviço.
 */
class NotificationReaderService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.isOngoing || sbn.packageName != PACKAGE_99) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val all = (listOf(title, text, big).joinToString("\n")).trim()

        if (all.isBlank()) return
        Log.i(TAG, "99 notificação -> $all")

        // Fim de corrida (heurística; ajustar conforme a versão do app 99)
        if (title.contains("finaliz", true) ||
            all.contains("corrida finaliz", true) ||
            all.contains("bom trabalho", true) ||
            all.contains("avaliar", true)
        ) {
            Navigator.finishRide()
            return
        }

        // Corrida aceita / em andamento: tenta extrair o destino
        if (title.contains("corrida", true) ||
            all.contains("destino", true) ||
            all.contains("embarque", true)
        ) {
            Navigator.on99Text(all)
        }
    }

    companion object {
        private const val TAG = "PainelDigital.99"
        private const val PACKAGE_99 = "com.taxis99"
    }
}