/** English UI text: onboarding. Keys are the contract; th/onboarding.ts must have the same keys. */
export default {
  intro: {
    kicker: 'Step 1 of 2',
    title: 'How attendance works',
    continue: 'Continue',
    points: {
      monitoring: {
        title: 'Location monitoring',
        body:
          'While you are signed in, Android watches one circle around the faculty building (geofence). Entering or leaving ' +
          'it does not record attendance by itself — it only starts a check-in or check-out request.',
      },
      confirm: {
        title: 'You confirm first',
        body:
          'You get a notification with Check in / Check out. Tapping it opens the app, takes a fresh, precise location ' +
          'reading and sends it to the server. Attendance is only "Recorded" after the server approves it.',
      },
      automatic: {
        title: 'Automatic attendance',
        body:
          'If you do not respond within the grace period (normally 5 minutes), the app takes a NEW location reading. ' +
          'Only a reading that clearly confirms you are still inside (check-in) or still outside (check-out) is recorded ' +
          'automatically. Uncertain readings are never recorded automatically.',
      },
      dismiss: {
        title: 'What "Dismiss" means',
        body:
          'Dismiss only hides the notification. It does NOT cancel the request: automatic attendance can still happen ' +
          'after the grace period if your location is confirmed.',
      },
      privacy: {
        title: 'Privacy',
        body:
          'Only the location readings used for a check-in/check-out decision are sent to the server. There is no ' +
          'continuous tracking or travel history. The map view stays on your phone.',
      },
      signOut: {
        title: 'Signing out',
        body: 'Signing out stops monitoring. An open session stays open — you will not be checked out automatically.',
      },
    },
  },
  permissions: {
    kicker: 'Step 2 of 2',
    title: 'Turn on attendance monitoring',
    subtitle_one:
      "The app asks you to check in when you enter the faculty area and to check out when you leave. If you don't respond within {{count}} minutes, it checks your location again before recording automatically.",
    subtitle_other:
      "The app asks you to check in when you enter the faculty area and to check out when you leave. If you don't respond within {{count}} minutes, it checks your location again before recording automatically.",
    allowed: 'Allowed',
    needed: 'Needed',
    off: 'Off',
    recommended: 'Recommended',
    allow: 'Allow',
    openSettings: 'Open settings',
    notifications: { title: 'Notifications', body: 'Shows check-in and check-out requests.' },
    precise: {
      title: 'Precise location',
      body: 'Needed to tell whether you are inside the attendance area.',
      approximateBody: 'Only approximate location is allowed, so every reading would be “Uncertain”. Choose “Precise” in Settings.',
    },
    background: { title: 'Background location', body: 'Detects entry and exit while the app is closed. Choose “Allow all the time”.' },
    services: { title: 'Location services', body: 'Location is turned off on this phone.' },
    battery: {
      title: 'Battery optimisation',
      body: 'Some phones (Xiaomi, Oppo, Samsung…) stop background work. Set this app to “Unrestricted” so detection and the automatic check run on time.',
    },
    warning: {
      notifications: 'Notifications must be allowed.',
      precise: 'Precise location must be allowed.',
      background: 'Background location must be set to “Allow all the time”.',
      services: 'Location must be turned on for this phone.',
    },
    /** <b>…</b> is shown in bold; the specific warning follows. */
    notActive: 'Monitoring is <b>not active</b> yet.',
    noScheduler: 'The background scheduler is not part of this build, so automatic attendance after the grace period is unavailable.',
    start: 'Start monitoring',
    continueLimited: 'Continue with limited monitoring',
    monitoringActive: 'Monitoring active',
    footer: 'Your location is checked only for attendance. No travel history is stored.',
  },
} as const;
