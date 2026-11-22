/** English UI text: holidays (holiday calendar). Keys are the contract; th/holidays.ts must have the same keys. */
export default {
  title: 'Holidays',
  subtitle: 'Public holidays and university closures',
  add: 'Add holiday',
  info: {
    title: 'No check-in on these days',
    body: "On these days staff don't need to come in: check-in is closed in the app; check-out stays open.",
  },
  year: {
    label: 'Year',
    previous: 'Previous year',
    next: 'Next year',
    thisYear: 'This year',
    count_one: '{{count}} holiday in {{year}}',
    count_other: '{{count}} holidays in {{year}}',
  },
  month: {
    count_one: '{{count}} day',
    count_other: '{{count}} days',
  },
  empty: 'No holidays in {{year}} yet.',
  emptyHint: 'Use “Add holiday” to enter the days from the Cabinet announcement or university closures.',
  status: {
    today: 'Today',
    next: 'Next',
    past: 'Past',
  },
  actions: {
    edit: 'Edit',
    editAria: 'Edit {{name}}',
    delete: 'Delete',
    deleteAria: 'Delete {{name}}',
  },
  form: {
    addTitle: 'Add holiday',
    editTitle: 'Edit holiday',
    date: 'Date',
    type: 'Type',
    nameEn: 'English name',
    nameTh: 'Thai name',
    note: 'Note (optional)',
    notePlaceholder: 'e.g. source of the announcement',
    add: 'Add holiday',
    save: 'Save changes',
  },
  validation: {
    date: 'Choose a date',
    nameEn: 'Enter the English name',
    nameTh: 'Enter the Thai name',
    dateTaken: 'This date already has a holiday: {{name}}. Edit that one instead or choose another date.',
  },
  confirm: {
    deleteTitle: 'Delete holiday?',
    deleteBody: 'Delete “{{name}}” on {{date}}? Check-in will open again on that day.',
  },
  flash: {
    added: 'Added “{{name}}” on {{date}}.',
    saved: 'Saved “{{name}}”.',
    deleted: 'Deleted “{{name}}”.',
  },
} as const;
