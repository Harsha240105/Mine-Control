import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          backgroundColor: '#1e1e1e',
          color: '#ff5555',
          fontFamily: 'monospace',
          height: '100vh',
          width: '100vw',
          overflow: 'auto',
          boxSizing: 'border-box'
        }}>
          <h1 style={{ color: '#ff5555', borderBottom: '1px solid #ff5555', paddingBottom: '1rem' }}>
            Fatal React Render Error
          </h1>
          <h2>{this.state.error?.toString()}</h2>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }} open>
            <summary style={{ cursor: 'pointer', marginBottom: '1rem', color: '#aaaaaa' }}>Component Stack Trace</summary>
            {this.state.errorInfo?.componentStack}
          </details>
          {this.state.error?.stack && (
            <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }} open>
              <summary style={{ cursor: 'pointer', marginBottom: '1rem', color: '#aaaaaa' }}>Error Stack</summary>
              {this.state.error.stack}
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
