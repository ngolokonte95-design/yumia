import AVFoundation
import ExpoModulesCore

/** Pont JS ↔ YumiaCallManager (voir lib/call-ui.ts côté app). */
public class YumiaCallsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("YumiaCalls")

    Events("onVoipToken", "onCallAction", "onEnd", "onMute")

    // Branché pour toute la vie du module (et non par écouteur : l'écran
    // d'appel retire les siens en se fermant, l'app garde les autres).
    OnCreate {
      YumiaCallManager.shared.emit = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    OnDestroy {
      YumiaCallManager.shared.emit = nil
    }

    AsyncFunction("configure") { (apiBaseUrl: String) in
      YumiaCallManager.shared.apiBaseUrl = apiBaseUrl
    }.runOnQueue(.main)

    AsyncFunction("getVoipToken") { () -> String? in
      return YumiaCallManager.shared.voipToken
    }.runOnQueue(.main)

    AsyncFunction("consumePendingAnswer") { () -> [String: Any]? in
      return YumiaCallManager.shared.consumePendingAnswer()
    }.runOnQueue(.main)

    AsyncFunction("endCall") { (callId: String) in
      YumiaCallManager.shared.endFromApp(callId)
    }.runOnQueue(.main)

    // Sortie du son pendant l'appel. WebRTC a déjà mis la session en
    // lecture + enregistrement : on ne change QUE la sortie. `.none` rend la
    // main au système (écouteur, casque filaire ou Bluetooth).
    AsyncFunction("setSpeaker") { (on: Bool) in
      try? AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }.runOnQueue(.main)

    AsyncFunction("resetAudioRoute") {
      try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.none)
    }.runOnQueue(.main)

    // Propres à Android (notification d'appel, écran verrouillé) : sans objet ici.
    AsyncFunction("dismissIncoming") { (_: String) in }
    AsyncFunction("setShowWhenLocked") { (_: Bool) in }
    AsyncFunction("canUseFullScreenIntent") { () -> Bool in true }
    AsyncFunction("openFullScreenIntentSettings") { }
  }
}
