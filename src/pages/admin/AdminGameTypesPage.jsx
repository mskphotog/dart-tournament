/**
 * ADMIN GAME TYPES PAGE
 *
 * Manage the library of dart games available for tournaments. Admin can add
 * new game types on the fly (e.g., a new variant they want to try this week),
 * edit existing ones, set the default match format (best-of-N), and
 * deactivate games no longer in rotation.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminGameTypesPage() {
  const [gameTypes, setGameTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Show inactive toggle
  const [showInactive, setShowInactive] = useState(false);

  // Add new game form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newGamesToWin, setNewGamesToWin] = useState('2');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit-in-place state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editGamesToWin, setEditGamesToWin] = useState('2');

  useEffect(() => {
    loadGameTypes();
  }, []);

  async function loadGameTypes() {
    setLoading(true);
    const { data } = await supabase
      .from('game_types')
      .select('*')
      .order('name');
    setGameTypes(data || []);
    setLoading(false);
  }

  // Add a new game type
  async function handleAdd(e) {
    e.preventDefault();
    setFormError('');

    if (!newName.trim()) {
      setFormError('Name is required');
      return;
    }
    const gamesToWinNum = Number(newGamesToWin);
    if (!gamesToWinNum || gamesToWinNum < 1) {
      setFormError('Games-to-win must be at least 1');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('game_types').insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      default_games_to_win: gamesToWinNum,
      is_active: true,
    });
    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setNewName('');
    setNewDescription('');
    setNewGamesToWin('2');
    setShowAddForm(false);
    await loadGameTypes();
  }

  function startEdit(gt) {
    setEditingId(gt.id);
    setEditName(gt.name);
    setEditDescription(gt.description || '');
    setEditGamesToWin(String(gt.default_games_to_win));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id) {
    if (!editName.trim()) return;
    const gamesToWinNum = Number(editGamesToWin);
    if (!gamesToWinNum || gamesToWinNum < 1) return;

    await supabase
      .from('game_types')
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        default_games_to_win: gamesToWinNum,
      })
      .eq('id', id);

    setEditingId(null);
    await loadGameTypes();
  }

  async function toggleActive(gt) {
    await supabase
      .from('game_types')
      .update({ is_active: !gt.is_active })
      .eq('id', gt.id);
    await loadGameTypes();
  }

  // Apply filter
  const visibleGameTypes = gameTypes.filter((gt) => showInactive || gt.is_active);

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
        <h1 style={{ marginBottom: 0 }}>Game Types</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add Game Type'}
        </button>
      </div>

      <p className="text-secondary mb-6">
        Define the games available when creating a tournament. The "default games-to-win"
        controls match format: 2 means best of 3, 3 means best of 5.
      </p>

      {/* Add form */}
      {showAddForm && (
        <div className="card mb-6">
          <h2>New Game Type</h2>
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
                placeholder="e.g., Around the World"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <textarea
                className="form-textarea"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows="2"
                placeholder="Quick rules summary"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Default Games-to-Win *</label>
              <input
                type="number"
                min="1"
                max="10"
                className="form-input"
                value={newGamesToWin}
                onChange={(e) => setNewGamesToWin(e.target.value)}
                required
              />
              <p className="text-secondary mt-1" style={{ fontSize: 'var(--font-size-sm)' }}>
                {newGamesToWin === '1' && 'Single game (no best-of)'}
                {newGamesToWin === '2' && 'Best of 3 (must win 2)'}
                {newGamesToWin === '3' && 'Best of 5 (must win 3)'}
                {Number(newGamesToWin) >= 4 && `Best of ${Number(newGamesToWin) * 2 - 1} (must win ${newGamesToWin})`}
              </p>
            </div>

            {formError && <div className="form-error mb-4">{formError}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
            >
              {submitting ? 'Adding...' : 'Add Game Type'}
            </button>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div className="card mb-4">
        <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            Include inactive game types
          </span>
        </label>
      </div>

      {/* Game type list */}
      {visibleGameTypes.length === 0 ? (
        <div className="empty-state">
          <p>No game types yet. Add one above.</p>
        </div>
      ) : (
        <div className="game-type-list">
          {visibleGameTypes.map((gt) => (
            <div key={gt.id} className={`card game-type-row ${!gt.is_active ? 'inactive' : ''}`}>
              {editingId === gt.id ? (
                // Edit mode
                <div className="game-type-edit">
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows="2"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Games-to-Win</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="form-input"
                      value={editGamesToWin}
                      onChange={(e) => setEditGamesToWin(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-sm btn-success" onClick={() => saveEdit(gt.id)}>
                      Save
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // Display mode
                <>
                  <div className="game-type-info">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="game-type-name">{gt.name}</span>
                      <span className="badge badge-secondary">
                        Best of {gt.default_games_to_win * 2 - 1}
                      </span>
                      {!gt.is_active && <span className="badge badge-error">Inactive</span>}
                    </div>
                    {gt.description && (
                      <p className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                        {gt.description}
                      </p>
                    )}
                  </div>
                  <div className="game-type-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => startEdit(gt)}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn btn-sm ${gt.is_active ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleActive(gt)}
                    >
                      {gt.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .game-type-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .game-type-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          flex-wrap: wrap;
        }
        .game-type-row.inactive {
          opacity: 0.6;
        }
        .game-type-info {
          flex: 1;
          min-width: 200px;
        }
        .game-type-name {
          font-size: var(--font-size-lg);
          font-weight: var(--font-weight-semibold);
        }
        .game-type-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .game-type-edit {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
