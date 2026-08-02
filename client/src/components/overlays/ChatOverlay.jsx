import React, { useEffect, useRef, useState } from 'react';
import { useConfig } from '../../lib/useConfig.js';
import { getSocket } from '../../lib/socket.js';
import './ChatOverlay.css';

export default function ChatOverlay() {
  const config = useConfig();
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    const onChat = (msg) => {
      setMessages((prev) => {
        const maxMessages = config?.chatOverlay?.maxMessages ?? 15;
        return [...prev, msg].slice(-maxMessages);
      });
    };
    const onBacklog = (backlog) => {
      const recent = backlog?.chat || [];
      if (!recent.length) return;
      setMessages((prev) => {
        const maxMessages = config?.chatOverlay?.maxMessages ?? 15;
        const merged = [...recent, ...prev];
        const seen = new Set();
        const deduped = merged.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
        return deduped.slice(-maxMessages);
      });
    };

    socket.on('chat', onChat);
    socket.on('backlog', onBacklog);
    return () => {
      socket.off('chat', onChat);
      socket.off('backlog', onBacklog);
    };
  }, [config]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  if (!config) return <div className="overlay-page" />;

  const showBadge = config.chatOverlay?.showPlatformBadge !== false;

  return (
    <div className="overlay-page chat-page">
      <div className="chat-box" ref={listRef}>
        {messages.map((msg) => (
          <div className="chat-message" key={msg.id}>
            {showBadge && <span className={`chat-badge chat-badge--${msg.platform}`}>{msg.platform}</span>}
            <span className="chat-username">{msg.username}:</span>
            <span className="chat-text">{msg.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
