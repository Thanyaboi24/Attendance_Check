/** English UI text: reports (CSV exports). th/reports.ts must have the same keys. */
export default {
  title: 'Reports',
  subtitle: 'CSV exports; dates are Bangkok calendar days and times are Bangkok time.',
  departmentOptional: 'Department (attendance report, optional)',
  invalidRange: 'Choose a valid date range (“From” not after “To”).',
  preparing: 'Preparing…',
  csvNote: 'Column headings and values in the CSV files are in English.',
  attendance: {
    title: 'Attendance report',
    description: 'One row per session: staff, check-in/out times and methods, corrections.',
    download: 'Download attendance.csv',
  },
  evaluation: {
    title: 'Evaluation report',
    description:
      'One row per attendance request with every timestamp, device, configuration version, distance and classification (DS2 chapter 3 metrics).',
    download: 'Download evaluation.csv',
  },
} as const;
