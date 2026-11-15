package th.ac.siit.attendance.scheduler

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/**
 * WorkManager helpers (design §7.6, ADR-3). WorkManager is not an exact timer: the JS side always takes a
 * fresh location fix whenever the job actually runs (DS2 §2.10.3).
 */
object AttendanceWork {
  const val TASK_GRACE = "GracePeriodTask"
  const val TASK_SYNC = "SyncTask"
  const val TASK_BOOT = "BootTask"

  const val KEY_TASK = "taskName"
  const val KEY_REQUEST_ID = "requestId"

  const val TAG_GRACE = "attendance-grace"
  const val UNIQUE_SYNC = "attendance-sync"
  const val UNIQUE_BOOT = "attendance-boot"

  /** One job per request: unique name = requestId, ExistingWorkPolicy.KEEP prevents double scheduling. */
  fun scheduleGrace(context: Context, requestId: String, delayMs: Long) {
    val request = OneTimeWorkRequestBuilder<GracePeriodWorker>()
      .setInitialDelay(delayMs.coerceAtLeast(0L), TimeUnit.MILLISECONDS)
      .setInputData(workDataOf(KEY_TASK to TASK_GRACE, KEY_REQUEST_ID to requestId))
      .setBackoffCriteria(BackoffPolicy.LINEAR, 30, TimeUnit.SECONDS)
      .addTag(TAG_GRACE)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(requestId, ExistingWorkPolicy.KEEP, request)
  }

  fun cancelGrace(context: Context, requestId: String) {
    WorkManager.getInstance(context).cancelUniqueWork(requestId)
  }

  fun cancelAllGrace(context: Context) {
    WorkManager.getInstance(context).cancelAllWorkByTag(TAG_GRACE)
  }

  /** One-off SyncTask once the network is connected (outbox replay, design §7.8). */
  fun scheduleSync(context: Context) {
    val request = OneTimeWorkRequestBuilder<GracePeriodWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setInputData(workDataOf(KEY_TASK to TASK_SYNC))
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_SYNC, ExistingWorkPolicy.KEEP, request)
  }

  /** Fallback path for the BootReceiver when the service cannot be started directly. */
  fun scheduleBoot(context: Context) {
    val request = OneTimeWorkRequestBuilder<GracePeriodWorker>()
      .setInputData(workDataOf(KEY_TASK to TASK_BOOT))
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_BOOT, ExistingWorkPolicy.REPLACE, request)
  }
}
