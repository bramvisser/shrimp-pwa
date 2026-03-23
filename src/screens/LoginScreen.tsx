import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOperator } from '../hooks/useOperator';

export function LoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setName } = useOperator();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      setError(t('nameRequired'));
      return;
    }
    setName(trimmed);
    navigate('/home', { replace: true });
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-cover bg-bottom px-6"
      style={{ backgroundImage: 'url(/hand-shrimp-bg.jpg)' }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white/95 p-8 shadow-xl backdrop-blur">
        <img src="/logo.jpg" alt="Shrimp App" className="mx-auto mb-6 h-16 rounded-lg" />

        <p className="mb-4 text-center text-sm text-gray-500">{t('enterNameHint')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              {t('nameLabel')}
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition-colors hover:bg-blue-600 active:bg-blue-700"
          >
            {t('login')}
          </button>
        </form>
      </div>
    </div>
  );
}
