/** English UI text: common. Keys are the contract; th/common.ts must have the same keys. */
export default {
  appName: 'Faculty Attendance System',
  tabs: {
    home: 'Home',
    history: 'History',
    requests: 'Requests',
  },
  screens: {
    forgotPassword: 'Forgot password',
    activate: 'Activate account',
    resetPassword: 'Reset password',
    signUp: 'Create an account',
    signUpSubmitted: 'Request sent',
    location: 'Location',
    correction: 'Request a correction',
    settings: 'Settings',
  },
  /** Display statuses (src/domain/displayStatus.ts). */
  displayStatus: {
    RECORDED: 'Recorded',
    PENDING: 'Pending',
    UNCERTAIN_LOCATION: 'Uncertain location',
    FAILED: 'Failed',
    UNSYNCHRONIZED: 'Pending synchronization',
    CANCELLED: 'Cancelled',
  },
  statusA11y: 'Status: {{label}}',
  /** Attendance state (AttendanceState enum). */
  state: {
    CHECKED_OUT: 'Checked out',
    PENDING_CHECK_IN: 'Pending check-in',
    CHECKED_IN: 'Checked in',
    PENDING_CHECK_OUT: 'Pending check-out',
  },
  monitoring: {
    active: 'Monitoring active',
    activeWithVersion: 'Monitoring active (area v{{version}})',
    limited: 'Monitoring is limited:',
    fix: 'Fix',
    missing: {
      NOTIFICATIONS: 'Notifications are off — you will not be asked to confirm and no automatic attendance can happen.',
      FOREGROUND_LOCATION: 'Location permission is missing — attendance cannot be detected.',
      PRECISE_LOCATION: 'Only approximate location is allowed — every reading will be "Uncertain".',
      BACKGROUND_LOCATION: '"Allow all the time" location is missing — entering/leaving is not detected in the background.',
      LOCATION_SERVICES: 'Location services are turned off.',
      GEOFENCE_CONFIG: 'The attendance area could not be loaded yet (no connection).',
      GEOFENCE_REGISTRATION: 'The attendance area could not be registered with Android.',
    },
  },
  /** Resolution / error codes (reasonText). */
  reason: {
    UNCERTAIN_LOCATION: 'Your location could not be verified (accuracy too low, reading too old, or near the boundary).',
    LOCATION_UNAVAILABLE: 'No location fix could be obtained (location services off, permission missing or timeout).',
    NOTIFICATION_FAILED: 'The confirmation notification could not be shown, so automatic attendance was not allowed.',
    INVALID_STATE: 'Your attendance state changed before this request finished.',
    CONFIRMED_OPPOSITE_SIDE: 'You were confirmed on the other side of the attendance area.',
    MOCK_LOCATION: 'A mock (simulated) location was detected. The request was rejected.',
    SESSION_ALREADY_OPEN: 'You are already checked in.',
    NO_OPEN_SESSION: 'You are not checked in.',
    ACTIVE_REQUEST_EXISTS: 'Another attendance request is still pending.',
    SUPERSEDED: 'Replaced by a newer request.',
    LOCATION_NOT_CONFIRMED: 'The server could not confirm your location for this request.',
    CONFIG_VERSION_UNKNOWN: 'The geofence configuration used by this request is unknown to the server.',
  },
  /** Why a reading is uncertain (uncertainReasonText). */
  uncertainReason: {
    STALE_READING: 'The location reading was too old.',
    LOW_ACCURACY: 'The location accuracy was too low (more than the allowed uncertainty).',
    STRADDLES_BOUNDARY: 'You are too close to the boundary to be sure which side you are on.',
    MISSING_DATA: 'The location reading was incomplete.',
    OTHER: 'Your location was not on the expected side of the attendance area.',
  },
  loading: 'Loading',
} as const;
