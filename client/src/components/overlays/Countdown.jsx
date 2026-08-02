import React, { useEffect, useMemo, useState } from 'react';
import { useConfig } from '../../lib/useConfig.js';
import { getSocket, getClientId } from '../../lib/socket.js';
import './Countdown.css';

function formatRemaining(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function Countdown() {
  const config = useConfig();
  const [countdown, setCountdown] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch(`/api/runtime/${getClientId()}`)
      .then((r) => r.json())
      .then((data) => setCountdown(data.countdown));

    const socket = getSocket();
    const onCountdown = (c) => setCountdown(c);
    socket.on('countdown', onCountdown);
    return () => socket.off('countdown', onCountdown);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    if (!countdown?.targetTimestamp) return null;
    return countdown.targetTimestamp - now;
  }, [countdown, now]);

  if (!config) return <div className="overlay-page" />;

  const background = config.countdown?.backgroundUrl
    ? `url(${config.countdown.backgroundUrl}) center/cover no-repeat`
    : config.countdown?.backgroundGradient || 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))';

  return (
    <div className="overlay-page countdown-page" style={{ background }}>
      <div className="countdown-content">
        <div className="countdown-title">{countdown?.title || 'Starting Soon'}</div>
        {remaining !== null && (
          <div className="countdown-timer">{formatRemaining(remaining)}</div>
        )}
        {countdown?.message && <div className="countdown-message">{countdown.message}</div>}
      </div>
    </div>
  );
}
