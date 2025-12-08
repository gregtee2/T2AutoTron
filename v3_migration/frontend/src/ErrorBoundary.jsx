import React from 'react';

/**
 * ErrorBoundary - Catches React errors and displays a fallback UI
 * Prevents one broken component from crashing the entire app
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Optionally send to error reporting service
    // TODO: Add server-side error logging endpoint
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#1a1a2e',
          color: '#eee',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{
            backgroundColor: '#252540',
            borderRadius: '12px',
            padding: '40px',
            maxWidth: '500px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
            <h1 style={{ 
              fontSize: '24px', 
              marginBottom: '16px',
              color: '#ff6b6b'
            }}>
              Something went wrong
            </h1>
            <p style={{ 
              fontSize: '14px', 
              color: '#aaa',
              marginBottom: '24px',
              lineHeight: '1.5'
            }}>
              The editor encountered an error and couldn't continue. 
              This might be caused by a corrupted graph or a plugin issue.
            </p>
            
            {this.state.error && (
              <details style={{
                textAlign: 'left',
                backgroundColor: '#1a1a2e',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '24px',
                fontSize: '12px',
                color: '#888'
              }}>
                <summary style={{ cursor: 'pointer', color: '#aaa', marginBottom: '8px' }}>
                  Error Details
                </summary>
                <pre style={{ 
                  overflow: 'auto', 
                  maxHeight: '150px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  backgroundColor: '#3a3a5c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#4a4a6c'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#3a3a5c'}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  backgroundColor: '#4dabf7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#339af0'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#4dabf7'}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
