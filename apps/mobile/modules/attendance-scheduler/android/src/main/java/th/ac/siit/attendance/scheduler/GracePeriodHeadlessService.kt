package th.ac.siit.attendance.scheduler

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs a JS headless task (GracePeriodTask / SyncTask / BootTask) as a foreground service of type `location`
 * (design §7.3: a stable background fix needs a location foreground service on some devices). The
 * notification uses the low-importance channel `location_check` ("Checking your location…").
 */
class GracePeriodHeadlessService : HeadlessJsTaskService() {

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      goForeground(intent?.getStringExtra(AttendanceWork.KEY_TASK))
    } catch (e: Exception) {
      // e.g. SecurityException when location permission was revoked; the task still runs if Android allows it.
      Log.w("AttendanceScheduler", "startForeground failed", e)
    }
    return super.onStartCommand(intent, flags, startId)
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val taskName = intent?.getStringExtra(AttendanceWork.KEY_TASK) ?: return null
    val data = Arguments.createMap()
    intent.getStringExtra(AttendanceWork.KEY_REQUEST_ID)?.let { data.putString("requestId", it) }
    // Up to 3 fixes (~20 s each) + 2 × 30 s retry delays + network calls must fit.
    return HeadlessJsTaskConfig(taskName, data, TASK_TIMEOUT_MS, true)
  }

  override fun onDestroy() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun goForeground(taskName: String?) {
    ensureChannel(this)
    val text = when (taskName) {
      AttendanceWork.TASK_SYNC -> "Synchronising attendance…"
      AttendanceWork.TASK_BOOT -> "Restoring attendance monitoring…"
      else -> "Checking your location…"
    }
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Faculty Attendance")
      .setContentText(text)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
  }

  companion object {
    const val CHANNEL_ID = "location_check"
    private const val NOTIFICATION_ID = 0x5117
    private const val TASK_TIMEOUT_MS = 4 * 60_000L

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Location check", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shown while the app verifies your location in the background"
          },
        )
      }
    }

    /** Throws (e.g. ForegroundServiceStartNotAllowedException) when Android refuses a background start. */
    fun start(context: Context, taskName: String, requestId: String?) {
      val intent = Intent(context, GracePeriodHeadlessService::class.java).apply {
        putExtra(AttendanceWork.KEY_TASK, taskName)
        if (requestId != null) putExtra(AttendanceWork.KEY_REQUEST_ID, requestId)
      }
      ContextCompat.startForegroundService(context, intent)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    }
  }
}
