package expo.modules.yumiacalls

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import org.json.JSONObject

/**
 * Notification d'appel entrant : sonnerie du téléphone en boucle
 * (FLAG_INSISTENT), écran d'appel plein écran sur téléphone verrouillé,
 * boutons Répondre / Refuser.
 */
object IncomingCallNotifier {
  // Le son d'un canal est figé à sa création : changer de son = nouvel identifiant.
  private const val CHANNEL_ID = "yumia_calls_v1"
  private const val TAG = "yumia_call"
  /** Le serveur classe l'appel « manqué » à 60 s ; filet de sécurité si l'annulation se perd. */
  private const val RING_TIMEOUT_MS = 65_000L

  private fun notificationId(callId: String) = callId.hashCode()

  @SuppressLint("MissingPermission") // refus de l'utilisateur rattrapé par SecurityException
  fun show(context: Context, call: Map<String, String>) {
    val callId = call["callId"]?.takeIf { it.isNotEmpty() } ?: return
    ensureChannel(context)

    val name = call["callerName"]?.takeIf { it.isNotBlank() } ?: "YUMIA"
    val isVideo = call["callType"] == "video"
    val json = JSONObject(call as Map<*, *>).toString()
    val base = notificationId(callId) * 4

    val open = activityIntent(context, json, "open", base)
    val answer = activityIntent(context, json, "answer", base + 1)
    val decline = PendingIntent.getBroadcast(
      context,
      base + 2,
      Intent(context, CallActionReceiver::class.java)
        .setAction(CallActionReceiver.ACTION_DECLINE)
        .putExtra(CallStore.EXTRA_CALL, json),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(name)
      .setContentText(context.getString(if (isVideo) R.string.yumia_calls_video else R.string.yumia_calls_voice))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setTimeoutAfter(RING_TIMEOUT_MS)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)

    val person = Person.Builder().setName(name).setImportant(true).build()
    val styled = try {
      builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer).setIsVideo(isVideo)).build()
    } catch (e: Exception) {
      null
    }
    val notification = styled ?: plain(context, builder, decline, answer)
    notification.flags = notification.flags or Notification.FLAG_INSISTENT

    try {
      NotificationManagerCompat.from(context).notify(TAG, notificationId(callId), notification)
    } catch (e: SecurityException) {
      // Notifications refusées par l'utilisateur : rien à afficher.
    } catch (e: IllegalArgumentException) {
      // Certains Android refusent le style « appel » sans écran plein écran
      // autorisé : on retombe sur une notification ordinaire, qui sonne aussi.
      try {
        val fallback = plain(context, builder.setStyle(null), decline, answer)
        fallback.flags = fallback.flags or Notification.FLAG_INSISTENT
        NotificationManagerCompat.from(context).notify(TAG, notificationId(callId), fallback)
      } catch (e2: Exception) {
        Log.w("YumiaCalls", "notification d'appel impossible", e2)
      }
    }
  }

  fun cancel(context: Context, callId: String?) {
    if (callId.isNullOrEmpty()) return
    NotificationManagerCompat.from(context).cancel(TAG, notificationId(callId))
  }

  private fun plain(
    context: Context,
    builder: NotificationCompat.Builder,
    decline: PendingIntent,
    answer: PendingIntent,
  ): Notification = builder
    .addAction(0, context.getString(R.string.yumia_calls_decline), decline)
    .addAction(0, context.getString(R.string.yumia_calls_answer), answer)
    .build()

  /** Ouvre l'app (MainActivity, singleTask) avec l'appel en extra — lu par CallActivityListener. */
  private fun activityIntent(context: Context, json: String, action: String, requestCode: Int): PendingIntent {
    val launch = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent())
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra(CallStore.EXTRA_CALL, json)
      .putExtra(CallStore.EXTRA_ACTION, action)
    return PendingIntent.getActivity(
      context,
      requestCode,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.yumia_calls_channel),
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 1000, 1000)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  /** Icône de notification d'expo-notifications si l'app en a une, sinon celle de l'app. */
  private fun smallIcon(context: Context): Int {
    val res = context.resources
    val custom = res.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (custom != 0) custom else context.applicationInfo.icon
  }
}
