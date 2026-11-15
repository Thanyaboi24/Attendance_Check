/** English UI text: audit log. th/audit.ts must have the same keys. */
export default {
  title: 'Audit log',
  subtitle: 'Every administrative change with its previous and new values.',
  filters: {
    entityType: 'Entity type',
    action: 'Action',
    entityId: 'Entity ID',
  },
  empty: 'No audit entries match these filters.',
  col: {
    time: 'Time',
    actor: 'Actor',
    action: 'Action',
    entity: 'Entity',
    reason: 'Reason',
  },
  showValues: 'Show values',
  hideValues: 'Hide values',
  previousValues: 'Previous values',
  newValues: 'New values',
} as const;
