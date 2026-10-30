import ExpoModulesCore

/**
 Enregistre PushKit dès le lancement de l'app : quand un push VoIP réveille
 une app fermée, iOS la lance en arrière-plan et le livre au registre créé
 ici. Créé plus tard (au premier rendu JS), le push serait perdu — et iOS
 sanctionne une app qui reçoit un push VoIP sans afficher d'appel.
 */
public class YumiaCallsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    YumiaCallManager.shared.start()
    return true
  }
}
