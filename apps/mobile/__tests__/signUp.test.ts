import { ApiRequestError, NetworkError } from '../src/domain/errors';
import { login } from '../src/domain/useCases/auth';
import { signUp, validateSignUp, type SignUpForm } from '../src/domain/useCases/signUp';
import { i18n, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { th } from '../src/i18n/th';
import { makeDeps } from './fakes/makeDeps';

const FORM: SignUpForm = {
  staffId: ' S100 ',
  fullName: ' Somchai Jaidee ',
  department: 'ICT',
  email: ' New.Staff@SIIT.tu.ac.th ',
  password: 'Secret123',
  confirmPassword: 'Secret123',
};

describe('signUp use case', () => {
  it('sends the normalised request and returns the email waiting for approval', async () => {
    const h = makeDeps();
    h.session.tokens = null;
    const out = await signUp(h.deps, FORM);
    expect(out).toEqual({ kind: 'SUBMITTED', email: 'new.staff@siit.tu.ac.th' });
    expect(h.authApi.signUps).toEqual([
      { staffId: 'S100', fullName: 'Somchai Jaidee', department: 'ICT', email: 'new.staff@siit.tu.ac.th', password: 'Secret123' },
    ]);
    // no tokens: the account cannot sign in until an administrator approves it
    expect(h.session.tokens).toBeNull();
  });

  it('validates every field locally (translated messages) and does not call the API', async () => {
    const h = makeDeps();
    const out = await signUp(h.deps, { staffId: '', fullName: ' ', department: '', email: 'nope', password: 'short', confirmPassword: 'other' });
    expect(out).toEqual({
      kind: 'INVALID',
      errors: {
        staffId: 'Enter your staff ID',
        fullName: 'Enter your full name',
        department: 'Enter your department',
        email: 'Enter a valid email address',
        password: 'Password must be at least 8 characters',
        confirmPassword: 'The passwords do not match.',
      },
    });
    expect(h.authApi.signUps).toHaveLength(0);
  });

  it('requires the confirmation and a password with a digit', () => {
    expect(validateSignUp({ ...FORM, confirmPassword: '' })).toEqual({ ok: false, errors: { confirmPassword: 'Enter the password again' } });
    expect(validateSignUp({ ...FORM, password: 'abcdefgh', confirmPassword: 'abcdefgh' })).toEqual({
      ok: false,
      errors: { password: 'Password must contain a digit' },
    });
  });

  it('409 DUPLICATE_USER → DUPLICATE', async () => {
    const h = makeDeps();
    h.authApi.signUp = async () => {
      throw new ApiRequestError(409, 'DUPLICATE_USER', 'An account with this email or staff ID already exists.');
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'DUPLICATE' });
  });

  it('400 email-domain restriction → field error on email with the allowed domains', async () => {
    const h = makeDeps();
    h.authApi.signUp = async () => {
      throw new ApiRequestError(400, 'VALIDATION_FAILED', 'Use your institutional email (@siit.tu.ac.th).', {
        fields: { email: ['Use your institutional email (@siit.tu.ac.th)'] },
      });
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'INVALID', errors: { email: 'Use your institutional email (@siit.tu.ac.th).' } });

    await i18n.changeLanguage('th');
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'INVALID', errors: { email: 'กรุณาใช้อีเมลของสถาบัน (@siit.tu.ac.th)' } });
  });

  it('400 with a zod issue list maps issues to fields; unknown 400 → generic invalid input', async () => {
    const h = makeDeps();
    h.authApi.signUp = async () => {
      throw new ApiRequestError(400, 'VALIDATION_FAILED', 'Request validation failed', [{ path: ['staffId'], message: 'Enter your staff ID' }]);
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'INVALID', errors: { staffId: 'Enter your staff ID' } });
    h.authApi.signUp = async () => {
      throw new ApiRequestError(400, 'VALIDATION_FAILED', 'Request validation failed');
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'ERROR', message: 'Invalid input' });
  });

  it('offline → NETWORK; 403 SIGNUP_DISABLED → DISABLED; 429 → RATE_LIMITED; 500 → generic error', async () => {
    const h = makeDeps();
    h.authApi.signUp = async () => {
      throw new NetworkError('offline');
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'NETWORK' });
    h.authApi.signUp = async () => {
      throw new ApiRequestError(403, 'SIGNUP_DISABLED', 'Sign-up is disabled.');
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'DISABLED' });
    h.authApi.signUp = async () => {
      throw new ApiRequestError(429, 'HTTP_429', 'Too Many Requests');
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'RATE_LIMITED' });
    h.authApi.signUp = async () => {
      throw new ApiRequestError(500, 'INTERNAL', 'boom');
    };
    expect(await signUp(h.deps, FORM)).toEqual({ kind: 'ERROR', message: 'Something went wrong. Please try again.' });
  });
});

