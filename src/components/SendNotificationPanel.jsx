/**
 * SEND NOTIFICATION PANEL
 * ========================
 * Admin UI component for broadcasting push notifications to all subscribed devices.
 * Displayed on the Admin Dashboard page.
 *
 * Features:
 * - Quick-send buttons for common match-ready messages
 * - Custom title + message fields for one-off announcements
 * - Shows subscriber count
 * - Displays sent/failed counts after each send
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Pre-built quick messages the admin can send with one click
const QUICK_MESSAGES = [
  { label: '🎯 Match Ready', title: 'Darts @ LIT', body: 'Your match is ready — step up to the board!' },
  { label: '🏆 Finals Time', title: 'Darts @ LIT', body: "It's finals time! Come watch the championship match." },
  { label: '⏸ Short Break', title: 'Darts @ LIT', body: 'Short break — tournament resumes in 10 minutes.' },
  { label: '🎉 Tournament Done', title: 'Darts @ LIT', body: "That's a wrap! Thanks for playing tonight." },
];

export default function SendNotificationPanel() {
  const [title, setTitle] = useState('Darts @ LIT');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { sent, failed } or { error }
  const [subscriberCount, setSubscriberCount] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Load subscriber count on mount
  useEffect(() => {
    loadSubscriberCount();
  }, []);

  async function loadSubscriberCount() {
    const { count } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true });
    setSubscriberCount(count ?? 0);
  }

  async function sendNotification(notifTitle, notifBody) {
    setSending(true);
    setResult(null);

    try {
      // Get the current session token to authenticate the request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setResult({ error: 'Not authenticated. Please sign in again.' });
        setSending(false);
        return;
      }

      const response = await fetch('/.netlify/functions/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: notifTitle,
          body: notifBody,
          url: '/',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({ error: data.error || 'Failed to send notification.' });
      } else {
        setResult({ sent: data.sent, failed: data.failed });
        // Refresh subscriber count (expired subs may have been cleaned up)
        loadSubscriberCount();
      }
    } catch (err) {
      setResult({ error: 'Network error. Check your connection.' });
    }

    setSending(false);
  }

  function handleQuickSend(msg) {
    sendNotification(msg.title, msg.body);
  }

  function handleCustomSend(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    sendNotification(title.trim(), body.trim());
  }

  return (
    <div className="card mb-6">
      {/* Header row */}
      <div
        className="flex items-center justify-between"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h2 style={{ marginBottom: '2px' }}>
            🔔 Push Notifications
          </h2>
          <p className="text-secondary" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
            {subscriberCount === null
              ? 'Loading subscribers...'
              : `${subscriberCount} device${subscriberCount !== 1 ? 's' : ''} subscribed`}
          </p>
        </div>
        <span style={{ fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Collapsible body */}
      {expanded && (
        <div style={{ marginTop: 'var(--space-4)' }}>

          {/* Result banner */}
          {result && (
            <div
              className={result.error ? 'form-error mb-4' : 'mb-4'}
              style={result.error ? {} : {
                padding: 'var(--space-3)',
                background: 'var(--color-success-light, #1a3a1a)',
                border: '1px solid var(--color-success)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-success)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {result.error
                ? result.error
                : `Sent to ${result.sent} device${result.sent !== 1 ? 's' : ''}.${result.failed > 0 ? ` ${result.failed} failed (expired subscriptions removed).` : ''}`}
            </div>
          )}

          {/* Quick-send buttons */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <p className="text-secondary mb-2" style={{ fontSize: 'var(--font-size-sm)' }}>
              Quick send:
            </p>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {QUICK_MESSAGES.map((msg) => (
                <button
                  key={msg.label}
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleQuickSend(msg)}
                  disabled={sending || subscriberCount === 0}
                  title={msg.body}
                >
                  {msg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <hr style={{ borderColor: 'var(--color-border)', margin: 'var(--space-4) 0' }} />

          {/* Custom message form */}
          <form onSubmit={handleCustomSend}>
            <p className="text-secondary mb-3" style={{ fontSize: 'var(--font-size-sm)' }}>
              Custom message:
            </p>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Darts @ LIT"
                maxLength={64}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Message</label>
              <textarea
                className="form-input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="e.g., Match 4 is ready — John vs. Mike, board 2"
                rows={3}
                maxLength={200}
                required
                style={{ resize: 'vertical' }}
              />
              <p className="text-secondary mt-1" style={{ fontSize: 'var(--font-size-xs)' }}>
                {body.length}/200 characters
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending || !title.trim() || !body.trim() || subscriberCount === 0}
            >
              {sending ? 'Sending...' : `Send to ${subscriberCount ?? '…'} device${subscriberCount !== 1 ? 's' : ''}`}
            </button>
          </form>

          {subscriberCount === 0 && (
            <p className="text-secondary mt-3" style={{ fontSize: 'var(--font-size-sm)' }}>
              No devices are subscribed yet. Players will be prompted to subscribe when they visit the app.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
