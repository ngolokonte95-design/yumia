import AVFoundation
import CallKit
import PushKit
import UIKit

/**
 Appels entrants façon téléphone : push VoIP (PushKit) → écran d'appel
 système (CallKit), même app fermée ou iPhone verrouillé.

 Règles Apple à ne jamais casser (sinon iOS tue l'app, puis cesse de lui
 livrer les push VoIP) :
 - chaque push VoIP reçu signale un appel à CallKit AVANT d'appeler
   `completion`, annulation comprise (on signale puis on termine aussitôt) ;
 - pas de CallKit en Chine continentale (interdit par la réglementation) :
   on n'y enregistre pas PushKit, le serveur garde la notification classique.

 Tout s'exécute sur la file principale (PushKit et CXProvider y livrent).
 */
final class YumiaCallManager: NSObject {
  static let shared = YumiaCallManager()

  private static let apiBaseUrlKey = "yumia.calls.apiBaseUrl"
  private static let defaultApiBaseUrl = "https://api.yumia.eu/api"
  /** Le serveur classe l'appel « manqué » à 60 s ; filet de sécurité si l'annulation se perd. */
  private static let ringTimeout: TimeInterval = 65

  private var registry: PKPushRegistry?
  private let controller = CXCallController()
  private lazy var provider: CXProvider = {
    let config = CXProviderConfiguration()
    config.supportsVideo = true
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    // Un appel YUMIA n'a pas de numéro : dans l'historique du téléphone, il
    // ne mènerait nulle part.
    config.includesCallsInRecents = false
    let p = CXProvider(configuration: config)
    p.setDelegate(self, queue: nil)
    return p
  }()

  private(set) var voipToken: String?
  /** Appels signalés à CallKit, par UUID (= identifiant d'appel du serveur). */
  private var calls: [UUID: [String: Any]] = [:]
  private var answered = Set<UUID>()
  /** Raccrochés depuis l'écran d'appel de l'app : CallKit n'a pas à le lui renvoyer. */
  private var endedByApp = Set<UUID>()
  private var timeouts: [UUID: DispatchWorkItem] = [:]
  /** Décroché pas encore pris en charge par le JS (app lancée par l'appel). */
  private var pendingAnswer: [String: Any]?

  /** Branché par le module quand le JS écoute. */
  var emit: ((String, [String: Any]) -> Void)?

  var apiBaseUrl: String {
    get { UserDefaults.standard.string(forKey: Self.apiBaseUrlKey) ?? Self.defaultApiBaseUrl }
    set { UserDefaults.standard.set(newValue, forKey: Self.apiBaseUrlKey) }
  }

  private static var isChinaMainland: Bool {
    Locale.current.region?.identifier == "CN"
  }

  func start() {
    guard registry == nil, !Self.isChinaMainland else { return }
    _ = provider
    let r = PKPushRegistry(queue: .main)
    r.delegate = self
    r.desiredPushTypes = [.voIP]
    registry = r
  }

  func consumePendingAnswer() -> [String: Any]? {
    let p = pendingAnswer
    pendingAnswer = nil
    return p
  }

  /** L'écran d'appel de l'app a raccroché (ou l'appel a échoué). */
  func endFromApp(_ callId: String) {
    guard let uuid = UUID(uuidString: callId), calls[uuid] != nil else { return }
    endedByApp.insert(uuid)
    controller.request(CXTransaction(action: CXEndCallAction(call: uuid))) { [weak self] error in
      guard error != nil else { return }
      // Transaction refusée (appel déjà inconnu de CallKit) : on le signale terminé.
      DispatchQueue.main.async {
        self?.provider.reportCall(with: uuid, endedAt: nil, reason: .remoteEnded)
        self?.forget(uuid)
      }
    }
  }

  // MARK: - Appels

  private func reportIncoming(_ uuid: UUID, data: [String: Any], completion: @escaping () -> Void) {
    let name = (data["callerName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "YUMIA"
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: (data["callerId"] as? String) ?? name)
    update.localizedCallerName = name
    update.hasVideo = (data["callType"] as? String) == "video"
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false

    // Push livré deux fois : on le signale quand même (règle Apple), sans
    // effacer l'appel déjà en cours si CallKit le refuse comme doublon.
    let alreadyKnown = calls[uuid] != nil
    calls[uuid] = data
    provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
      DispatchQueue.main.async {
        guard let self else { completion(); return }
        if error != nil {
          // Ne pas déranger, appelant bloqué par iOS, doublon…
          if !alreadyKnown { self.calls[uuid] = nil }
        } else {
          let work = DispatchWorkItem { [weak self] in
            guard let self, self.calls[uuid] != nil, !self.answered.contains(uuid) else { return }
            self.provider.reportCall(with: uuid, endedAt: nil, reason: .unanswered)
            self.forget(uuid)
          }
          self.timeouts[uuid] = work
          DispatchQueue.main.asyncAfter(deadline: .now() + Self.ringTimeout, execute: work)
        }
        completion()
      }
    }
  }

