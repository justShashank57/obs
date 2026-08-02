import React, { useEffect, useState } from 'react';
import { useConfig } from '../../lib/useConfig.js';
import { getSocket, getClientId } from '../../lib/socket.js';
import './StreamLabel.css';

export default function StreamLabel() {
  const config = useConfig();
  const [label, setLabel] = useState(null);

  useEffect(() => {
    fetch(`/api/runtime/${getClientId()}`)
      .then((r) => r.json())
      .then((data) => setLabel(data.streamLabel));

    const socket = getSocket();
    const onLabel = (l) => setLabel(l);
    socket.on('label', onLabel);
    return () => socket.off('label', onLabel);
  }, []);

  if (!config || !label) return <div className="overlay-page" />;

  return (
    <div className="overlay-page label-page">
      <div className={`label-bar label-bar--${label.mode === 'ticker' ? 'ticker' : 'static'}`}>
        {label.mode === 'ticker' ? (
          <div className="label-ticker-track">
            <span>{label.text}</span>
            <span>{label.text}</span>
          </div>
        ) : (
          <span>{label.text}</span>
        )}
      </div>
    </div>
  );
}
