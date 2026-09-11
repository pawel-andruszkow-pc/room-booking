import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorPage } from '@/pages/ErrorPage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for the tablet: any uncaught error — thrown while
 * rendering, in an event handler, or an unhandled promise rejection — swaps
 * the blank screen React would otherwise leave for a page that says what
 * happened and offers a way back. Sits above the router and the stores, so
 * it still renders when either of those is what broke.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] render error', error, info.componentStack);
  }

  componentDidMount() {
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onRejection);
  }

  // Errors outside render (handlers, timers) never reach getDerivedStateFromError.
  private onWindowError = (e: ErrorEvent) => {
    this.fail(e.error instanceof Error ? e.error : new Error(e.message || 'Unknown error'));
  };

  private onRejection = (e: PromiseRejectionEvent) => {
    const reason: unknown = e.reason;
    this.fail(reason instanceof Error ? reason : new Error(String(reason ?? 'Unknown error')));
  };

  private fail(error: Error) {
    if (this.state.error) return;
    console.error('[app] uncaught error', error);
    this.setState({ error });
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) return <ErrorPage error={error} onRetry={this.retry} />;
    return this.props.children;
  }
}
