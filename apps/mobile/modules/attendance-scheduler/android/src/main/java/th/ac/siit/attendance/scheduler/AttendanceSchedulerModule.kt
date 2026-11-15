package th.ac.siit.attendance.scheduler

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Expo module `AttendanceScheduler` (JS: modules/attendance-scheduler/index.ts). */
class AttendanceSchedulerModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AttendanceScheduler")

    Function("isAvailable") { true }

    AsyncFunction("schedule") { requestId: String, delayMs: Double ->
      AttendanceWork.scheduleGrace(context, requestId, delayMs.toLong())
    }

    AsyncFunction("cancel") { requestId: String ->
      AttendanceWork.cancelGrace(context, requestId)
    }

    AsyncFunction("cancelAll") {
      AttendanceWork.cancelAllGrace(context)
    }

    AsyncFunction("scheduleSync") {
      AttendanceWork.scheduleSync(context)
    }
  }
}
