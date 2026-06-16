import { useState, useEffect, useRef } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useToastStore } from '../stores/toastStore';
import { useT, useLocale, useSetLocale } from '../i18n/I18nContext';
import { LanguageSelector } from '../components/LanguageSelector';
import { navigate } from '../lib/router';

interface JoinPageProps {
  /** The normalized room code extracted from the URL. */
  code: string;
  /** From useSocket(). */
  joinRoom: (payload: { code: string; username: string }) => void;
}

/**
 * Landing page for `/join/{code}` deep links. Lets the visitor enter
 * a username and join the room directly. On a join error (room not
 * found, room full, etc.) we surface a toast and bounce back to the
 * entry page so the user can recover.
 */
export function JoinPage({ code, joinRoom }: JoinPageProps) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const error = useConnectionStore((s) => s.error);
  const clearError = useConnectionStore((s) => s.clearError);
  const pushToast = useToastStore((s) => s.push);

  // Ref to avoid re-firing toast + redirect on the same error
  const errorHandledRef = useRef(false);

  // When the server reports a join error, show toast and bounce to entry
  useEffect(() => {
    if (error && !errorHandledRef.current) {
      errorHandledRef.current = true;
      pushToast({ message: error, variant: 'error' });
      // Clear the error so the entry page doesn't display it inline
      clearError();
      // Redirect after a tick so the toast has a chance to render
      setTimeout(() => navigate('/'), 100);
    }
  }, [error, clearError, pushToast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name || submitting) return;
    // Reset the "already errored" flag for a fresh attempt
    errorHandledRef.current = false;
    setSubmitting(true);
    joinRoom({ code, username: name });
    // Re-enable after a short delay in case of network failure
    setTimeout(() => setSubmitting(false), 3000);
  };

  const handleBack = () => navigate('/');

  return (
    <div className="join-page">
      {/* Top bar: back button + language selector */}
      <div className="join-page__topbar">
        <button
          type="button"
          className="join-page__back"
          onClick={handleBack}
        >
          ← {t.join.back}
        </button>
        <LanguageSelector current={locale} onChange={setLocale} />
      </div>

      {/* Head: title with code chip + subtitle */}
      <header className="join-page__head">
        <h1 className="join-page__title">
          {t.join.title.replace('{code}', '').trim()}
        </h1>
        <span className="join-page__code-chip">{code}</span>
        <p className="join-page__subtitle">{t.join.subtitle}</p>
      </header>

      {/* Username form */}
      <form onSubmit={handleSubmit} className="join-page__form">
        <div className="join-page__field">
          <label htmlFor="join-username">{t.lobby.enterUsername}</label>
          <input
            id="join-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            autoComplete="off"
            autoFocus
            placeholder={t.lobby.enterUsername}
            className="input"
          />
        </div>
        <button
          type="submit"
          disabled={!username.trim() || submitting}
          className="btn btn--primary btn--block"
        >
          {t.join.submit}
        </button>
      </form>
    </div>
  );
}
