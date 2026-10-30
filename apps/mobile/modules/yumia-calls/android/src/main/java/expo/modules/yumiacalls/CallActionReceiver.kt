package expo.modules.yumiacalls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import org.json.JSONObject

/**
 * « Refuser » sur la notification d'appel : coupe la sonnerie et prévient le
 * serveur, sans ouvrir l'app. Le jeton de refus du push remplace la session
 * (le JS ne tourne peut-être même pas).
 */
class CallActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_DECLINE = "expo.modules.yumiacalls.DECLINE"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_DECLINE) return
    val call = CallStore.jsonToMap(intent.getStringExtra(CallStore.EXTRA_CALL) ?: return)
    val callId = call["callId"]?.takeIf { it.isNotEmpty() } ?: return
    IncomingCallNotifier.cancel(context, callId)

    val token = call["declineToken"].orEmpty()
    val url = "${CallStore.apiBaseUrl(context)}/calls/$callId/decline"
    val done = goAsync()
    thread {
      try {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 8_000
        conn.readTimeout = 8_000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { it.write(JSONObject(mapOf("token" to token)).toString().toByteArray()) }
        conn.responseCode
        conn.disconnect()
      } catch (e: Exception) {
        // Hors ligne : l'appel finira « manqué » côté serveur au bout d'une minute.
      } finally {
        done.finish()
      }
    }
  }
}
