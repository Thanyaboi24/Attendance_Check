import { z } from 'zod';
import { t } from '../i18n';

/**
 * Form validation messages in the current language.
 * Messages are zod `error` callbacks, so they are looked up when a form is validated (never frozen at
 * import time). The shared schemas in @attendance/shared stay English; admin forms override them here.
 */
export const msg = (text: () => string) => ({ error: text });

// Fallback for rules declared without a message (e.g. `.max(120)`): friendly, translated text instead
// of zod's built-in English. Explicit messages on a schema always win over this.
z.config({
  customError: (iss) => {
    switch (iss.code) {
      case 'too_small':
        if (iss.origin === 'string')
          return Number(iss.minimum) <= 1 ? t('common:validation.required') : t('common:validation.minLength', { count: Number(iss.minimum) });
        if (iss.origin === 'array') return t('common:validation.minItems', { count: Number(iss.minimum) });
        return t('common:validation.minValue', { min: String(iss.minimum) });
      case 'too_big':
        if (iss.origin === 'string') return t('common:validation.maxLength', { count: Number(iss.maximum) });
        if (iss.origin === 'array') return t('common:validation.maxItems', { count: Number(iss.maximum) });
        return t('common:validation.maxValue', { max: String(iss.maximum) });
      case 'invalid_type':
        if (iss.expected === 'number') return t('common:validation.enterNumber');
        if (iss.expected === 'int') return t('common:validation.wholeNumber');
        return t('common:validation.invalidInput');
      case 'invalid_format':
        if (iss.format === 'email') return t('common:validation.invalidEmail');
        return t('common:validation.invalidInput');
      case 'invalid_value':
        return t('common:validation.chooseOption');
      default:
        return undefined;
    }
  },
});

/** Trimmed, lower-cased institutional email (same rule as the shared `NormalisedEmail`). */
export const emailField = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email(msg(() => t('common:validation.invalidEmail'))));

export const requiredText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, msg(() => t('common:validation.required')))
    .max(max);
