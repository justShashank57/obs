import { useEffect, useRef, useState } from 'react';
import { getSocket } from './socket.js';

/**
 * Sequential alert queue: incoming events are pushed onto a FIFO. Only one
 * alert is "current" at a time; the widget calls advance() once its exit
 * animation finishes, which is how overlapping events never visually collide.
 *
 * Also consumes the server's 'backlog' payload (recent events sent right after
 * connect) so an alert that fired while this browser source was unloaded
 * (OBS "shutdown source when not visible") still plays once the source comes
 * back — but only if it's within `replayGraceMs` of now, so reconnecting after
 * a long absence doesn't dump a wall of stale alerts back-to-back.
 */
export function useEventQueue(filterTypes, options = {}) {
  const graceMs = options.replayGraceMs ?? 30000;
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);
  const processingRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    const onEvent = (event) => {
      if (filterTypes && !filterTypes.includes(event.type)) return;
      queueRef.current.push(event);
      tryAdvance();
    };

    const onBacklog = (backlog) => {
      const now = Date.now();
      const replayable = (backlog?.events || [])
        .filter((e) => (!filterTypes || filterTypes.includes(e.type)) && now - e.timestamp <= graceMs)
        .sort((a, b) => a.timestamp - b.timestamp);
      if (replayable.length) {
        queueRef.current.push(...replayable);
        tryAdvance();
      }
    };

    socket.on('event', onEvent);
    socket.on('backlog', onBacklog);
    return () => {
      socket.off('event', onEvent);
      socket.off('backlog', onBacklog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tryAdvance() {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    processingRef.current = true;
    setCurrent(next);
  }

  function advance() {
    processingRef.current = false;
    setCurrent(null);
    setTimeout(tryAdvance, 200);
  }

  return { current, advance };
}
