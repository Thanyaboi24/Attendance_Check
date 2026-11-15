/** English UI text: staff sign-up requests. th/signups.ts must have the same keys. */
export default {
  title: 'Sign-up requests',
  subtitle: 'Staff who signed up in the mobile app. They can sign in once an administrator approves the request.',
  tabs: {
    label: 'Request status',
    PENDING_APPROVAL: 'Pending',
    ACTIVE: 'Approved',
    REJECTED: 'Rejected',
  },
  searchPlaceholder: 'Name, staff ID, email or department',
  emptyPending: 'No sign-up requests are waiting for approval.',
  emptyPendingHint: 'New requests from the mobile app appear here.',
  empty: 'No sign-up requests found.',
  col: {
    name: 'Name',
    staffId: 'Staff ID',
    email: 'Email',
    department: 'Department',
    submitted: 'Submitted',
    reviewedBy: 'Reviewed by',
    reviewedAt: 'Reviewed at',
    note: 'Note',
    reason: 'Reason',
  },
  actions: {
    approve: 'Approve',
    reject: 'Reject',
    approveAria: 'Approve {{name}}',
    rejectAria: 'Reject {{name}}',
  },
  approve: {
    title: 'Approve sign-up request?',
    body: '{{name}} ({{email}}) will be able to sign in to the mobile app and record attendance.',
    noteLabel: 'Note to the staff member (optional)',
  },
  reject: {
    title: 'Reject sign-up request',
    body: '{{name}} ({{email}}) will not be able to sign in. They may sign up again later.',
    reasonLabel: 'Reason (required, sent to the staff member)',
  },
  flash: {
    approved: 'Approved the sign-up request of {{name}}.',
    rejected: 'Rejected the sign-up request of {{name}}.',
    alreadyReviewed: 'The sign-up request of {{name}} has already been reviewed by another administrator. The list was refreshed.',
  },
  validation: {
    reasonRequired: 'Enter a reason',
  },
} as const;
