import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useConfig } from '../../lib/useConfig.js';
import { getSocket, getClientId } from '../../lib/socket.js';
import './GoalBar.css';

export default function GoalBar() {
  const config = useConfig();
  const [goal, setGoal] = useState(null);
  const fillRef = useRef(null);

  useEffect(() => {
    fetch(`/api/runtime/${getClientId()}`)
      .then((r) => r.json())
      .then((data) => setGoal(data.goal));

    const socket = getSocket();
    const onGoal = (g) => setGoal(g);
    socket.on('goal', onGoal);
    return () => socket.off('goal', onGoal);
  }, []);

  useEffect(() => {
    if (!goal || !fillRef.current) return;
    const pct = percent(goal);
    gsap.to(fillRef.current, { width: `${pct}%`, duration: 1, ease: 'power2.out' });
  }, [goal]);

  if (!config || !goal) return <div className="overlay-page" />;

  const pct = percent(goal);

  return (
    <div className="overlay-page goal-page">
      <div className="goal-bar">
        <div className="goal-header">
          <span className="goal-label">{goal.label}</span>
          <span className="goal-numbers">
            {goal.current} / {goal.target} ({pct}%)
          </span>
        </div>
        <div className="goal-track">
          <div className="goal-fill" ref={fillRef} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function percent(goal) {
  const span = Math.max(goal.target - goal.start, 1);
  const done = Math.min(Math.max(goal.current - goal.start, 0), span);
  return Math.round((done / span) * 100);
}
