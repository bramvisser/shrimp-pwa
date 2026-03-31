import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppTopBar } from '../components/AppTopBar';
import { useOperator } from '../hooks/useOperator';
import { useLanguage } from '../hooks/useLanguage';

const LANGUAGES = [
  { code: 'en', label: 'english' },
  { code: 'th', label: 'thai' },
  { code: 'nl', label: 'dutch' },
  { code: 'es', label: 'spanish' },
  { code: 'zh', label: 'mandarin' },
] as const;

export function SettingsScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { name, clearName } = useOperator();
  const { language, setLanguage } = useLanguage();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSignOut = () => {
    clearName();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 overflow-y-auto overscroll-contain space-y-6 p-4">
        <h1 className="text-lg font-bold text-gray-800">{t('settings')}</h1>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">{t('operator')}</p>
          <p className="text-lg font-semibold text-gray-800">{name || t('nameNotSet')}</p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-gray-500">{t('language')}</p>
          <div className="space-y-2">
            {LANGUAGES.map((lang) => (
              <label
                key={lang.code}
                className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-50"
              >
                <input
                  type="radio"
                  name="language"
                  checked={language === lang.code}
                  onChange={() => setLanguage(lang.code)}
                  className="h-4 w-4 text-blue-500"
                />
                <span className="text-gray-800">{t(lang.label)}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={() => navigate('/share')}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-50 py-3 font-semibold text-blue-600 transition-colors hover:bg-blue-100"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5Z" />
          </svg>
          {t('shareApp')}
        </button>

        <button
          onClick={() => setShowConfirm(true)}
          className="w-full rounded-lg bg-red-50 py-3 font-semibold text-red-600 transition-colors hover:bg-red-100"
        >
          {t('signOut')}
        </button>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-800">{t('signOutConfirmTitle')}</h2>
            <p className="mb-6 text-gray-600">{t('signOutConfirmBody')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-600"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSignOut}
                className="flex-1 rounded-lg bg-red-500 py-2 font-medium text-white"
              >
                {t('signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
