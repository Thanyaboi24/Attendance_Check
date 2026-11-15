/** English UI text: dashboard. th/dashboard.ts must have the same keys. */
export default {
  title: 'Dashboard',
  today: 'Today (Bangkok): {{date}}',
  cards: {
    activeStaff: { label: 'Active staff', hint: 'Accounts with status Active' },
    checkedInNow: { label: 'Checked in now', hint: 'Open attendance sessions' },
    checkedInToday: { label: 'Checked in today', hint: 'Staff with a session today' },
    automaticActionsToday: { label: 'Automatic actions today', hint: 'Approved after the grace period' },
    manualActionsToday: { label: 'Manual actions today', hint: 'Confirmed from the notification' },
    unresolvedRequests: { label: 'Unresolved requests', hint: 'Need review' },
    pendingCorrections: { label: 'Pending corrections', hint: 'Awaiting a decision' },
    longOpenSessions: { label: 'Long open sessions', hint: 'Sessions open unusually long' },
  },
} as const;
