import { Component, type ReactNode } from 'react';

/**
 * Catches a failed lazy chunk (e.g. the app was rebuilt while this tab was open, or the network dropped) so only
 * that part of the page shows a message instead of the whole app going blank.
 */
export class ChunkBoundary extends Component<{ children: ReactNode; label: string; compact?: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className={this.props.compact ? 'chunk-error compact' : 'chunk-error'} role="alert">
      <strong>{this.props.label} could not load.</strong>
      <p>The app may have been updated, or the connection dropped. Reloading usually fixes it.</p>
      <button onClick={() => window.location.reload()}>Reload the page</button>
    </div>;
  }
}
