package expo.modules.yumiacalls

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.WindowManager
import org.json.JSONObject

/**
 * État partagé entre le service de push, la notification, l'activité et le
 * module JS — qui ne vivent pas tous en même temps (app fermée : seul le
 * service tourne quand l'appel arrive).
 */
object CallStore {
  const val EXTRA_CALL = "expo.modules.yumiacalls.CALL"
  const val EXTRA_ACTION = "expo.modules.yumiacalls.ACTION"

  private const val PREFS = "yumia_calls"
  private const val KEY_API = "apiBaseUrl"
  private const val DEFAULT_API = "https://api.yumia.eu/api"

  /** Branché par le module quand le JS écoute. */
  @Volatile var emit: ((String, Map<String, Any?>) -> Unit)? = null

  /** Appel ouvert ou décroché depuis la notification, pas encore pris en charge par le JS. */
  @Volatile private var pending: Map<String, Any?>? = null

  fun apiBaseUrl(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_API, null) ?: DEFAULT_API

  fun setApiBaseUrl(context: Context, url: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_API, url).apply()
  }

  @Synchronized
  fun consumePending(): Map<String, Any?>? {
    val p = pending
    pending = null
    return p
  }

  /**
   * L'activité a été lancée (ou ramenée) par la notification d'appel : on
   * garde l'appel pour le JS, et l'activité passe devant l'écran verrouillé
   * pour qu'on puisse répondre sans déverrouiller.
   */
  fun handleIntent(activity: Activity, intent: Intent?) {
    val json = intent?.getStringExtra(EXTRA_CALL) ?: return
    val action = intent.getStringExtra(EXTRA_ACTION) ?: "open"
    // Une rotation recrée l'activité avec le même intent : ne pas rejouer l'appel.
    intent.removeExtra(EXTRA_CALL)
    intent.removeExtra(EXTRA_ACTION)

    val call = jsonToMap(json) + ("action" to action)
    if (action == "answer") {
      IncomingCallNotifier.cancel(activity, call["callId"] as? String)
    }
    setShowWhenLocked(activity, true)
    synchronized(this) { pending = call }
    emit?.invoke("onCallAction", call)
  }

  fun setShowWhenLocked(activity: Activity, show: Boolean) {
    activity.runOnUiThread {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(show)
        activity.setTurnScreenOn(show)
      } else {
        @Suppress("DEPRECATION")
        val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        if (show) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
      }
    }
  }

  fun jsonToMap(json: String): Map<String, String> {
    val obj = try { JSONObject(json) } catch (e: Exception) { return emptyMap() }
    return obj.keys().asSequence().associateWith { obj.optString(it) }
  }
}
