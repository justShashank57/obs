import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useConfig } from '../../lib/useConfig.js';
import './WebcamFrame.css';

/**
 * Pure decorative border/frame meant to sit around a separate webcam browser
 * source in OBS (stack this overlay above the camera source). No data
 * dependency — purely CSS/GSAP, so it's cheap on CPU and safe to loop forever.
 */
export default function WebcamFrame() {
  const config = useConfig();
  const frameRef = useRef(null);

  useEffect(() => {
    if (!config || !frameRef.current) return undefined;
    const style = config.webcamFrame?.style || 'pulse-border';
    let tween;
    if (style === 'pulse-border') {
      tween = gsap.to(frameRef.current, {
        boxShadow: `0 0 40px 6px var(--color-secondary)`,
        repeat: -1,
        yoyo: true,
        duration: 1.6,
        ease: 'sine.inOut',
      });
    } else if (style === 'rotate-gradient') {
      tween = gsap.to(frameRef.current, {
        '--angle': '360deg',
        repeat: -1,
        duration: 6,
        ease: 'none',
      });
    }
    return () => tween && tween.kill();
  }, [config]);

  if (!config) return <div className="overlay-page" />;

  const borderWidth = config.webcamFrame?.borderWidth ?? 8;

  return (
    <div className="overlay-page webcam-frame-page">
      <div
        className={`webcam-frame webcam-frame--${config.webcamFrame?.style || 'pulse-border'}`}
        ref={frameRef}
        style={{ borderWidth: `${borderWidth}px` }}
      />
    </div>
  );
}
