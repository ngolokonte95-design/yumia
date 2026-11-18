package expo.modules.yumiacalls

import android.app.NotificationManager
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
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

    /**
     * Sortie du son pendant l'appel : haut-parleur, ou sortie « conversation »
     * (casque filaire / Bluetooth s'il y en a un, sinon l'écouteur). Sans ce
     * réglage, WebRTC laisse le téléphone en mode média : tout sort par le
     * haut-parleur et le bouton de l'écran d'appel ne changeait rien.
     */
    AsyncFunction("setSpeaker") { on: Boolean ->
      val audio = context.getSystemService(AudioManager::class.java) ?: return@AsyncFunction
      audio.mode = AudioManager.MODE_IN_COMMUNICATION
      if (Build.VERSION.SDK_INT < 31) {
        @Suppress("DEPRECATION")
        audio.isSpeakerphoneOn = on
        return@AsyncFunction
      }
      val devices = audio.availableCommunicationDevices
      val headset = devices.any {
        it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
          it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || it.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
          it.type == AudioDeviceInfo.TYPE_USB_HEADSET
      }
      val target = when {
        on -> devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        // Un casque branché : on laisse le système le choisir.
        headset -> null
        else -> devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
      }
      if (target != null) {
        audio.setCommunicationDevice(target)
      } else {
        audio.clearCommunicationDevice()
      }
      return@AsyncFunction
    }

    /** Fin d'appel : le téléphone retrouve son mode audio normal. */
    AsyncFunction("resetAudioRoute") {
      val audio = context.getSystemService(AudioManager::class.java) ?: return@AsyncFunction
      if (Build.VERSION.SDK_INT >= 31) {
        audio.clearCommunicationDevice()
      } else {
        @Suppress("DEPRECATION")
        audio.isSpeakerphoneOn = false
      }
      audio.mode = AudioManager.MODE_NORMAL
      return@AsyncFunction
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
