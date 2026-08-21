import React, { useEffect, useState } from 'react';
import { ALERT_TYPES, labelFor } from '../../lib/alertTypes.js';
import './ControlPanel.css';

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.fieldErrors = body?.errors?.fieldErrors;
    throw err;
  }
  return body;
}

function FieldErrors({ errors }) {
  if (!errors) return null;
  const messages = Object.entries(errors).flatMap(([field, msgs]) => msgs.map((m) => `${field}: ${m}`));
  if (!messages.length) return null;
  return (
    <div className="cp-field-errors">
      {messages.map((m) => (
        <div key={m}>{m}</div>
      ))}
    </div>
  );
}

export default function ControlPanel() {
  const [session, setSession] = useState(null); // { authed, isAdmin, clientId }
  const [clientIdInput, setClientIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeClientId, setActiveClientId] = useState(
    new URLSearchParams(window.location.search).get('client') || ''
  );

  useEffect(() => {
    api('/auth/status').then((s) => {
      setSession(s);
      if (s.authed && !s.isAdmin) setActiveClientId(s.clientId);
    });
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ clientId: clientIdInput || undefined, password: passwordInput }),
      });
      setSession({ authed: true, isAdmin: result.isAdmin, clientId: result.clientId || null });
      if (!result.isAdmin) setActiveClientId(result.clientId);
      else if (clientIdInput) setActiveClientId(clientIdInput);
    } catch (err) {
      setLoginError(err.message);
    }
  }

  if (session === null) {
    return <div className="control-panel-page cp-loading">Loading…</div>;
  }

  if (!session.authed) {
    return (
      <div className="control-panel-page cp-login-screen">
        <form className="cp-login-card" onSubmit={handleLogin}>
          <h1>Overlay Control Panel</h1>
          <label className="cp-login-label">
            Client ID <span className="cp-login-hint">(leave blank for admin login)</span>
          </label>
          <input
            placeholder="e.g. demo"
            value={clientIdInput}
            onChange={(e) => setClientIdInput(e.target.value)}
          />
          <label className="cp-login-label">Password</label>
          <div className="cp-password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
            <button
              type="button"
              className="cp-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <button type="submit">Log in</button>
          {loginError && <div className="cp-error">{loginError}</div>}
        </form>
      </div>
    );
  }

  const clientId = session.isAdmin ? activeClientId : session.clientId;

  return (
    <div className="control-panel-page">
      <div className="cp-shell">
        <header className="cp-header">
          <h1>Overlay Control Panel</h1>
          <div className="cp-client-select">
            <label>Client</label>
            {session.isAdmin ? (
              <input value={activeClientId} onChange={(e) => setActiveClientId(e.target.value)} />
            ) : (
              <span className="cp-client-locked">{session.clientId}</span>
            )}
          </div>
          <button
            className="cp-logout"
            onClick={() => api('/auth/logout', { method: 'POST' }).then(() => setSession({ authed: false }))}
          >
            Log out
          </button>
        </header>

        {!clientId ? (
          <div className="cp-section">Enter a client ID above to manage its overlay.</div>
        ) : (
          <>
            <BrowserSourceUrls clientId={clientId} />
            <PreviewPanel clientId={clientId} />
            <IntegrationStatus clientId={clientId} />
            <TestAlerts clientId={clientId} />
            <GoalEditor clientId={clientId} />
            <LabelEditor clientId={clientId} />
            <CountdownEditor clientId={clientId} />
            <ThemeEditor clientId={clientId} />
            <KofiIntegration clientId={clientId} />
            {session.isAdmin && <AdminPasswordReset clientId={clientId} />}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="cp-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function BrowserSourceUrls({ clientId }) {
  const base = window.location.origin;
  const routes = [
    ['Alerts', '/overlay/alerts'],
    ['Goal Bar', '/overlay/goal'],
    ['Ticker', '/overlay/ticker'],
    ['Stream Label', '/overlay/label'],
    ['Countdown / BRB', '/overlay/countdown'],
    ['Chat Overlay', '/overlay/chat'],
    ['Webcam Frame', '/overlay/webcam-frame'],
  ];
  return (
    <Section title="Browser Source URLs">
      <ul className="cp-url-list">
        {routes.map(([name, path]) => (
          <li key={path}>
            <span>{name}</span>
            <code>{`${base}${path}?client=${clientId}`}</code>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const PREVIEW_ROUTES = [
  ['Alerts', '/overlay/alerts'],
  ['Goal Bar', '/overlay/goal'],
  ['Ticker', '/overlay/ticker'],
  ['Stream Label', '/overlay/label'],
  ['Countdown / BRB', '/overlay/countdown'],
  ['Chat Overlay', '/overlay/chat'],
  ['Webcam Frame', '/overlay/webcam-frame'],
];

function PreviewPanel({ clientId }) {
  const [route, setRoute] = useState('');

  return (
    <Section title="Live Preview">
      <div className="cp-form-row">
        <label>Show</label>
        <select value={route} onChange={(e) => setRoute(e.target.value)}>
          <option value="">— select a widget to preview —</option>
          {PREVIEW_ROUTES.map(([name, path]) => (
            <option key={path} value={path}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {route ? (
        <div className="cp-preview-frame-wrap">
          <iframe
            key={route}
            title="overlay-preview"
            className="cp-preview-frame"
            src={`${route}?client=${clientId}`}
          />
        </div>
      ) : (
        <p className="cp-hint">
          Pick a widget to see it update live as you change settings below — no need to alt-tab into OBS.
        </p>
      )}
    </Section>
  );
}

function IntegrationStatus({ clientId }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      api(`/status/${clientId}`)
        .then((s) => !cancelled && setStatus(s))
        .catch(() => {});
    }
    poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [clientId]);

  if (!status) return null;

  const rows = Object.entries(status).map(([integration, info]) => (
    <li key={integration} className="cp-status-row">
      <span className={`cp-status-dot ${info.connected ? 'cp-status-dot--ok' : 'cp-status-dot--bad'}`} />
      <span className="cp-status-name">{integration}</span>
      <span className={`cp-status-mode cp-status-mode--${info.mode}`}>{info.mode || 'unknown'}</span>
      {info.lastEventAt && (
        <span className="cp-status-detail">last event {new Date(info.lastEventAt).toLocaleTimeString()}</span>
      )}
      {info.lastError && <span className="cp-status-error">{info.lastError}</span>}
    </li>
  ));

  return (
    <Section title="Integration Status">
      {rows.length ? <ul className="cp-status-list">{rows}</ul> : <p className="cp-hint">No integrations reporting yet.</p>}
      <p className="cp-hint">
        "mock" means no real credentials are configured for that integration — see .env.example. This refreshes every 10s.
      </p>
    </Section>
  );
}

function TestAlerts({ clientId }) {
  const [status, setStatus] = useState('');
  async function trigger(type) {
    setStatus(`Firing ${type}…`);
    try {
      await api(`/test-event/${clientId}`, { method: 'POST', body: JSON.stringify({ type }) });
      setStatus(`Fired ${type} ✓`);
    } catch (err) {
      setStatus(`Failed: ${err.message}`);
    }
  }
  return (
    <Section title="Trigger Test Alerts">
      <div className="cp-button-row">
        {ALERT_TYPES.map((type) => (
          <button key={type} onClick={() => trigger(type)}>
            {labelFor(type)}
          </button>
        ))}
      </div>
      {status && <div className="cp-status">{status}</div>}
    </Section>
  );
}

function GoalEditor({ clientId }) {
  const [goal, setGoal] = useState({ label: 'Sub Goal', start: 0, current: 0, target: 100 });
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState(null);

  useEffect(() => {
    fetch(`/api/runtime/${clientId}`)
      .then((r) => r.json())
      .then((d) => d.goal && setGoal(d.goal));
  }, [clientId]);

  async function save() {
    setErrors(null);
    try {
      await api(`/runtime/${clientId}/goal`, { method: 'PUT', body: JSON.stringify(goal) });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setErrors(err.fieldErrors || { _: [err.message] });
    }
  }

  return (
    <Section title="Goal Bar">
      <div className="cp-form-row">
        <label>Label</label>
        <input value={goal.label} onChange={(e) => setGoal({ ...goal, label: e.target.value })} />
      </div>
      <div className="cp-form-row cp-form-row--inline">
        <div>
          <label>Start</label>
          <input
            type="number"
            value={goal.start}
            onChange={(e) => setGoal({ ...goal, start: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>Current</label>
          <input
            type="number"
            value={goal.current}
            onChange={(e) => setGoal({ ...goal, current: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>Target</label>
          <input
            type="number"
            value={goal.target}
            onChange={(e) => setGoal({ ...goal, target: Number(e.target.value) })}
          />
        </div>
      </div>
      <FieldErrors errors={errors} />
      <button onClick={save}>Save Goal{saved ? ' ✓' : ''}</button>
      <button
        className="cp-secondary"
        onClick={() => setGoal({ ...goal, current: goal.start })}
        title="Reset progress back to the start value (e.g. on stream restart)"
      >
        Reset Progress
      </button>
    </Section>
  );
}

function LabelEditor({ clientId }) {
  const [label, setLabel] = useState({ text: '', mode: 'static' });
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState(null);

  useEffect(() => {
    fetch(`/api/runtime/${clientId}`)
      .then((r) => r.json())
      .then((d) => d.streamLabel && setLabel(d.streamLabel));
  }, [clientId]);

  async function save() {
    setErrors(null);
    try {
      await api(`/runtime/${clientId}/label`, { method: 'PUT', body: JSON.stringify(label) });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setErrors(err.fieldErrors || { _: [err.message] });
    }
  }

  return (
    <Section title="Stream Label / Now Playing">
      <div className="cp-form-row">
        <label>Text</label>
        <input value={label.text} onChange={(e) => setLabel({ ...label, text: e.target.value })} />
      </div>
      <div className="cp-form-row">
        <label>Mode</label>
        <select value={label.mode} onChange={(e) => setLabel({ ...label, mode: e.target.value })}>
          <option value="static">Static</option>
          <option value="ticker">Ticker (scrolling)</option>
        </select>
      </div>
      <FieldErrors errors={errors} />
      <button onClick={save}>Save Label{saved ? ' ✓' : ''}</button>
    </Section>
  );
}

function CountdownEditor({ clientId }) {
  const [countdown, setCountdown] = useState({ title: 'Starting Soon', targetTimestamp: null, message: '' });
  const [minutesFromNow, setMinutesFromNow] = useState(10);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState(null);

  useEffect(() => {
    fetch(`/api/runtime/${clientId}`)
      .then((r) => r.json())
      .then((d) => d.countdown && setCountdown(d.countdown));
  }, [clientId]);

  async function save() {
    setErrors(null);
    try {
      await api(`/runtime/${clientId}/countdown`, { method: 'PUT', body: JSON.stringify(countdown) });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setErrors(err.fieldErrors || { _: [err.message] });
    }
  }

  function startCountdown() {
    setCountdown({ ...countdown, targetTimestamp: Date.now() + minutesFromNow * 60000 });
  }

  return (
    <Section title="Countdown / BRB / Starting Soon">
      <div className="cp-form-row">
        <label>Title</label>
        <input
          value={countdown.title}
          onChange={(e) => setCountdown({ ...countdown, title: e.target.value })}
        />
      </div>
      <div className="cp-form-row">
        <label>Message</label>
        <input
          value={countdown.message}
          onChange={(e) => setCountdown({ ...countdown, message: e.target.value })}
        />
      </div>
      <div className="cp-form-row cp-form-row--inline">
        <div>
          <label>Start countdown (minutes)</label>
          <input
            type="number"
            value={minutesFromNow}
            onChange={(e) => setMinutesFromNow(Number(e.target.value))}
          />
        </div>
        <button onClick={startCountdown}>Set Timer</button>
        <button className="cp-secondary" onClick={() => setCountdown({ ...countdown, targetTimestamp: null })}>
          Clear Timer (BRB mode)
        </button>
      </div>
      <FieldErrors errors={errors} />
      <button onClick={save}>Save{saved ? ' ✓' : ''}</button>
    </Section>
  );
}

const ANIMATION_OPTIONS = [
  ['pop-glow', 'Pop + glow'],
  ['slide', 'Slide in'],
  ['particle-burst', 'Particle burst'],
];

function ThemeEditor({ clientId }) {
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState(null);

  useEffect(() => {
    fetch(`/api/config/${clientId}`)
      .then((r) => r.json())
      .then(setConfig);
  }, [clientId]);

  async function save(next) {
    setErrors(null);
    setConfig(next);
    try {
      await api(`/config/${clientId}`, { method: 'PUT', body: JSON.stringify(next) });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch (err) {
      setErrors(err.fieldErrors || { _: [err.message] });
    }
  }

  if (!config) return null;

  function updateColor(key, value) {
    save({ ...config, theme: { ...config.theme, colors: { ...config.theme.colors, [key]: value } } });
  }

  function updateFont(key, value) {
    save({ ...config, theme: { ...config.theme, fonts: { ...config.theme.fonts, [key]: value } } });
  }

  function updateMessage(type, value) {
    save({ ...config, alerts: { ...config.alerts, messages: { ...config.alerts.messages, [type]: value } } });
  }

  function updateSoundToggle(type, enabled) {
    save({
      ...config,
      sound: { ...config.sound, perEventType: { ...config.sound.perEventType, [type]: enabled } },
    });
  }

  return (
    <Section title="Theme, Sound & Alert Text">
      <p className="cp-hint">
        This is the reskinning layer — every field here writes straight to this client's config file, no
        code or JSON editing required.
      </p>

      <h3 className="cp-subheading">Colors</h3>
      <div className="cp-color-grid">
        {Object.entries(config.theme?.colors || {}).map(([key, value]) => (
          <label key={key} className="cp-color-field">
            <span>{key}</span>
            <input type="color" value={toHexOrFallback(value)} onChange={(e) => updateColor(key, e.target.value)} />
          </label>
        ))}
      </div>

      <h3 className="cp-subheading">Fonts</h3>
      <div className="cp-form-row cp-form-row--inline">
        <div>
          <label>Heading font</label>
          <input value={config.theme?.fonts?.heading || ''} onChange={(e) => updateFont('heading', e.target.value)} />
        </div>
        <div>
          <label>Body font</label>
          <input value={config.theme?.fonts?.body || ''} onChange={(e) => updateFont('body', e.target.value)} />
        </div>
      </div>

      <h3 className="cp-subheading">Alerts</h3>
      <div className="cp-form-row cp-form-row--inline">
        <div>
          <label>Animation</label>
          <select
            value={config.alerts?.animation || 'pop-glow'}
            onChange={(e) => save({ ...config, alerts: { ...config.alerts, animation: e.target.value } })}
          >
            {ANIMATION_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Duration (ms)</label>
          <input
            type="number"
            value={config.alerts?.durationMs ?? 6000}
            onChange={(e) => save({ ...config, alerts: { ...config.alerts, durationMs: Number(e.target.value) } })}
          />
        </div>
        <div>
          <label>Sound volume</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.sound?.volume ?? 0.8}
            onChange={(e) => save({ ...config, sound: { ...config.sound, volume: Number(e.target.value) } })}
          />
        </div>
      </div>

      <label className="cp-toggle">
        <input
          type="checkbox"
          checked={!!config.sound?.enabled}
          onChange={(e) => save({ ...config, sound: { ...config.sound, enabled: e.target.checked } })}
        />
        Sound on alert enabled (master switch)
      </label>

      <h4 className="cp-subheading cp-subheading--small">Per-event message text &amp; sound toggle</h4>
      <div className="cp-message-list">
        {ALERT_TYPES.map((type) => (
          <div className="cp-message-row" key={type}>
            <label className="cp-toggle cp-toggle--inline">
              <input
                type="checkbox"
                checked={config.sound?.perEventType?.[type] !== false}
                onChange={(e) => updateSoundToggle(type, e.target.checked)}
              />
              {labelFor(type)}
            </label>
            <input
              className="cp-message-input"
              value={config.alerts?.messages?.[type] || ''}
              onChange={(e) => updateMessage(type, e.target.value)}
            />
          </div>
        ))}
      </div>

      <FieldErrors errors={errors} />
      {saved && <div className="cp-status">Saved ✓</div>}
    </Section>
  );
}

function toHexOrFallback(value) {
  if (typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;
  return '#888888'; // <input type=color> can't display rgba()/named colors — shown as a neutral swatch
}

function KofiIntegration({ clientId }) {
  const [info, setInfo] = useState(null);
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/integrations/${clientId}/kofi-token`).then(setInfo).catch(() => {});
  }, [clientId]);

  async function save() {
    setError('');
    try {
      await api(`/integrations/${clientId}/kofi-token`, { method: 'PUT', body: JSON.stringify({ token }) });
      setSaved(true);
      setToken('');
      setTimeout(() => setSaved(false), 1500);
      api(`/integrations/${clientId}/kofi-token`).then(setInfo);
    } catch (err) {
      setError(err.message);
    }
  }

  const webhookUrl = `${window.location.origin}/webhooks/kofi/${clientId}`;

  return (
    <Section title="Ko-fi Donations">
      <p className="cp-hint">
        In Ko-fi: Settings → Webhooks → Webhook URL, paste the URL below, then copy your Ko-fi
        "verification token" into the field below and save. Real Ko-fi donations will then fire the
        Donation alert automatically.
      </p>
      <div className="cp-form-row">
        <label>Webhook URL (paste into Ko-fi)</label>
        <code className="cp-webhook-url">{webhookUrl}</code>
      </div>
      <div className="cp-form-row">
        <label>Ko-fi verification token</label>
        <input
          type="password"
          placeholder={info?.configured ? `Currently set (${info.tokenPreview})` : 'Paste your Ko-fi verification token'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      {error && <div className="cp-field-errors">{error}</div>}
      <button onClick={save}>Save Token{saved ? ' ✓' : ''}</button>
    </Section>
  );
}

function AdminPasswordReset({ clientId }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function reset() {
    setStatus('');
    try {
      await api(`/admin/reset-password/${clientId}`, { method: 'POST', body: JSON.stringify({ password }) });
      setStatus('Password updated ✓');
      setPassword('');
    } catch (err) {
      setStatus(`Failed: ${err.message}`);
    }
  }

  return (
    <Section title="Admin: Reset This Client's Password">
      <div className="cp-form-row">
        <label>New password (min 8 characters)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button onClick={reset}>Reset Password</button>
      {status && <div className="cp-status">{status}</div>}
    </Section>
  );
}
