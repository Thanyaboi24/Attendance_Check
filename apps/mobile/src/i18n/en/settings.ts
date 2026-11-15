/** English UI text: settings. Keys are the contract; th/settings.ts must have the same keys. */
export default {
  language: {
    /** Shown in both languages so a user who cannot read the current one still finds it. */
    title: 'Language / ภาษา',
    a11y: 'App language',
  },
  account: {
    signedIn: 'Signed in',
  },
  permissions: {
    title: 'Permissions & monitoring',
    active: 'Monitoring active',
    limited: 'Monitoring limited — tap to review',
  },
  sync: {
    title: 'Synchronise now',
    summary: '{{pending}} pending · {{failed}} failed',
  },
  evaluation: {
    title: 'Evaluation log',
    subtitle: 'Timestamps of every detection, notification, fix and decision',
    requestsCsv: 'Requests CSV',
    eventsCsv: 'Events CSV',
    json: 'JSON',
  },
  about: {
    title: 'About',
    version: 'Version {{version}} ({{build}}) · {{variant}}',
    api: 'API: {{url}}',
    area: 'Area: {{text}}',
    areaSummary: '{{name}} v{{version}}, grace {{grace}} s',
    zone: '· {{name}}: radius {{radius}} m',
    notLoaded: 'not loaded',
    lastSync: 'Last server sync: {{time}}',
    scheduler: 'Background scheduler: {{value}}',
    schedulerAvailable: 'available',
    schedulerMissing: 'NOT available in this build',
    maps: 'Google Maps: {{value}}',
    mapsConfigured: 'configured',
    mapsMissing: 'not configured (text fallback)',
  },
  signOut: {
    button: 'Sign out',
    title: 'Sign out?',
    stopsMonitoring: 'Signing out stops location monitoring on this phone.',
    openSession: 'You are checked in since {{time}}. Your session stays open and you will NOT be checked out automatically.',
    pendingRequest: 'A pending check-in/check-out request will not be completed automatically.',
    unsynced_one:
      '{{count}} item(s) are not synchronised yet. The app will try to send them now; anything that cannot be sent is discarded.',
    unsynced_other:
      '{{count}} item(s) are not synchronised yet. The app will try to send them now; anything that cannot be sent is discarded.',
    stay: 'Stay signed in',
    confirm: 'Sign out',
  },
} as const;
