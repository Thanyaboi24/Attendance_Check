/** English UI text: errors. Keys are the contract; th/errors.ts must have the same keys. */
export default {
  network: 'Cannot reach the server.',
  networkUnavailable: 'Network unavailable',
  signInAgain: 'Please sign in again',
  generic: 'Something went wrong. Please try again.',
  /** Messages of the shared zod schemas, translated at display time (validationMessage). */
  validation: {
    email: 'Enter a valid email address',
    institutionalEmail: 'Use your institutional email ({{domains}})',
    passwordRequired: 'Enter your password',
    passwordMin: 'Password must be at least 8 characters',
    passwordLetter: 'Password must contain a letter',
    passwordDigit: 'Password must contain a digit',
    staffIdRequired: 'Enter your staff ID',
    fullNameRequired: 'Enter your full name',
    departmentRequired: 'Enter your department',
    invalidInput: 'Invalid input',
  },
} as const;
