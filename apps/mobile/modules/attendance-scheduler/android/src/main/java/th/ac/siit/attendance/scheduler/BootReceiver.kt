package th.ac.siit.attendance.scheduler

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * After reboot / app update: run the JS `BootTask` headless, which re-registers the geofence and re-schedules
 * grace jobs of pending requests from SQLite (design §7.1, §7.6). WorkManager itself persists jobs across
 * reboots; the geofence registration of Play Services does not.
 *
 * BOOT_COMPLETED is an allowed exemption for starting a foreground service from the background; if the
 * start still fails, fall back to a WorkManager job.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      -> {
        try {
          GracePeriodHeadlessService.start(context.applicationContext, AttendanceWork.TASK_BOOT, null)
        } catch (e: Exception) {
          Log.w("AttendanceScheduler", "Boot: direct start refused, falling back to WorkManager", e)
          AttendanceWork.scheduleBoot(context.applicationContext)
        }
      }
    }
  }
}
