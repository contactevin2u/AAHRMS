import React, { useState, useEffect, useRef } from 'react';
import { earningsApi, companiesApi } from '../api';
import api from '../api';
import Layout from '../components/Layout';
import './Settings.css';

function Settings() {
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isSuperAdmin = adminInfo.role === 'super_admin';

  const [activeTab, setActiveTab] = useState('commissions');
  const [commissionTypes, setCommissionTypes] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Company management state (super admin only)
  const [companies, setCompanies] = useState([]);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState({
    name: '', code: '', email: '', phone: '', address: '', registration_number: ''
  });
  const [adminForm, setAdminForm] = useState({
    username: '', password: '', name: '', email: '', role: 'boss'
  });

  // Letterhead management state
  const [letterheadUploading, setLetterheadUploading] = useState(false);
  const letterheadRef = useRef(null);
  const stampRef = useRef(null);

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
    if (isSuperAdmin) fetchCompanies();
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

  // Company management functions
  const fetchCompanies = async () => {
    try {
      if (isSuperAdmin) {
        const response = await api.get('/companies');
        setCompanies(response.data);
      } else {
        // Non-super-admin: get own company info
        const response = await companiesApi.getCurrentInfo();
        if (response.data.company) {
          setCompanies([response.data.company]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    }
  };

  // Letterhead management functions
  const handleUploadLetterhead = async (companyId, file) => {
    setLetterheadUploading(true);
    try {
      const formData = new FormData();
      formData.append('letterhead', file);
      await companiesApi.uploadLetterhead(companyId, formData);
      alert('Letterhead uploaded successfully!');
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to upload letterhead');
    } finally {
      setLetterheadUploading(false);
    }
  };

  const handleDeleteLetterhead = async (companyId) => {
    if (!window.confirm('Remove letterhead for this company?')) return;
    try {
      await companiesApi.deleteLetterhead(companyId);
      fetchCompanies();
    } catch (err) {
      alert('Failed to delete letterhead');
    }
  };

  const handleUploadStamp = async (companyId, file) => {
    setLetterheadUploading(true);
    try {
      const formData = new FormData();
      formData.append('stamp', file);
      await companiesApi.uploadStamp(companyId, formData);
      alert('Company stamp uploaded successfully!');
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to upload stamp');
    } finally {
      setLetterheadUploading(false);
    }
  };

  const handleDeleteStamp = async (companyId) => {
    if (!window.confirm('Remove company stamp for this company?')) return;
    try {
      await companiesApi.deleteStamp(companyId);
      fetchCompanies();
    } catch (err) {
      alert('Failed to delete stamp');
    }
  };

  const handleCompanySubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCompany) {
        await api.put(`/companies/${editingCompany.id}`, companyForm);
      } else {
        await api.post('/companies', companyForm);
      }
      setShowCompanyModal(false);
      setEditingCompany(null);
      setCompanyForm({ name: '', code: '', email: '', phone: '', address: '', registration_number: '' });
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save company');
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/companies/${selectedCompany.id}/admin`, adminForm);
      alert(`Admin created for ${selectedCompany.name}`);
      setShowAdminModal(false);
      setSelectedCompany(null);
      setAdminForm({ username: '', password: '', name: '', email: '', role: 'boss' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create admin');
    }
  };

  const handleCompanyStatus = async (companyId, newStatus) => {
    try {
      await api.patch(`/companies/${companyId}/status`, { status: newStatus });
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  const openEditCompany = (company) => {
    setEditingCompany(company);
    setCompanyForm({
      name: company.name || '', code: company.code || '', email: company.email || '',
      phone: company.phone || '', address: company.address || '', registration_number: company.registration_number || ''
    });
    setShowCompanyModal(true);
  };

  const openCreateAdmin = (company) => {
    setSelectedCompany(company);
    setAdminForm({ username: '', password: '', name: '', email: '', role: 'boss' });
    setShowAdminModal(true);
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
            Commissions
          </button>
          <button
            className={`tab-btn ${activeTab === 'allowances' ? 'active' : ''}`}
            onClick={() => setActiveTab('allowances')}
          >
            Allowances
          </button>
          <button
            className={`tab-btn ${activeTab === 'letterhead' ? 'active' : ''}`}
            onClick={() => { setActiveTab('letterhead'); if (companies.length === 0) fetchCompanies(); }}
          >
            Letterhead
          </button>
          {isSuperAdmin && (
            <button
              className={`tab-btn ${activeTab === 'companies' ? 'active' : ''}`}
              onClick={() => setActiveTab('companies')}
            >
              Companies
            </button>
          )}
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

            {activeTab === 'letterhead' && (
              <div className="type-section">
                <div className="section-header">
                  <h2>Company Letterhead & Stamp</h2>
                </div>
                <p className="section-desc">
                  Upload letterhead images and company stamps for each company. These will appear on HR letters automatically.
                </p>

                {companies.length === 0 ? (
                  <div className="no-data"><p>Loading companies...</p></div>
                ) : (
                  <div className="letterhead-grid">
                    {companies.map(company => (
                      <div key={company.id} className="letterhead-card">
                        <h3>{company.name}</h3>
                        <p className="company-code-label">{company.code}</p>

                        {/* Letterhead Section */}
                        <div className="letterhead-section">
                          <label>Letterhead Image</label>
                          {company.letterhead_url ? (
                            <div className="letterhead-preview">
                              <img src={company.letterhead_url} alt="Letterhead" />
                              <div className="letterhead-actions">
                                <button
                                  className="delete-btn"
                                  onClick={() => handleDeleteLetterhead(company.id)}
                                >
                                  Remove
                                </button>
                                <label className="edit-btn upload-label">
                                  Change
                                  <input
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={(e) => {
                                      if (e.target.files[0]) handleUploadLetterhead(company.id, e.target.files[0]);
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="letterhead-upload">
                              <label className="upload-area" style={{ opacity: letterheadUploading ? 0.5 : 1 }}>
                                <span>Click to upload letterhead image</span>
                                <small>PNG or JPG, max 5MB</small>
                                <input
                                  type="file"
                                  accept="image/*"
                                  hidden
                                  disabled={letterheadUploading}
                                  onChange={(e) => {
                                    if (e.target.files[0]) handleUploadLetterhead(company.id, e.target.files[0]);
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Company Stamp Section */}
                        <div className="letterhead-section">
                          <label>Company Stamp / Chop</label>
                          {company.company_stamp_url ? (
                            <div className="letterhead-preview stamp-preview">
                              <img src={company.company_stamp_url} alt="Company Stamp" />
                              <div className="letterhead-actions">
                                <button
                                  className="delete-btn"
                                  onClick={() => handleDeleteStamp(company.id)}
                                >
                                  Remove
                                </button>
                                <label className="edit-btn upload-label">
                                  Change
                                  <input
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={(e) => {
                                      if (e.target.files[0]) handleUploadStamp(company.id, e.target.files[0]);
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="letterhead-upload">
                              <label className="upload-area" style={{ opacity: letterheadUploading ? 0.5 : 1 }}>
                                <span>Click to upload company stamp</span>
                                <small>PNG (transparent background recommended), max 5MB</small>
                                <input
                                  type="file"
                                  accept="image/*"
                                  hidden
                                  disabled={letterheadUploading}
                                  onChange={(e) => {
                                    if (e.target.files[0]) handleUploadStamp(company.id, e.target.files[0]);
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'companies' && isSuperAdmin && (
              <div className="type-section">
                <div className="section-header">
                  <h2>Companies</h2>
                  <button onClick={() => { setEditingCompany(null); setCompanyForm({ name: '', code: '', email: '', phone: '', address: '', registration_number: '' }); setShowCompanyModal(true); }} className="add-btn">
                    + Add Company
                  </button>
                </div>
                <p className="section-desc">Manage companies in the system. Each company can have its own employees and admins.</p>

                <div className="companies-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Code</th>
                        <th>Employees</th>
                        <th>Admins</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map(company => (
                        <tr key={company.id}>
                          <td>
                            <strong>{company.name}</strong>
                            {company.email && <small className="company-email">{company.email}</small>}
                          </td>
                          <td>{company.code}</td>
                          <td className="center">{company.employee_count || 0}</td>
                          <td className="center">{company.admin_count || 0}</td>
                          <td className="center">
                            <span className={`status-badge ${company.status}`}>{company.status}</span>
                          </td>
                          <td className="actions">
                            <button onClick={() => openEditCompany(company)} className="edit-btn">Edit</button>
                            <button onClick={() => openCreateAdmin(company)} className="add-btn small">+ Admin</button>
                            {company.id !== 1 && (
                              <button onClick={() => handleCompanyStatus(company.id, company.status === 'active' ? 'suspended' : 'active')}
                                className={company.status === 'active' ? 'delete-btn' : 'edit-btn'}>
                                {company.status === 'active' ? 'Suspend' : 'Activate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

        {/* Company Modal */}
        {showCompanyModal && (
          <div className="modal-overlay" onClick={() => setShowCompanyModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingCompany ? 'Edit Company' : 'Add Company'}</h2>
              <form onSubmit={handleCompanySubmit}>
                <div className="form-group">
                  <label>Company Name *</label>
                  <input type="text" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Code *</label>
                  <input type="text" value={companyForm.code} onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value.toUpperCase() })} required disabled={!!editingCompany} placeholder="e.g., ACME" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} rows="2" />
                </div>
                <div className="form-group">
                  <label>Registration Number</label>
                  <input type="text" value={companyForm.registration_number} onChange={(e) => setCompanyForm({ ...companyForm, registration_number: e.target.value })} />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowCompanyModal(false)} className="cancel-btn">Cancel</button>
                  <button type="submit" className="save-btn">{editingCompany ? 'Update' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Admin Modal */}
        {showAdminModal && selectedCompany && (
          <div className="modal-overlay" onClick={() => setShowAdminModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Create Admin for {selectedCompany.name}</h2>
              <form onSubmit={handleCreateAdmin}>
                <div className="form-group">
                  <label>Username *</label>
                  <input type="text" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Password *</label>
                  <input type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input type="text" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={adminForm.role} onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value })}>
                    <option value="boss">Boss</option>
                    <option value="director">Director</option>
                    <option value="hr">HR</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowAdminModal(false)} className="cancel-btn">Cancel</button>
                  <button type="submit" className="save-btn">Create Admin</button>
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
