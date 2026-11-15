import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { i18n } from '../i18n';

// Tests run in English unless a test switches language explicitly.
void i18n.changeLanguage('en');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  if (i18n.language !== 'en') void i18n.changeLanguage('en');
});
