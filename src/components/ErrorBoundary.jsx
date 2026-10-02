import { Component } from 'react';
import { readRawSave, downloadRawSave, moveSaveAside } from '../utils/storage';

const secondaryButton = {
  marginTop: '0.6rem',
  width: '100%',
  padding: '0.6rem 1rem',
  background: '#fff',
  color: '#103A44',
  border: '1px solid #D3E7EB',
  borderRadius: '0.75rem',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, downloaded: false, note: null };
  }

  // If the saved tree itself is what keeps crashing the board, reloading
  // would only crash again. These two give a way out that never destroys the
  // save: download a copy, or move it aside (to a backup key) and start empty.
  downloadBackup = () => {
    const raw = readRawSave();
    if (!raw) {
      this.setState({ note: 'Nothing is saved in this browser.' });
      return;
    }
    downloadRawSave(raw);
    this.setState({ downloaded: true, note: null });
  };

  startFresh = () => {
    if (moveSaveAside({ force: this.state.downloaded })) {
      window.location.reload();
      return;
    }
    this.setState({
      note: "There wasn't room to keep a copy in this browser. Download a backup first, then try again.",
    });
  };

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
          fontFamily: '"Proxima Nova", proxima-nova, system-ui, sans-serif',
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
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', lineHeight: 1.6, color: '#4E6E77' }}>
            Reloading picks the tree back up from its last autosave — nothing
            from before this happened is lost.
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
                color: '#4E6E77',
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
          <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', lineHeight: 1.5, color: '#4E6E77' }}>
            If this keeps happening, the saved tree itself may be the problem.
          </p>
          <button onClick={this.downloadBackup} style={secondaryButton}>
            Download a backup of my data
          </button>
          <button onClick={this.startFresh} style={secondaryButton}>
            Start with an empty board (the old tree is kept aside)
          </button>
          {this.state.note && (
            <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: '#B83A3A' }}>{this.state.note}</p>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
