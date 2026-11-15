import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAME, LANGUAGES, setLanguage, type Language } from './index';

/** Two-button language toggle (each label in its own language, so either reader can find it). */
export function LanguageSwitch({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  return (
    <div className={`lang-switch ${className ?? ''}`} role="group" aria-label="Language / ภาษา">
      {LANGUAGES.map((l: Language) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={`btn btn-small${i18n.language === l ? ' btn-primary' : ' btn-ghost'}`}
          aria-pressed={i18n.language === l}
          onClick={() => void setLanguage(l)}
        >
          {LANGUAGE_NAME[l]}
        </button>
      ))}
    </div>
  );
}