  /** Annulation d'un appel inconnu : Apple exige quand même un appel affiché. */
  private func reportThenEnd(_ uuid: UUID, completion: @escaping () -> Void) {
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "YUMIA")
    update.localizedCallerName = "YUMIA"
    provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] _ in
      DispatchQueue.main.async {
        self?.provider.reportCall(with: uuid, endedAt: nil, reason: .remoteEnded)
        completion()
      }
    }
  }

  private func forget(_ uuid: UUID) {
    calls[uuid] = nil
    answered.remove(uuid)
    endedByApp.remove(uuid)
    timeouts.removeValue(forKey: uuid)?.cancel()
    if let pending = pendingAnswer?["callId"] as? String, UUID(uuidString: pending) == uuid {
      pendingAnswer = nil
    }
  }

  /** Refus avant décroché : fait ici, sans le JS ni la session (iPhone verrouillé). */
  private func decline(_ data: [String: Any]) {
    guard
      let callId = data["callId"] as? String,
      let token = data["declineToken"] as? String,
      let url = URL(string: "\(apiBaseUrl)/calls/\(callId)/decline")
    else { return }
    var req = URLRequest(url: url, timeoutInterval: 15)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token])
    var task: UIBackgroundTaskIdentifier = .invalid
    task = UIApplication.shared.beginBackgroundTask(withName: "yumia-call-decline") {
      UIApplication.shared.endBackgroundTask(task)
    }
    URLSession.shared.dataTask(with: req) { _, _, _ in
      DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(task) }
    }.resume()
  }

  private func configureAudioSession(video: Bool) {
    try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: video ? .videoChat : .voiceChat)
  }

  /**
   Prévient WebRTC que CallKit a (dés)activé la session audio — sans quoi un
   appel décroché depuis l'écran verrouillé reste muet. Appel dynamique pour
   ne pas lier ce module au pod WebRTC (fourni par react-native-webrtc).
   */
  private func notifyWebRTC(_ selector: String, _ session: AVAudioSession) {
    let sharedSel = NSSelectorFromString("sharedInstance")
    guard
      let cls: AnyClass = NSClassFromString("RTCAudioSession"),
      let method = class_getClassMethod(cls, sharedSel)
    else { return }
    typealias SharedInstance = @convention(c) (AnyClass, Selector) -> Unmanaged<AnyObject>?
    let getShared = unsafeBitCast(method_getImplementation(method), to: SharedInstance.self)
    guard
      let shared = getShared(cls, sharedSel)?.takeUnretainedValue() as? NSObject,
      shared.responds(to: NSSelectorFromString(selector))
    else { return }
    shared.perform(NSSelectorFromString(selector), with: session)
  }
}

// MARK: - PushKit

extension YumiaCallManager: PKPushRegistryDelegate {
  func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
    let token = credentials.token.map { String(format: "%02hhx", $0) }.joined()
    voipToken = token
    emit?("onVoipToken", ["token": token])
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    voipToken = nil
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    let data = payload.dictionaryPayload.reduce(into: [String: Any]()) { acc, pair in
      if let key = pair.key as? String { acc[key] = pair.value }
    }
    let uuid = (data["callId"] as? String).flatMap(UUID.init(uuidString:)) ?? UUID()

    if (data["type"] as? String) == "call_cancel" {
      if let known = calls[uuid] {
        provider.reportCall(with: uuid, endedAt: nil, reason: .remoteEnded)
        if answered.contains(uuid) { emit?("onEnd", ["callId": known["callId"] ?? ""]) }
        forget(uuid)
        completion()
      } else {
        reportThenEnd(uuid, completion: completion)
      }
      return
    }

    reportIncoming(uuid, data: data, completion: completion)
  }
}

// MARK: - CallKit

extension YumiaCallManager: CXProviderDelegate {
  func providerDidReset(_ provider: CXProvider) {
    for uuid in Array(calls.keys) { forget(uuid) }
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard let data = calls[action.callUUID] else { action.fail(); return }
    answered.insert(action.callUUID)
    timeouts.removeValue(forKey: action.callUUID)?.cancel()
    configureAudioSession(video: (data["callType"] as? String) == "video")
    var event = data
    event["action"] = "answer"
    pendingAnswer = event
    emit?("onCallAction", event)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    let uuid = action.callUUID
    if let data = calls[uuid], !endedByApp.contains(uuid) {
      if answered.contains(uuid) {
        // Raccroché depuis l'écran d'appel du système : l'app termine l'appel.
        emit?("onEnd", ["callId": data["callId"] ?? ""])
      } else {
        decline(data)
      }
    }
    forget(uuid)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    if let callId = calls[action.callUUID]?["callId"] {
      emit?("onMute", ["callId": callId, "muted": action.isMuted])
    }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    notifyWebRTC("audioSessionDidActivate:", audioSession)
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    notifyWebRTC("audioSessionDidDeactivate:", audioSession)
  }
}
