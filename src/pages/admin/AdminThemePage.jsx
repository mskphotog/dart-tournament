/**
 * ADMIN THEME PAGE
 *
 * Lets the admin pick from the four available themes. The choice is saved
 * to localStorage on the current device and applies immediately.
 *
 * Note: this is per-device. Switching theme on your Mac doesn't change it
 * on your phone. Each device picks its own.
 */

import { useState } from 'react';
import { THEMES, applyTheme, getCurrentThemeId } from '../../lib/theme';

export default function AdminThemePage() {
  // Track the active theme so we can show a checkmark on it
  // Initialized from localStorage via getCurrentThemeId()
  const [activeId, setActiveId] = useState(getCurrentThemeId());

  // When the user taps a theme, apply it and update the local state
  function handlePick(themeId) {
    applyTheme(themeId);
    setActiveId(themeId);
  }

  return (
    <div className="container">
      <h1>Theme</h1>
      <p className="text-secondary mb-6">
        Pick a theme for this device. Your choice is saved in your browser and
        only affects how the app looks on this device. Each device (phone,
        tablet, laptop) can have its own setting.
      </p>

      <div className="theme-grid">
        {THEMES.map((theme) => {
          const isActive = activeId === theme.id;
          return (
            <button
              key={theme.id}
              className={`theme-card ${isActive ? 'active' : ''}`}
              onClick={() => handlePick(theme.id)}
            >
              {/* Color swatches preview */}
              <div className="theme-swatches">
                {theme.swatches.map((color, i) => (
                  <div
                    key={i}
                    className="theme-swatch"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              {/* Theme name and description */}
              <div className="theme-info">
                <div className="theme-name">
                  {theme.name}
                  {isActive && <span className="theme-checkmark"> ✓</span>}
                </div>
                <div className="theme-description">{theme.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      <style>{`
        .theme-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: var(--space-4);
        }
        .theme-card {
          display: flex;
          flex-direction: column;
          padding: 0;
          text-align: left;
          background-color: var(--color-bg-card);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: border-color var(--transition-fast), transform var(--transition-fast);
          overflow: hidden;
          width: 100%;
          color: inherit;
        }
        .theme-card:hover {
          border-color: var(--color-primary);
        }
        .theme-card.active {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-light);
        }
        .theme-card:active {
          transform: scale(0.98);
        }
        .theme-swatches {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          height: 80px;
        }
        .theme-swatch {
          width: 100%;
          height: 100%;
        }
        .theme-info {
          padding: var(--space-4);
        }
        .theme-name {
          font-size: var(--font-size-lg);
          font-weight: var(--font-weight-semibold);
          margin-bottom: var(--space-1);
          color: var(--color-text-primary);
        }
        .theme-checkmark {
          color: var(--color-primary);
          font-weight: var(--font-weight-bold);
        }
        .theme-description {
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
