/**
 * ADMIN PLAYERS PAGE
 *
 * Manage the persistent roster of players. Admin can add new roster members,
 * edit existing player info, mark walk-ins as roster regulars, and deactivate
 * players who are no longer participating.
 *
 * Players cannot be hard-deleted from the UI because they may have
 * tournament history. Deactivating sets is_active=false which hides them
 * from check-in lists and standings.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminPlayersPage() {
  // Master list of all players (active and inactive)
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter UI state
  const [showInactive, setShowInactive] = useState(false);
  const [filter, setFilter] = useState('all'); // all | roster | walkin

  // Add-player form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit-in-place tracking: holds the id of the player being edited
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  useEffect(() => {
    loadPlayers();
  }, []);

  async function loadPlayers() {
    setLoading(true);
    // Get every player; we'll filter client-side for instant toggling
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name', { ascending: true });
    setPlayers(data || []);
    setLoading(false);
  }

  // Add a new roster player
  async function handleAdd(e) {
    e.preventDefault();
    setFormError('');

    if (!newName.trim()) {
      setFormError('Name is required');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('players').insert({
      name: newName.trim(),
      email: newEmail.trim() || null,
      phone: newPhone.trim() || null,
      is_roster: true,
      is_active: true,
    });
    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    // Reset form, reload list
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setShowAddForm(false);
    await loadPlayers();
  }

  // Begin editing a player row
  function startEdit(player) {
    setEditingId(player.id);
    setEditName(player.name);
    setEditEmail(player.email || '');
    setEditPhone(player.phone || '');
  }

  // Cancel edit
  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditEmail('');
    setEditPhone('');
  }

  // Save edited player
  async function saveEdit(playerId) {
    if (!editName.trim()) return;

    await supabase
      .from('players')
      .update({
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
      })
      .eq('id', playerId);

    setEditingId(null);
    await loadPlayers();
  }

  // Toggle active state (soft delete / restore)
  async function toggleActive(player) {
    await supabase
      .from('players')
      .update({ is_active: !player.is_active })
      .eq('id', player.id);
    await loadPlayers();
  }

  // Promote a walk-in to roster member
  async function promoteToRoster(player) {
    await supabase
      .from('players')
      .update({ is_roster: true })
      .eq('id', player.id);
    await loadPlayers();
  }

  // Demote roster member to walk-in (rarely used, but available)
  async function demoteToWalkIn(player) {
    await supabase
      .from('players')
      .update({ is_roster: false })
      .eq('id', player.id);
    await loadPlayers();
  }

  // Apply filters to the displayed list
  const visiblePlayers = players.filter((p) => {
    if (!showInactive && !p.is_active) return false;
    if (filter === 'roster' && !p.is_roster) return false;
    if (filter === 'walkin' && p.is_roster) return false;
    return true;
  });

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
        <h1 style={{ marginBottom: 0 }}>Players</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add Player'}
        </button>
      </div>

      {/* Add new player form */}
      {showAddForm && (
        <div className="card mb-6">
          <h2>New Player</h2>
          <form onSubmit={handleAdd}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email (optional)</label>
              <input
                type="email"
                className="form-input"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone (optional)</label>
              <input
                type="tel"
                className="form-input"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>

            {formError && <div className="form-error mb-4">{formError}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
            >
              {submitting ? 'Adding...' : 'Add Player'}
            </button>
          </form>
        </div>
      )}

      {/* Filter controls */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>Show:</label>
            <select
              className="form-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ minWidth: '140px' }}
            >
              <option value="all">All Players</option>
              <option value="roster">Roster Only</option>
              <option value="walkin">Walk-ins Only</option>
            </select>
          </div>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            <span className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              Include inactive
            </span>
          </label>
          <span className="text-secondary" style={{ fontSize: 'var(--font-size-sm)', marginLeft: 'auto' }}>
            {visiblePlayers.length} player{visiblePlayers.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Player list */}
      {visiblePlayers.length === 0 ? (
        <div className="empty-state">
          <p>No players match the current filter.</p>
        </div>
      ) : (
        <div className="player-list">
          {visiblePlayers.map((p) => (
            <div key={p.id} className={`card player-row ${!p.is_active ? 'inactive' : ''}`}>
              {editingId === p.id ? (
                // Edit mode
                <div className="player-edit-form">
                  <input
                    type="text"
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                  />
                  <input
                    type="email"
                    className="form-input"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Email"
                  />
                  <input
                    type="tel"
                    className="form-input"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Phone"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => saveEdit(p.id)}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // Display mode
                <>
                  <div className="player-info">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="player-name">{p.name}</span>
                      {p.is_roster ? (
                        <span className="badge badge-secondary">Roster</span>
                      ) : (
                        <span className="badge badge-neutral">Walk-in</span>
                      )}
                      {!p.is_active && <span className="badge badge-error">Inactive</span>}
                    </div>
                    {(p.email || p.phone) && (
                      <div className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                        {p.email}
                        {p.email && p.phone && ' · '}
                        {p.phone}
                      </div>
                    )}
                  </div>

                  <div className="player-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => startEdit(p)}
                    >
                      Edit
                    </button>
                    {p.is_roster ? (
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => demoteToWalkIn(p)}
                        title="Mark as walk-in"
                      >
                        → Walk-in
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => promoteToRoster(p)}
                        title="Add to regular roster"
                      >
                        → Roster
                      </button>
                    )}
                    <button
                      className={`btn btn-sm ${p.is_active ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleActive(p)}
                    >
                      {p.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .player-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .player-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          flex-wrap: wrap;
        }
        .player-row.inactive {
          opacity: 0.6;
        }
        .player-info {
          flex: 1;
          min-width: 200px;
        }
        .player-name {
          font-size: var(--font-size-lg);
          font-weight: var(--font-weight-semibold);
        }
        .player-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .player-edit-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          width: 100%;
        }
      `}</style>
    </div>
  );
}
