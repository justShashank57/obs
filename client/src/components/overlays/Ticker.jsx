import React, { useEffect, useState } from 'react';
import { useConfig } from '../../lib/useConfig.js';
import { getSocket } from '../../lib/socket.js';
import { ALERT_TYPES, formatAlertMessage } from '../../lib/alertTypes.js';
import './Ticker.css';

export default function Ticker() {
  const config = useConfig();
  const [items, setItems] = useState([]);

  useEffect(() => {
    const socket = getSocket();
    const maxItems = () => config?.ticker?.maxItems ?? 8;

    const onEvent = (event) => {
      if (!ALERT_TYPES.includes(event.type)) return;
      setItems((prev) => [event, ...prev].slice(0, maxItems()));
    };

    // Backfill history on (re)connect so the ticker isn't blank after an OBS
    // scene switch reloaded this browser source mid-stream.
    const onBacklog = (backlog) => {
      const relevant = (backlog?.events || []).filter((e) => ALERT_TYPES.includes(e.type));
      if (!relevant.length) return;
      setItems((prev) => {
        const merged = [...relevant].reverse().concat(prev);
        const seen = new Set();
        return merged.filter((e) => (seen.has(e.id) ? false : seen.add(e.id))).slice(0, maxItems());
      });
    };

    socket.on('event', onEvent);
    socket.on('backlog', onBacklog);
    return () => {
      socket.off('event', onEvent);
      socket.off('backlog', onBacklog);
    };
  }, [config]);

  if (!config) return <div className="overlay-page" />;

  return (
    <div className="overlay-page ticker-page">
      <ul className="ticker-list">
        {items.map((event) => (
          <li key={event.id} className="ticker-item">
            <span className={`ticker-dot ticker-dot--${event.platform}`} />
            {formatAlertMessage(config.alerts?.messages?.[event.type], event)}
          </li>
        ))}
      </ul>
    </div>
  );
}
