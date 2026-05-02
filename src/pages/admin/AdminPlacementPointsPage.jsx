/**
 * ADMIN PLACEMENT POINTS PAGE
 *
 * Configure how many bonus points each placement gets at the end of a
 * tournament. Default seed is 1st=5, 2nd=3, 3rd=2, 4th=1, but admin can
 * change these values, add more placement tiers, or remove them.
 *
 * Important: changes apply going forward only. Past tournaments retain the
 * placement points they were awarded at the time.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminPlacementPointsPage() {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // Add-tier form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlacement, setNewPlacement] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadTiers();
  }, []);

  async function loadTiers() {
    setLoading(true);
    const { data } = await supabase
      .from('placement_points_config')
      .select('*')
      .order('placement', { ascending: true });
    setTiers(data || []);
    setLoading(false);
  }

  // Update one tier's point value (debounced save would be nice in v2; for
  // now save explicitly via the Save button)
  function handlePointsChange(tierId, newValue) {
    setTiers((current) =>
      current.map((t) =>
        t.id === tierId ? { ...t, points: Number(newValue) || 0 } : t
      )
    );
  }

  // Save all tier changes at once
  async function handleSaveAll() {
    setSaving(true);
    setSavedMessage('');

    // Update each tier in parallel
    const updates = tiers.map((t) =>
      supabase
        .from('placement_points_config')
        .update({ points: t.points })
        .eq('id', t.id)
    );

    await Promise.all(updates);

    setSaving(false);
    setSavedMessage('Saved');

    // Clear the success message after a moment
    setTimeout(() => setSavedMessage(''), 2000);
  }

  // Delete a tier (e.g., remove the 4th-place bonus entirely)
  async function handleDelete(tierId) {
    const ok = window.confirm('Remove this placement tier?');
    if (!ok) return;
    await supabase.from('placement_points_config').delete().eq('id', tierId);
    await loadTiers();
  }

  // Add a new tier
  async function handleAdd(e) {
    e.preventDefault();
    setFormError('');

    const placementNum = Number(newPlacement);
    const pointsNum = Number(newPoints);

    if (!placementNum || placementNum < 1) {
      setFormError('Placement must be 1 or higher');
      return;
    }
    if (pointsNum < 0 || isNaN(pointsNum)) {
      setFormError('Points must be 0 or higher');
      return;
    }
    if (tiers.some((t) => t.placement === placementNum)) {
      setFormError(`Placement ${placementNum} already exists`);
      return;
    }

    const { error } = await supabase.from('placement_points_config').insert({
      placement: placementNum,
      points: pointsNum,
    });

    if (error) {
      setFormError(error.message);
      return;
    }

    setNewPlacement('');
    setNewPoints('');
    setShowAddForm(false);
    await loadTiers();
  }

  // Helper to format placement number as ordinal (1st, 2nd, 3rd, 4th, etc.)
  function ordinal(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return n + 'st';
    if (mod10 === 2 && mod100 !== 12) return n + 'nd';
    if (mod10 === 3 && mod100 !== 13) return n + 'rd';
    return n + 'th';
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading"><div className="spinner"></div></div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 style={{ marginBottom: 0 }}>Placement Points</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add Tier'}
        </button>
      </div>

      <p className="text-secondary mb-6">
        Bonus points awarded at the end of each tournament based on placement.
        These add to the per-match win points (1 point per match win) to determine
        season standings. Changes apply to future tournaments only.
      </p>

      {/* Add tier form */}
      {showAddForm && (
        <div className="card mb-6">
          <h2>New Placement Tier</h2>
          <form onSubmit={handleAdd}>
            <div className="form-group">
              <label className="form-label">Placement *</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={newPlacement}
                onChange={(e) => setNewPlacement(e.target.value)}
                required
                placeholder="e.g., 5"
              />
              <p className="text-secondary mt-1" style={{ fontSize: 'var(--font-size-sm)' }}>
                The position in the tournament (1 = champion, 2 = runner-up, etc.)
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Points *</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={newPoints}
                onChange={(e) => setNewPoints(e.target.value)}
                required
                placeholder="e.g., 1"
              />
            </div>

            {formError && <div className="form-error mb-4">{formError}</div>}

            <button type="submit" className="btn btn-primary btn-block">
              Add Tier
            </button>
          </form>
        </div>
      )}

      {/* Tier list */}
      {tiers.length === 0 ? (
        <div className="empty-state">
          <p>No placement tiers configured. Add one above.</p>
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <div className="tier-list">
              <div className="tier-header">
                <div>Placement</div>
                <div>Bonus Points</div>
                <div></div>
              </div>
              {tiers.map((t) => (
                <div key={t.id} className="tier-row">
                  <div className="tier-placement">
                    {ordinal(t.placement)}
                    {t.placement === 1 && ' 🥇'}
                    {t.placement === 2 && ' 🥈'}
                    {t.placement === 3 && ' 🥉'}
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={t.points}
                      onChange={(e) => handlePointsChange(t.id, e.target.value)}
                      style={{ maxWidth: '120px' }}
                    />
                  </div>
                  <div className="text-right">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(t.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              className="btn btn-primary"
              onClick={handleSaveAll}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save All Changes'}
            </button>
            {savedMessage && (
              <span className="text-success font-semibold">{savedMessage}</span>
            )}
          </div>
        </>
      )}

      <style>{`
        .tier-list {
          display: flex;
          flex-direction: column;
        }
        .tier-header {
          display: grid;
          grid-template-columns: 1fr 1fr 120px;
          padding: var(--space-2) var(--space-3);
          background-color: var(--color-bg-secondary);
          border-radius: var(--radius-sm);
          font-weight: var(--font-weight-semibold);
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--space-3);
        }
        .tier-row {
          display: grid;
          grid-template-columns: 1fr 1fr 120px;
          align-items: center;
          padding: var(--space-3);
          gap: var(--space-3);
          border-bottom: 1px solid var(--color-border);
        }
        .tier-row:last-child {
          border-bottom: none;
        }
        .tier-placement {
          font-weight: var(--font-weight-semibold);
          font-size: var(--font-size-lg);
        }
        @media (max-width: 600px) {
          .tier-header {
            grid-template-columns: 1fr 1fr 90px;
            font-size: var(--font-size-xs);
          }
          .tier-row {
            grid-template-columns: 1fr 1fr 90px;
            gap: var(--space-2);
            padding: var(--space-2);
          }
        }
      `}</style>
    </div>
  );
}
