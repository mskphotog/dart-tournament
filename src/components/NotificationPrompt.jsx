/**
 * NOTIFICATION PROMPT
 * ====================
 * A non-intrusive banner that appears at the bottom of the screen asking
 * players if they want to receive push notifications for match updates.
 *
 * Behavior:
 * - Only shown if push is supported AND permission has not yet been decided
 * - Dismissed permanently if the user clicks "No thanks" (stored in localStorage)
 * - Disappears automatically after subscribing successfully
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

    // Check if push is supported and permission not yet decided
    if (!isPushSupported()) return;
    if (getNotificationPermission() !== 'default') return;

    // Check if user previously dismissed the prompt
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    // Check if already subscribed (e.g., returning visitor)
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
      setMessage('You are now subscribed to match notifications.');
      setTimeout(() => setVisible(false), 2000);
    } else {
      setMessage(result.reason || 'Something went wrong. Try again.');
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
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
