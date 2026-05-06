/**
 * NOTIFICATION PROMPT
 * ====================
 * A non-intrusive banner that appears at the bottom of the screen asking
 * players if they want to receive push notifications for match updates.
 *
 * Behavior:
 * - Only shown if push is supported in this browser
 * - Shown whenever Notification.permission === 'default' (not yet decided)
 *   OR when permission is 'granted' but no active subscription exists in the
 *   service worker (e.g., after a browser reset or cache clear)
 * - Dismissed permanently via localStorage ONLY when user clicks "No thanks"
 *   while permission is 'default' — if permission is reset by the browser,
 *   localStorage is also cleared so the prompt re-appears
 * - Not shown on admin pages (admins have their own notification controls)
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  isAlreadySubscribed,
} from '../lib/pushNotifications';
import './NotificationPrompt.css';

const DISMISSED_KEY = 'push_prompt_dismissed';

export default function NotificationPrompt() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Don't show on admin pages
    if (location.pathname.startsWith('/admin')) return;

    // Push must be supported in this browser
    if (!isPushSupported()) return;

    const permission = getNotificationPermission();

    // If permission was explicitly denied by the user in the browser, nothing
    // we can do — the browser blocks us from asking again.
    if (permission === 'denied') return;

    // If permission is 'default' (never asked, or reset by user):
    // Clear any stale localStorage dismissal so the prompt re-appears.
    if (permission === 'default') {
      localStorage.removeItem(DISMISSED_KEY);
    }

    // If user previously clicked "No thanks" while permission was 'default',
    // respect that choice and don't show again.
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    // Check if there is already an active push subscription in the service worker.
    // This covers the case where permission is 'granted' but the subscription
    // was lost (e.g., after clearing site data or reinstalling the PWA).
    isAlreadySubscribed().then((subscribed) => {
      if (!subscribed) {
        // Small delay so the prompt doesn't appear instantly on page load
        setTimeout(() => setVisible(true), 2500);
      }
    });
  }, [location.pathname]);

  // Don't render anything if not visible
  if (!visible) return null;

  async function handleSubscribe() {
    setSubscribing(true);
    setMessage('');
    const result = await subscribeToPush();
    setSubscribing(false);

    if (result.success) {
      setMessage('You are now subscribed to match notifications!');
      setTimeout(() => setVisible(false), 2500);
    } else {
      setMessage(result.reason || 'Something went wrong. Try again.');
    }
  }

  function handleDismiss() {
    // Only permanently dismiss if permission is still 'default' — if it was
    // granted and then reset, we want the prompt to re-appear next time.
    if (getNotificationPermission() === 'default') {
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
    setVisible(false);
  }

  return (
    <div className="notification-prompt" role="dialog" aria-label="Notification permission request">
      <div className="notification-prompt-content">
        <span className="notification-prompt-icon">🎯</span>
        <div className="notification-prompt-text">
          <strong>Stay in the loop</strong>
          <span>Get notified when your match is ready.</span>
        </div>
        <div className="notification-prompt-actions">
          {message ? (
            <span className="notification-prompt-message">{message}</span>
          ) : (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSubscribe}
                disabled={subscribing}
              >
                {subscribing ? 'Subscribing...' : 'Yes, notify me'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDismiss}
                disabled={subscribing}
              >
                No thanks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
