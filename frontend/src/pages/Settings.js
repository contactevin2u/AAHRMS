import React, { useState, useEffect } from 'react';
import { earningsApi } from '../api';
import Layout from '../components/Layout';
import './Settings.css';

function Settings() {
  const [activeTab, setActiveTab] = useState('commissions');
  const [commissionTypes, setCommissionTypes] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [showAllowanceModal, setShowAllowanceModal] = useState(false);
  const [editingCommission, setEditingCommission] = useState(null);
  const [editingAllowance, setEditingAllowance] = useState(null);

  // Form states
  const [commissionForm, setCommissionForm] = useState({
    name: '',
    description: '',
    calculation_type: 'fixed'
  });

  const [allowanceForm, setAllowanceForm] = useState({
    name: '',
    description: '',
    is_taxable: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [commRes, allowRes] = await Promise.all([
        earningsApi.getCommissionTypes(),
        earningsApi.getAllowanceTypes()
      ]);
      setCommissionTypes(commRes.data);
      setAllowanceTypes(allowRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Commission handlers
  const openAddCommission = () => {
    setEditingCommission(null);
    setCommissionForm({
      name: '',
      description: '',
      calculation_type: 'fixed'
    });
    setShowCommissionModal(true);
  };

  const openEditCommission = (comm) => {
    setEditingCommission(comm);
    setCommissionForm({
      name: comm.name,
      description: comm.description || '',
      calculation_type: comm.calculation_type || 'fixed'
    });
    setShowCommissionModal(true);
  };

  const handleSaveCommission = async (e) => {
    e.preventDefault();
    try {
      if (editingCommission) {
        await earningsApi.updateCommissionType(editingCommission.id, commissionForm);
      } else {
        await earningsApi.createCommissionType(commissionForm);
      }
      setShowCommissionModal(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save commission type');
    }
  };

  const handleDeleteCommission = async (id) => {
    if (window.confirm('Are you sure you want to delete this commission type?')) {
      try {
        await earningsApi.deleteCommissionType(id);
        fetchData();
      } catch (error) {
        alert('Failed to delete commission type');
      }
    }
  };

  // Allowance handlers
  const openAddAllowance = () => {
    setEditingAllowance(null);
    setAllowanceForm({
      name: '',
      description: '',
      is_taxable: true
    });
    setShowAllowanceModal(true);
  };

  const openEditAllowance = (allow) => {
    setEditingAllowance(allow);
    setAllowanceForm({
      name: allow.name,
      description: allow.description || '',
      is_taxable: allow.is_taxable !== false
    });
    setShowAllowanceModal(true);
  };

  const handleSaveAllowance = async (e) => {
    e.preventDefault();
    try {
      if (editingAllowance) {
        await earningsApi.updateAllowanceType(editingAllowance.id, allowanceForm);
      } else {
        await earningsApi.createAllowanceType(allowanceForm);
      }
      setShowAllowanceModal(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save allowance type');
    }
  };

  const handleDeleteAllowance = async (id) => {
    if (window.confirm('Are you sure you want to delete this allowance type?')) {
      try {
        await earningsApi.deleteAllowanceType(id);
        fetchData();
      } catch (error) {
        alert('Failed to delete allowance type');
      }
    }
  };

  return (
    <Layout>
      <div className="settings-page">
        <header className="page-header">
          <div>
            <h1>Settings</h1>
            <p>Manage commission and allowance types</p>
          </div>
        </header>

        <div className="settings-tabs">
          <button
            className={`tab-btn ${activeTab === 'commissions' ? 'active' : ''}`}
            onClick={() => setActiveTab('commissions')}
          >
            Commission Types
          </button>
          <button
            className={`tab-btn ${activeTab === 'allowances' ? 'active' : ''}`}
            onClick={() => setActiveTab('allowances')}
          >
            Allowance Types
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="settings-content">
            {activeTab === 'commissions' && (
              <div className="type-section">
                <div className="section-header">
                  <h2>Commission Types</h2>
                  <button onClick={openAddCommission} className="add-btn">
                    + Add Commission Type
                  </button>
                </div>
                <p className="section-desc">
                  Define commission types that can be assigned to employees. These will automatically be included in payroll calculations.
                </p>

                {commissionTypes.length === 0 ? (
                  <div className="no-data">
                    <p>No commission types defined yet.</p>
                    <p>Click "+ Add Commission Type" to create your first one.</p>
                  </div>
                ) : (
                  <div className="types-grid">
                    {commissionTypes.map(comm => (
                      <div key={comm.id} className="type-card">
                        <div className="type-header">
                          <h3>{comm.name}</h3>
                          <span className={`type-badge ${comm.calculation_type}`}>
                            {comm.calculation_type === 'fixed' ? 'Fixed Amount' : 'Percentage'}
                          </span>
                        </div>
                        {comm.description && (
                          <p className="type-desc">{comm.description}</p>
                        )}
                        <div className="type-actions">
                          <button onClick={() => openEditCommission(comm)} className="edit-btn">
                            Edit
                          </button>
                          <button onClick={() => handleDeleteCommission(comm.id)} className="delete-btn">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'allowances' && (
              <div className="type-section">
                <div className="section-header">
                  <h2>Allowance Types</h2>
                  <button onClick={openAddAllowance} className="add-btn">
                    + Add Allowance Type
                  </button>
                </div>
                <p className="section-desc">
                  Define allowance types that can be assigned to employees. These will automatically be included in payroll calculations.
                </p>

                {allowanceTypes.length === 0 ? (
                  <div className="no-data">
                    <p>No allowance types defined yet.</p>
                    <p>Click "+ Add Allowance Type" to create your first one.</p>
                  </div>
                ) : (
                  <div className="types-grid">
                    {allowanceTypes.map(allow => (
                      <div key={allow.id} className="type-card">
                        <div className="type-header">
                          <h3>{allow.name}</h3>
                          <span className={`type-badge ${allow.is_taxable ? 'taxable' : 'non-taxable'}`}>
                            {allow.is_taxable ? 'Taxable' : 'Non-Taxable'}
                          </span>
                        </div>
                        {allow.description && (
                          <p className="type-desc">{allow.description}</p>
                        )}
                        <div className="type-actions">
                          <button onClick={() => openEditAllowance(allow)} className="edit-btn">
                            Edit
                          </button>
                          <button onClick={() => handleDeleteAllowance(allow.id)} className="delete-btn">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Commission Modal */}
        {showCommissionModal && (
          <div className="modal-overlay" onClick={() => setShowCommissionModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingCommission ? 'Edit Commission Type' : 'Add Commission Type'}</h2>
              <form onSubmit={handleSaveCommission}>
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={commissionForm.name}
                    onChange={(e) => setCommissionForm({ ...commissionForm, name: e.target.value })}
                    placeholder="e.g., Sales Commission, Referral Bonus"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={commissionForm.description}
                    onChange={(e) => setCommissionForm({ ...commissionForm, description: e.target.value })}
                    placeholder="Optional description..."
                    rows="3"
                  />
                </div>
                <div className="form-group">
                  <label>Calculation Type</label>
                  <select
                    value={commissionForm.calculation_type}
                    onChange={(e) => setCommissionForm({ ...commissionForm, calculation_type: e.target.value })}
                  >
                    <option value="fixed">Fixed Amount (RM)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowCommissionModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    {editingCommission ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Allowance Modal */}
        {showAllowanceModal && (
          <div className="modal-overlay" onClick={() => setShowAllowanceModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingAllowance ? 'Edit Allowance Type' : 'Add Allowance Type'}</h2>
              <form onSubmit={handleSaveAllowance}>
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={allowanceForm.name}
                    onChange={(e) => setAllowanceForm({ ...allowanceForm, name: e.target.value })}
                    placeholder="e.g., Transport Allowance, Housing Allowance"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={allowanceForm.description}
                    onChange={(e) => setAllowanceForm({ ...allowanceForm, description: e.target.value })}
                    placeholder="Optional description..."
                    rows="3"
                  />
                </div>
                <div className="form-group">
                  <label>Tax Status</label>
                  <select
                    value={allowanceForm.is_taxable ? 'taxable' : 'non-taxable'}
                    onChange={(e) => setAllowanceForm({ ...allowanceForm, is_taxable: e.target.value === 'taxable' })}
                  >
                    <option value="taxable">Taxable</option>
                    <option value="non-taxable">Non-Taxable</option>
                  </select>
                  <small className="help-text">
                    Non-taxable allowances may be exempt from PCB calculation (e.g., certain travel allowances).
                  </small>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowAllowanceModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    {editingAllowance ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Settings;
