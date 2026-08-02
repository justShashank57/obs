import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/global.css';

import AlertBox from './components/overlays/AlertBox.jsx';
import GoalBar from './components/overlays/GoalBar.jsx';
import Ticker from './components/overlays/Ticker.jsx';
import StreamLabel from './components/overlays/StreamLabel.jsx';
import Countdown from './components/overlays/Countdown.jsx';
import ChatOverlay from './components/overlays/ChatOverlay.jsx';
import WebcamFrame from './components/overlays/WebcamFrame.jsx';
import ControlPanel from './components/control-panel/ControlPanel.jsx';
import { OverlayErrorBoundary } from './components/OverlayErrorBoundary.jsx';

function wrapped(Component) {
  return (
    <OverlayErrorBoundary>
      <Component />
    </OverlayErrorBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/overlay/alerts" element={wrapped(AlertBox)} />
        <Route path="/overlay/goal" element={wrapped(GoalBar)} />
        <Route path="/overlay/ticker" element={wrapped(Ticker)} />
        <Route path="/overlay/label" element={wrapped(StreamLabel)} />
        <Route path="/overlay/countdown" element={wrapped(Countdown)} />
        <Route path="/overlay/chat" element={wrapped(ChatOverlay)} />
        <Route path="/overlay/webcam-frame" element={wrapped(WebcamFrame)} />
        {/* Control panel is intentionally NOT wrapped — if it crashes, the
            streamer needs to see the real error, not a blank page. */}
        <Route path="/control-panel" element={<ControlPanel />} />
        <Route path="*" element={<Navigate to="/control-panel" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
