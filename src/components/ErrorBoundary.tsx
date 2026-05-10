import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Something went wrong.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <h1 className="error-boundary-title">We hit a snag</h1>
            <p className="error-boundary-body">
              The interface crashed while rendering. Your save may still be intact—try reloading the page. If this
              keeps happening, clear site data for this domain and start fresh.
            </p>
            <pre className="error-boundary-detail">{this.state.message}</pre>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
