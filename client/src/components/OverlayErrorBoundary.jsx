import React from 'react';

/**
 * Wraps every overlay route. Previously, an unexpected config/event shape
 * could throw during render and there was nothing catching it — the whole
 * browser source would go blank with zero indication anything crashed,
 * mid-stream, with no way to tell "it's just quiet right now" from "it's
 * broken." This fails transparently on the live overlay (so it doesn't draw
 * an ugly error box over someone's stream) but shows a visible message when
 * `?debug=1` is on the URL, for testing.
 */
export class OverlayErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[overlay] widget crashed, rendering blank instead of breaking the page', error, info);
  }

  render() {
    if (this.state.hasError) {
      const debug = new URLSearchParams(window.location.search).get('debug');
      if (debug) {
        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              color: '#ff6b6b',
              fontFamily: 'monospace',
              padding: 16,
              fontSize: 14,
            }}
          >
            Overlay widget crashed — check the browser console (shown because ?debug=1 is set).
          </div>
        );
      }
      return <div className="overlay-page" />;
    }
    return this.props.children;
  }
}
