package expo.modules.yumiacalls

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Reçoit les push Firebase avant expo-notifications (priorité 10 contre -1).
 * Un appel → notification d'appel native, même app fermée. Tout le reste est
 * rendu tel quel au délégué d'expo-notifications, comme si ce service
 * n'existait pas.
 *
 * Délégué atteint par réflexion : expo-notifications est livré précompilé,
 * ce module ne peut pas le prendre en dépendance de compilation. Le nom est
 * protégé de R8 par consumer-rules.pro.
 */
class CallMessagingService : FirebaseMessagingService() {
  private val expoDelegate: Any? by lazy {
    try {
      Class.forName("expo.modules.notifications.service.delegates.FirebaseMessagingDelegate")
        .getConstructor(Context::class.java)
        .newInstance(this)
    } catch (e: Throwable) {
      Log.w("YumiaCalls", "délégué expo-notifications introuvable", e)
      null
    }
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val call = callPayload(message.data)
    when {
      call == null -> forward("onMessageReceived", RemoteMessage::class.java, message)
      call["type"] == "incoming_call" -> IncomingCallNotifier.show(this, call)
      else -> IncomingCallNotifier.cancel(this, call["callId"])
    }
  }

  override fun onNewToken(token: String) {
    forward("onNewToken", String::class.java, token)
  }

  override fun onDeletedMessages() {
    forward("onDeletedMessages", null, null)
  }

  private fun forward(method: String, type: Class<*>?, arg: Any?) {
    val delegate = expoDelegate ?: return
    try {
      if (type == null) {
        delegate.javaClass.getMethod(method).invoke(delegate)
      } else {
        delegate.javaClass.getMethod(method, type).invoke(delegate, arg)
      }
    } catch (e: Throwable) {
      Log.w("YumiaCalls", "transmission à expo-notifications impossible ($method)", e)
    }
  }

  /**
   * Le service push d'Expo range nos données en JSON dans `body` ; un envoi
   * direct par FCM les mettrait à plat. Les deux formes sont acceptées.
   */
  private fun callPayload(data: Map<String, String>): Map<String, String>? {
    val fromBody = data["body"]?.let { CallStore.jsonToMap(it) }
    val payload = if (fromBody?.get("type") != null) fromBody else data
    return payload.takeIf { it["type"] == "incoming_call" || it["type"] == "call_cancel" }
  }
}
