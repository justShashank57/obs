import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useConfig } from '../../lib/useConfig.js';
import { useEventQueue } from '../../lib/useEventQueue.js';
import { ALERT_TYPES, ALERT_TYPE_META, iconFor, formatAlertMessage } from '../../lib/alertTypes.js';
import './AlertBox.css';

/** Spawns N short-lived DOM particles that fly outward from the alert box and
 * fade, then removes them. Transform/opacity only (GPU-friendly), small count,
 * short lifetime — cheap enough to run alongside 6+ other browser sources. */
function burstParticles(container, colorVars, count = 14) {
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = 'alert-particle';
    el.style.background = colorVars[i % colorVars.length];
    container.appendChild(el);
    particles.push(el);
  }

  const tl = gsap.timeline({
    onComplete: () => particles.forEach((p) => p.remove()),
  });

  particles.forEach((el, i) => {
    const angle = (Math.PI * 2 * i) / particles.length + Math.random() * 0.4;
    const distance = 90 + Math.random() * 70;
    tl.fromTo(
      el,
      { x: 0, y: 0, opacity: 1, scale: 0.6 },
      {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        opacity: 0,
        scale: 1.1,
        duration: 0.7 + Math.random() * 0.3,
        ease: 'power2.out',
      },
      0
    );
  });

  return tl;
}

export default function AlertBox() {
  const config = useConfig();
  const { current, advance } = useEventQueue(ALERT_TYPES, {
    replayGraceMs: config?.alerts?.replayGraceMs,
  });
  const boxRef = useRef(null);
  const particleLayerRef = useRef(null);
  const audioRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!current || !config) return undefined;

    const duration = config.alerts?.durationMs ?? 6000;
    const soundEnabled = config.sound?.enabled && config.sound?.perEventType?.[current.type] !== false;
    const soundSrc = config.alerts?.sounds?.[current.type] || ALERT_TYPE_META[current.type]?.defaultSound;

    if (soundEnabled && soundSrc) {
      const audio = new Audio(soundSrc);
      audio.volume = config.sound?.volume ?? 0.8;
      audioRef.current = audio;
      audio.play().catch(() => {
        /* autoplay might be blocked until user gesture in dev preview; fine in OBS browser source */
      });
    }

    const el = boxRef.current;
    const tl = gsap.timeline();
    const animation = config.alerts?.animation || 'pop-glow';

    if (animation === 'slide') {
      tl.fromTo(el, { x: -400, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    } else if (animation === 'particle-burst') {
      tl.fromTo(
        el,
        { scale: 0.3, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' }
      );
      if (particleLayerRef.current) {
        burstParticles(particleLayerRef.current, [
          'var(--color-primary)',
          'var(--color-secondary)',
          'var(--color-accent)',
        ]);
      }
    } else {
      tl.fromTo(
        el,
        { scale: 0.4, opacity: 0, rotate: -6 },
        { scale: 1, opacity: 1, rotate: 0, duration: 0.55, ease: 'back.out(1.9)' }
      );
    }

    timeoutRef.current = setTimeout(() => {
      const exit = gsap.timeline({ onComplete: advance });
      exit.to(el, { y: -40, opacity: 0, duration: 0.4, ease: 'power2.in' });
    }, duration);

    return () => {
      clearTimeout(timeoutRef.current);
      gsap.killTweensOf(el);
      if (audioRef.current) audioRef.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, config]);

  if (!config) return <div className="overlay-page" />;
  if (!current) return <div className="overlay-page" />;

  const message = formatAlertMessage(config.alerts?.messages?.[current.type], current);

  return (
    <div className="overlay-page alert-page">
      <div className="alert-box" ref={boxRef}>
        <div className="alert-glow" />
        <div className="alert-particle-layer" ref={particleLayerRef} />
        <div className="alert-icon">{iconFor(current.type)}</div>
        <div className="alert-copy">
          <div className="alert-platform">{current.platform}</div>
          <div className="alert-message">{message}</div>
        </div>
      </div>
    </div>
  );
}
