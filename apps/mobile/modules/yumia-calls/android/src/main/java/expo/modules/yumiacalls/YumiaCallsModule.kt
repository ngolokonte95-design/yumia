package expo.modules.yumiacalls

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Pont JS ↔ appels natifs (voir lib/call-ui.ts côté app). */
class YumiaCallsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("YumiaCalls")

    Events("onVoipToken", "onCallAction", "onEnd", "onMute")

    // Branché pour toute la vie du module (et non par écouteur : l'écran
    // d'appel retire les siens en se fermant, l'app garde les autres).
    OnCreate {
      CallStore.emit = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      CallStore.emit = null
    }

    AsyncFunction("configure") { apiBaseUrl: String ->
      CallStore.setApiBaseUrl(context, apiBaseUrl)
    }

    // PushKit n'existe que sur iOS.
    AsyncFunction("getVoipToken") { null as String? }

    AsyncFunction("consumePendingAnswer") { CallStore.consumePending() }

    // CallKit n'existe que sur iOS.
    AsyncFunction("endCall") { _: String -> }

    AsyncFunction("dismissIncoming") { callId: String ->
      IncomingCallNotifier.cancel(context, callId)
    }

    AsyncFunction("setShowWhenLocked") { show: Boolean ->
      appContext.currentActivity?.let { CallStore.setShowWhenLocked(it, show) }
    }

    /** Android 14+ : l'écran d'appel plein écran demande une autorisation. */
    AsyncFunction("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < 34) return@AsyncFunction true
      context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: false
    }

    AsyncFunction("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT < 34) return@AsyncFunction
      val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
