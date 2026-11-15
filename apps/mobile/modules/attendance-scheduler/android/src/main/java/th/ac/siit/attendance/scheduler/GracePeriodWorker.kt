package th.ac.siit.attendance.scheduler

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * GracePeriodWorker (design §7.6): when WorkManager fires, start [GracePeriodHeadlessService], which runs the
 * JS headless task named in the input data (`GracePeriodTask` with `{ requestId }`, `SyncTask` or `BootTask`).
 *
 * The worker returns as soon as the service is started (the work is then "completed"), so the JS side may
 * re-schedule the same unique name (e.g. WAIT → schedule again) without being blocked by ExistingWorkPolicy.KEEP.
 *
 * Starting a foreground service from the background is restricted on Android 12+ unless the app is exempt
 * (e.g. battery optimisation disabled — the permission screen asks for it). If the start is refused the work
 * is retried with backoff (max [MAX_ATTEMPTS]); the JS side always re-validates with a fresh fix, so a late
 * run is safe.
 */
class GracePeriodWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val taskName = inputData.getString(AttendanceWork.KEY_TASK) ?: return Result.failure()
    val requestId = inputData.getString(AttendanceWork.KEY_REQUEST_ID)
    return try {
      GracePeriodHeadlessService.start(applicationContext, taskName, requestId)
      Result.success()
    } catch (e: Exception) {
      Log.w(TAG, "Could not start headless service for $taskName (attempt $runAttemptCount)", e)
      if (runAttemptCount + 1 < MAX_ATTEMPTS) Result.retry() else Result.failure()
    }
  }

  companion object {
    private const val TAG = "AttendanceScheduler"
    private const val MAX_ATTEMPTS = 5
  }
}
