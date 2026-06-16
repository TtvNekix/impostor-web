import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../i18n/I18nContext';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback override. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level React error boundary. Catches any unhandled render error
 * anywhere in the tree, shows a localized "something broke" panel with
 * a Reload button, and prevents the entire app from going blank.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught error', error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorFallbackPanel onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallbackPanel({ onReset }: { onReset: () => void }) {
  const t = useT();
  return (
    <div className="error-fallback">
      <div className="error-fallback__card">
        <h1 className="error-fallback__title">{t.errors.generic}</h1>
        <p className="error-fallback__text">
          {t.errors.errorBoundaryHint}
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onReset}
        >
          {t.common.retry}
        </button>
      </div>
    </div>
  );
}