describe('login with a self-registered account', () => {
  it('403 ACCOUNT_PENDING_APPROVAL → waiting for approval, nothing stored', async () => {
    const h = makeDeps();
    h.session.tokens = null;
    h.authApi.login = async () => {
      throw new ApiRequestError(403, 'ACCOUNT_PENDING_APPROVAL', 'Your account is waiting for an administrator to approve it.');
    };
    expect(await login(h.deps, 'new.staff@siit.tu.ac.th', 'Secret123')).toEqual({ kind: 'ACCOUNT_PENDING_APPROVAL' });
    expect(h.session.tokens).toBeNull();
    expect(h.geofence.running).toBeNull();
  });

  it('403 ACCOUNT_REJECTED carries the reason (or null)', async () => {
    const h = makeDeps();
    h.authApi.login = async () => {
      throw new ApiRequestError(403, 'ACCOUNT_REJECTED', 'Your account request was not approved.', { reason: 'Staff ID not found' });
    };
    expect(await login(h.deps, 'a@siit.tu.ac.th', 'Secret123')).toEqual({ kind: 'ACCOUNT_REJECTED', reason: 'Staff ID not found' });
    h.authApi.login = async () => {
      throw new ApiRequestError(403, 'ACCOUNT_REJECTED', 'Your account request was not approved.', { reason: null });
    };
    expect(await login(h.deps, 'a@siit.tu.ac.th', 'Secret123')).toEqual({ kind: 'ACCOUNT_REJECTED', reason: null });
  });
});

describe('sign-up text (en ↔ th)', () => {
  it('has Thai text for every sign-up key, using the glossary terms', async () => {
    for (const group of ['signUp', 'signUpSubmitted'] as const) {
      expect(Object.keys(th.auth[group]).sort()).toEqual(Object.keys(en.auth[group]).sort());
    }
    for (const key of ['noAccount', 'signUp', 'pendingApproval', 'rejected', 'rejectedReason', 'rejectedHint', 'signUpAgain'] as const) {
      expect(th.auth.login[key].trim()).not.toBe('');
    }
    expect(th.common.screens.signUp).toBe('สร้างบัญชี');
    expect(th.auth.signUp.staffId).toBe('รหัสบุคลากร');
    expect(th.auth.signUp.department).toBe('หน่วยงาน');
    expect(th.auth.signUp.confirmPassword).toBe('ยืนยันรหัสผ่าน');
    expect(th.auth.login.pendingApproval).toContain('รออนุมัติ');

    await i18n.changeLanguage('th');
    expect(t('auth:signUpSubmitted.emailNotice', { email: 'a@siit.tu.ac.th' })).toContain('a@siit.tu.ac.th');
    expect(validateSignUp({ ...FORM, staffId: '' })).toEqual({ ok: false, errors: { staffId: 'กรุณากรอกรหัสบุคลากร' } });
    // no polite particles
    for (const v of [...Object.values(th.auth.signUp), ...Object.values(th.auth.signUpSubmitted)]) expect(v).not.toMatch(/ค่ะ|ครับ/);
  });
});
