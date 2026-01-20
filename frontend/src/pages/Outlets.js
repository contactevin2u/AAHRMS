import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { outletsApi } from '../api';
import Layout from '../components/Layout';
import './Departments.css'; // Reuse departments styling

function Outlets() {
  const navigate = useNavigate();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    min_staff: 2
  });
  const [saving, setSaving] = useState(false);

  const viewEmployees = (outletId) => {
    navigate(`/admin/employees?outlet_id=${outletId}`);
  };

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
    if (!editingOutlet) return;

    try {
      setSaving(true);
      await outletsApi.update(editingOutlet.id, {
        name: form.name,
        address: form.address,
        latitude: editingOutlet.latitude,
        longitude: editingOutlet.longitude,
        min_staff: parseInt(form.min_staff) || 2
      });
      closeModal();
      fetchOutlets();
    } catch (error) {
      console.error('Error updating outlet:', error);
      alert('Failed to update outlet. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="departments-page">
        <header className="page-header">
          <div>
            <h1>Outlets</h1>
            <p>View and manage outlet locations</p>
          </div>
        </header>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : outlets.length === 0 ? (
          <div className="no-departments">
            <p>No outlets found.</p>
          </div>
        ) : (
          <div className="departments-grid">
            {outlets.map(outlet => (
              <div key={outlet.id} className="dept-card">
                <div className="dept-header">
                  <h3>{outlet.name}</h3>
                  <span
                    className="employee-count clickable"
                    onClick={() => viewEmployees(outlet.id)}
                    title="View employees in this outlet"
                  >
                    {outlet.employee_count || 0} employees
                  </span>
                </div>

                {outlet.address && (
                  <div className="dept-type">
                    <span className="type-label">Address:</span>
                    <span className="type-value">{outlet.address}</span>
                  </div>
                )}

                <div className="config-preview">
                  <div className="config-item">
                    <span>Min Staff per Shift:</span>
                    <span>{outlet.min_staff || 2}</span>
                  </div>
                </div>

                <div className="dept-actions">
                  <button
                    onClick={() => openEditModal(outlet)}
                    className="config-btn"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => viewEmployees(outlet.id)}
                    className="view-employees-btn"
                  >
                    View Employees
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h2>Edit Outlet</h2>
              <p className="modal-subtitle">Update outlet information and staffing requirements</p>

              <div className="form-group">
                <label>Outlet Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter outlet name"
                />
              </div>

              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="Enter address"
                />
              </div>

              <div className="form-group">
                <label>Minimum Staff per Shift</label>
                <input
                  type="number"
                  value={form.min_staff}
                  onChange={e => setForm({ ...form, min_staff: e.target.value })}
                  min="1"
                  max="50"
                  placeholder="2"
                />
                <small style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '5px', display: 'block' }}>
                  Used for schedule coverage calculation
                </small>
              </div>

              <div className="modal-actions">
                <button className="cancel-btn" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSave} disabled={saving}>
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
