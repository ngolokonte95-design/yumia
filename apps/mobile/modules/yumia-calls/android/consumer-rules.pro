# CallMessagingService transmet à expo-notifications, par réflexion, tous les
# push qui ne sont pas des appels : R8 ne doit ni renommer ni retirer ce délégué.
-keep class expo.modules.notifications.service.delegates.FirebaseMessagingDelegate {
  public <init>(android.content.Context);
  public *;
}
