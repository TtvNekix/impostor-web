import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import en from './en';
import es from './es';

export type Locale = 'en' | 'es';

/**
 * Both dictionaries MUST have the same nested shape. We treat the
 * Spanish file as canonical and recursively type the English file to
 * match — the `as const` on each side produces literal types that
 * wouldn't be assignable to each other otherwise.
 */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type Translations = DeepStringify<typeof es>;

const dictionaries: Record<Locale, Translations> = {
  en: en as unknown as Translations,
  es: es as unknown as Translations,
};
const STORAGE_KEY = 'impostor.locale';
const SUPPORTED: Locale[] = ['en', 'es'];

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Detect the user's preferred locale from the browser, falling back to 'en'. */
function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved && SUPPORTED.includes(saved)) return saved;
  const browser = (navigator.language || 'en').toLowerCase();
  if (browser.startsWith('es')) return 'es';
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // localStorage might be unavailable (private mode, etc.) — ignore.
    }
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: dictionaries[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Returns the current translation dictionary. */
export function useT(): Translations {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used inside I18nProvider');
  return ctx.t;
}

/** Returns the current locale code. */
export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useLocale must be used inside I18nProvider');
  return ctx.locale;
}

/** Returns a setter to change the active locale. */
export function useSetLocale(): (l: Locale) => void {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useSetLocale must be used inside I18nProvider');
  return ctx.setLocale;
}
