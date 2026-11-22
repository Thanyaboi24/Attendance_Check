/**
 * English UI text: notifications. Keys are the contract; th/notifications.ts must have the same keys.
 * Request texts mirror NOTIFICATION_TEXT in packages/shared (kept there for the API / docs).
 */
export default {
  channels: {
    requests: { name: 'Attendance confirmation', description: 'Check-in / check-out confirmation requests' },
    results: { name: 'Attendance results' },
    locationCheck: { name: 'Location check', description: 'Shown while the app verifies your location in the background' },
  },
  actions: {
    checkIn: 'Check In',
    checkOut: 'Check Out',
    dismiss: 'Dismiss',
  },
  request: {
    checkIn: {
      title: 'Please confirm your check-in',
      body:
        'You appear to be within the faculty attendance area. ' +
        'If you do not respond within {{minutes}} minutes, the system will attempt automatic check-in after verifying your location again.',
    },
    checkOut: {
      title: 'Please confirm your check-out',
      body:
        'You appear to have left the faculty attendance area. ' +
        'If you do not respond within {{minutes}} minutes, the system will attempt automatic check-out after verifying your location again.',
    },
  },
  /** Result of the automatic decision after the grace period (evaluateAutoAttendance). */
  result: {
    checkIn: {
      queuedTitle: 'Pending synchronization',
      queuedBody: 'Your automatic check-in decision is saved on this phone and will be sent when the connection returns. It is not recorded yet.',
      recordedTitle: 'Automatic check-in recorded',
      recordedBody: 'Recorded at {{time}} (Bangkok time) after verifying your location again.',
      cancelledTitle: 'No check-in',
      cancelledBody: 'Your location was confirmed on the other side of the attendance area, so no check-in was recorded.',
      rejectedTitle: 'Check-in not recorded',
      rejectedBody: 'The server rejected the request ({{reason}}). You can submit a correction request.',
      unresolvedTitle: 'Check-in unresolved',
    },
    checkOut: {
      queuedTitle: 'Pending synchronization',
      queuedBody: 'Your automatic check-out decision is saved on this phone and will be sent when the connection returns. It is not recorded yet.',
      recordedTitle: 'Automatic check-out recorded',
      recordedBody: 'Recorded at {{time}} (Bangkok time) after verifying your location again.',
      cancelledTitle: 'No check-out',
      cancelledBody: 'Your location was confirmed on the other side of the attendance area, so no check-out was recorded.',
      rejectedTitle: 'Check-out not recorded',
      rejectedBody: 'The server rejected the request ({{reason}}). You can submit a correction request.',
      unresolvedTitle: 'Check-out unresolved',
    },
    rejectedFallback: 'rejected',
    unresolvedNotification:
      'The confirmation notification could not be shown, so no automatic attendance was recorded. Open the app to check in/out manually.',
    unresolvedLocation: 'Your location could not be verified, so nothing was recorded. Open the app to retry or submit a correction request.',
  },
  /** Check-in refused / cancelled because today is a holiday. */
  holiday: {
    title: 'Holiday — no need to come in today',
    body: 'Today is {{name}}. Check-in is closed, so no attendance is needed.',
    bodyNoName: 'Today is a holiday. Check-in is closed, so no attendance is needed.',
  },
} as const;
