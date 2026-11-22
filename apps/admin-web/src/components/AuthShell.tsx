import { useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { Icon, type IconName } from './icons';

/**
 * Two-panel layout for the signed-out pages (sign in, forgot password, activation / reset):
 * a brand panel on the left and the form on the right. Below 900 px the brand panel becomes a compact header.
 *
 * The logo tab shows the official SIIT logo from `apps/admin-web/public/brand/siit-logo.png` (same file as the
 * mobile app's `apps/mobile/assets/brand/siit-logo.png`).
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-logo">
          <img className="auth-logo-img" src="/brand/siit-logo.png" alt="SIIT, Thammasat University" width={190} height={52} />
          <span className="auth-logo-divider" aria-hidden />
          <span className="auth-logo-text">
            <strong>{t('brand.name')}</strong>
          </span>
        </div>
        <div className="auth-brand-body">
          <h2 className="auth-brand-title">{t('brand.title')}</h2>
          <p className="auth-brand-tagline">{t('brand.tagline')}</p>
          <ul className="auth-features">
            <Feature icon="auditLog" tone="green" title={t('brand.secureTitle')} text={t('brand.secureText')} />
            <Feature icon="geofence" tone="cyan" title={t('brand.liveTitle')} text={t('brand.liveText')} />
          </ul>
        </div>
        <div className="auth-brand-art" aria-hidden />
      </aside>
      <main className="auth-main">
        <div className="auth-topbar">
          <LanguageSwitch />
        </div>
        <div className="auth-panel">{children}</div>
      </main>
    </div>
  );
}

function Feature({ icon, tone, title, text }: { icon: IconName; tone: 'green' | 'cyan'; title: string; text: string }) {
  return (
    <li className="auth-feature">
      <span className={`auth-feature-icon tone-${tone}`} aria-hidden>
        <Icon name={icon} size={24} />
      </span>
      <span>
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </li>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

/** Text input with a leading icon (the label stays outside, on the surrounding <label>). */
export function IconInput({ icon, ...rest }: InputProps & { icon: IconName }) {
  return (
    <span className="auth-input">
      <Icon name={icon} size={18} className="auth-input-icon" />
      <input {...rest} />
    </span>
  );
}

/** Password input with a lock icon and a show/hide button. */
export function PasswordInput(props: Omit<InputProps, 'type'>) {
  const { t } = useTranslation('auth');
  const [visible, setVisible] = useState(false);
  return (
    <span className="auth-input">
      <Icon name="lock" size={18} className="auth-input-icon" />
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="auth-eye"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
        aria-pressed={visible}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </span>
  );
}
