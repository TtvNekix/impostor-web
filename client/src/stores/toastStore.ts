import { create } from 'zustand';
import { useT } from '../i18n/I18nContext';

export type ToastVariant = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Optional i18n code to resolve the message client-side. */
  code?: string;
  /** Optional data to interpolate into the message. */
  data?: Record<string, string | number>;
  /** Auto-dismiss after N ms. 0 means sticky (no auto-dismiss). */
  durationMs: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;
const nextId = () => `t-${Date.now()}-${++counter}`;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId();
    const duration = toast.durationMs ?? 3500;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, durationMs: duration }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clear: () => {
    set({ toasts: [] });
  },
}));

/**
 * Resolve a toast code to a localized message using the active i18n
 * dictionary. Falls back to the raw `message` if no code or the code
 * isn't in the errors map.
 */
export function useResolveToastMessage(): (
  toast: Pick<Toast, 'code' | 'message' | 'data'>,
) => string {
  const t = useT();
  return (toast) => {
    if (toast.code) {
      const tmpl = (t.errors as Record<string, string | undefined>)[toast.code];
      if (tmpl) {
        if (toast.data) {
          return tmpl.replace(/\{(\w+)\}/g, (_, k) => String(toast.data![k] ?? `{${k}}`));
        }
        return tmpl;
      }
    }
    return toast.message;
  };
}
