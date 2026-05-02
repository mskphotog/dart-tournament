/**
 * THEME MANAGEMENT
 *
 * Handles loading, saving, and applying the user's theme preference.
 * The theme is stored in localStorage on the user's device, so it persists
 * across page reloads but is per-browser/per-device.
 *
 * Themes are applied by setting a `data-theme="..."` attribute on the
 * <html> root element. The CSS in global.css picks up this attribute
 * and overrides the appropriate variables.
 */

// localStorage key under which we save the user's choice
const STORAGE_KEY = 'dart-tournament-theme';

// The four available themes. Each entry has:
//   - id: the value we set in data-theme (and store in localStorage)
//   - name: display name for the picker UI
//   - description: short blurb for the picker
//   - swatches: representative colors for the preview
export const THEMES = [
  {
    id: 'white',
    name: 'Clean White',
    description: 'Neutral and professional, easy on the eyes.',
    swatches: ['#F8F8F8', '#FFFFFF', '#00C2D1', '#E91E63'],
  },
  {
    id: 'cream',
    name: 'Warm Cream',
    description: 'Soft, approachable, daytime feel.',
    swatches: ['#FFF8F0', '#FFFFFF', '#00C2D1', '#E91E63'],
  },
  {
    id: 'cyan',
    name: 'Cyan Tinted',
    description: 'Echoes the LIT Wilton tropical brand.',
    swatches: ['#E8F9FB', '#FFFFFF', '#00C2D1', '#E91E63'],
  },
  {
    id: 'dark',
    name: 'Dark Mode',
    description: 'Nightclub vibe, easier on the eyes in dim bars.',
    swatches: ['#0F1419', '#1E2630', '#00C2D1', '#E91E63'],
  },
];

// The default theme used when the user hasn't picked one yet
const DEFAULT_THEME_ID = 'white';

/**
 * Read the current theme from localStorage. Returns the theme id, or the
 * default if nothing is saved (or localStorage is unavailable).
 */
export function getCurrentThemeId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) {
      return saved;
    }
  } catch (e) {
    // localStorage might be unavailable in private browsing or some embeds
    console.warn('Could not read theme from localStorage:', e);
  }
  return DEFAULT_THEME_ID;
}

/**
 * Apply a theme to the document. Sets the data-theme attribute on <html>
 * and saves the choice to localStorage.
 *
 * @param {string} themeId - one of the ids in THEMES
 */
export function applyTheme(themeId) {
  // Validate the theme exists
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) {
    console.warn(`Unknown theme: ${themeId}, falling back to default`);
    themeId = DEFAULT_THEME_ID;
  }

  // Apply to document
  document.documentElement.setAttribute('data-theme', themeId);

  // Persist
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch (e) {
    console.warn('Could not save theme to localStorage:', e);
  }
}

/**
 * Initialize the theme on app startup. Reads the saved preference and
 * applies it. Should be called once when the app boots, before React renders.
 */
export function initializeTheme() {
  const themeId = getCurrentThemeId();
  applyTheme(themeId);
}
