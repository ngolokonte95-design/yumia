package expo.modules.yumiacalls

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/**
 * Lit l'appel joint à l'intent dès la création de l'activité — avant le JS —
 * pour l'afficher sans délai par-dessus l'écran verrouillé.
 */
class YumiaCallsPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(CallActivityListener())
}

private class CallActivityListener : ReactActivityLifecycleListener {
  private var activity: WeakReference<Activity>? = null

  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    this.activity = WeakReference(activity)
    CallStore.handleIntent(activity, activity.intent)
  }

  override fun onNewIntent(intent: Intent): Boolean {
    activity?.get()?.let { CallStore.handleIntent(it, intent) }
    return false
  }
}
