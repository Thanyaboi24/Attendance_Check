/** English UI text: history. Keys are the contract; th/history.ts must have the same keys. */
export default {
  status: { COMPLETED: 'Completed', OPEN: 'Open', NEEDS_REVIEW: 'Needs review', CORRECTED: 'Corrected' },
  method: { MANUAL: 'Manual', AUTOMATIC: 'Automatic', ADMIN_CORRECTED: 'Admin corrected' },
  allMethods: 'All methods',
  range: { THIS_WEEK: 'This week', LAST_7: 'Last 7 days', LAST_30: 'Last 30 days' },
  cell: { notYet: 'Not yet', unresolved: 'Unresolved', missing: 'Missing' },
  title: 'Attendance history',
  offline: 'Offline: history is loaded from the server only.',
  loadFailed: 'Could not load the history.',
  loading: 'Loading…',
  empty: 'No attendance in this range.',
  in: 'In',
  out: 'Out',
  requestCorrection: 'Request a correction',
  worked: 'Worked {{duration}}',
} as const;
