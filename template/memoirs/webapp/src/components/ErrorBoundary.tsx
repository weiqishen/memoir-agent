import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

/** Catches rendering errors inside ReactMarkdown so they don't crash the whole app. */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '16px', color: 'var(--accent-error, #e06c75)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          <strong>Render error:</strong> {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}
