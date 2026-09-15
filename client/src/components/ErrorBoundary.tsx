import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          padding: '24px',
          margin: '16px auto',
          maxWidth: '600px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '12px',
          color: '#fca5a5',
          textAlign: 'center',
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#ef4444' }}>
            ⚠️ Komponentin latauksessa tapahtui virhe
          </h3>
          <p style={{ fontSize: '13px', margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>
            {this.state.error?.message || 'Tuntematon virhe'}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            🔄 Lataa sivu uudelleen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
