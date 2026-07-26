import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Error caught by boundary:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Plain inline styles on purpose: if the stylesheet is what broke,
    // this screen still needs to render.
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: '#F6FAFB',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '26rem',
            background: '#fff',
            border: '1px solid #D3E7EB',
            borderRadius: '1rem',
            padding: '1.75rem',
            textAlign: 'center',
            boxShadow: '0 16px 40px rgba(16,58,68,0.12)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#103A44' }}>
            The board stopped responding
          </h1>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', lineHeight: 1.6, color: '#5B7C85' }}>
            Nothing was saved, so reloading starts a fresh board.
          </p>
          {this.state.error?.message && (
            <p
              style={{
                margin: '0.75rem 0 0',
                padding: '0.5rem 0.75rem',
                background: '#F6FAFB',
                borderRadius: '0.5rem',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.7rem',
                color: '#5B7C85',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.25rem',
              width: '100%',
              padding: '0.7rem 1rem',
              background: '#0EA5B7',
              color: '#fff',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
