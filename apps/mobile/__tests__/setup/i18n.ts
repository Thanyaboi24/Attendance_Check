// Tests run in English unless a test switches language explicitly (and switches back).
import { i18n } from '../../src/i18n';

void i18n.changeLanguage('en');
afterEach(() => {
  if (i18n.language !== 'en') void i18n.changeLanguage('en');
});
