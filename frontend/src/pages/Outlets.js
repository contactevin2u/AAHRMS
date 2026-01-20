import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { outletsApi } from '../api';
import Layout from '../components/Layout';
import './Outlets.css';

function Outlets() {
  const navigate = useNavigate();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', min_staff: 2 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOutlets();
  }, []);

  const fetchOutlets = async () => {
    try {
      setLoading(true);
      const res = await outletsApi.getAll();
      setOutlets(res.data);
    } catch (error) {
      console.error('Error fetching outlets:', error);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (outlet) => {
    setEditingOutlet(outlet);
    setForm({
      name: outlet.name || '',
      address: outlet.address || '',
      min_staff: outlet.min_staff || 2
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingOutlet(null);
    setForm({ name: '', address: '', min_staff: 2 });
  };

  const handleSave = async () => {
    if (!editingOutlet || !form.name.trim()) return;

    try {
      setSaving(true);
      await outletsApi.update(editingOutlet.id, {
        name: form.name.trim(),
        address: form.address.trim(),
        latitude: editingOutlet.latitude,
        longitude: editingOutlet.longitude,
        min_staff: parseInt(form.min_staff) || 2
      });
      closeModal();
      fetchOutlets();
    } catch (error) {
      console.error('Error updating outlet:', error);
    } finally {
      setSaving(false);
    }
  };

  const totalEmployees = outlets.reduce((sum, o) => sum + (o.employee_count || 0), 0);
  const totalMinStaff = outlets.reduce((sum, o) => sum + (o.min_staff || 2), 0);

  if (loading) {
    return (
      <Layout>
        <div className="outlets-page">
          <div className="outlets-loading">Loading outlets...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="outlets-page">
        {/* Header */}
        <div className="outlets-header">
          <div className="outlets-title">
            <h1>Outlets</h1>
            <p>{outlets.length} locations</p>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="outlets-stats">
          <div className="stat-card">
            <div className="stat-icon blue">📍</div>
            <div className="stat-info">
              <span className="stat-number">{outlets.length}</span>
              <span className="stat-label">Total Outlets</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">👥</div>
            <div className="stat-info">
              <span className="stat-number">{totalEmployees}</span>
              <span className="stat-label">Total Staff</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon purple">📋</div>
            <div className="stat-info">
              <span className="stat-number">{totalMinStaff}</span>
              <span className="stat-label">Min Required</span>
            </div>
          </div>
        </div>

        {/* Outlets Grid */}
        {outlets.length === 0 ? (
          <div className="outlets-empty">
            <div className="empty-icon">🏪</div>
            <h3>No outlets yet</h3>
            <p>Outlets will appear here once created</p>
          </div>
        ) : (
          <div className="outlets-grid">
            {outlets.map(outlet => {
              const staffCount = outlet.employee_count || 0;
              const minStaff = outlet.min_staff || 2;
              const isUnderstaffed = staffCount < minStaff;
              const isOverstaffed = staffCount > minStaff * 1.5;

              return (
                <div key={outlet.id} className="outlet-card">
                  <div className="outlet-top">
                    <div className="outlet-name">{outlet.name}</div>
                    <button
                      className="outlet-edit-btn"
                      onClick={() => openEditModal(outlet)}
                      title="Edit outlet"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>

                  {outlet.address && (
                    <div className="outlet-address">{outlet.address}</div>
                  )}

                  <div className="outlet-metrics">
                    <div
                      className={`metric-badge ${isUnderstaffed ? 'warning' : isOverstaffed ? 'info' : 'good'}`}
                      onClick={() => navigate(`/admin/employees?outlet_id=${outlet.id}`)}
                      title="Click to view employees"
                    >
                      <span className="metric-value">{staffCount}</span>
                      <span className="metric-label">staff</span>
                    </div>
                    <div className="metric-divider">/</div>
                    <div className="metric-badge neutral" title="Minimum staff per shift">
                      <span className="metric-value">{minStaff}</span>
                      <span className="metric-label">min</span>
                    </div>
                  </div>

                  {isUnderstaffed && (
                    <div className="outlet-alert warning">
                      Needs {minStaff - staffCount} more staff
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Modal */}
        {showModal && (
          <div className="modal-backdrop" onClick={closeModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Outlet</h2>
                <button className="modal-close" onClick={closeModal}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="modal-body">
                <div className="form-field">
                  <label>Outlet Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Mimix A IOI Mall"
                  />
                </div>

                <div className="form-field">
                  <label>Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    placeholder="e.g. IOI Mall, Putrajaya"
                  />
                </div>

                <div className="form-field">
                  <label>
                    Minimum Staff per Shift
                    <span className="field-hint">Used for schedule coverage</span>
                  </label>
                  <div className="number-input-group">
                    <button
                      type="button"
                      className="number-btn"
                      onClick={() => setForm({ ...form, min_staff: Math.max(1, (parseInt(form.min_staff) || 2) - 1) })}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={form.min_staff}
                      onChange={e => setForm({ ...form, min_staff: e.target.value })}
                      min="1"
                      max="50"
                      className="number-input"
                    />
                    <button
                      type="button"
                      className="number-btn"
                      onClick={() => setForm({ ...form, min_staff: Math.min(50, (parseInt(form.min_staff) || 2) + 1) })}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button className="btn-save" onClick={handleSave} disabled={saving || !form.name.trim()}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Outlets;
