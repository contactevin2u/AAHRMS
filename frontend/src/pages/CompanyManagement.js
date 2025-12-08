import React, { useState, useEffect } from 'react';
import api from '../api';

function CompanyManagement() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
    address: '',
    registration_number: ''
  });
  const [adminFormData, setAdminFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'boss'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await api.get('/companies');
      setCompanies(response.data);
    } catch (err) {
      setError('Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (editingCompany) {
        await api.put(`/companies/${editingCompany.id}`, formData);
        setSuccess('Company updated successfully');
      } else {
        await api.post('/companies', formData);
        setSuccess('Company created successfully');
      }
      setShowModal(false);
      setEditingCompany(null);
      setFormData({ name: '', code: '', email: '', phone: '', address: '', registration_number: '' });
      fetchCompanies();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save company');
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await api.post(`/companies/${selectedCompany.id}/admin`, adminFormData);
      setSuccess(`Admin created for ${selectedCompany.name}`);
      setShowAdminModal(false);
      setSelectedCompany(null);
      setAdminFormData({ username: '', password: '', name: '', email: '', role: 'boss' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create admin');
    }
  };

  const handleStatusChange = async (companyId, newStatus) => {
    try {
      await api.patch(`/companies/${companyId}/status`, { status: newStatus });
      setSuccess(`Company ${newStatus === 'active' ? 'activated' : newStatus}`);
      fetchCompanies();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  };

  const openEditModal = (company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name || '',
      code: company.code || '',
      email: company.email || '',
      phone: company.phone || '',
      address: company.address || '',
      registration_number: company.registration_number || ''
    });
    setShowModal(true);
  };

  const openCreateAdminModal = (company) => {
    setSelectedCompany(company);
    setAdminFormData({ username: '', password: '', name: '', email: '', role: 'boss' });
    setShowAdminModal(true);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading companies...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Company Management</h1>
        <button
          onClick={() => {
            setEditingCompany(null);
            setFormData({ name: '', code: '', email: '', phone: '', address: '', registration_number: '' });
            setShowModal(true);
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          + Add Company
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
          {success}
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Company</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Code</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Employees</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Admins</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>
                  <div>
                    <strong>{company.name}</strong>
                    {company.email && <div style={{ fontSize: '12px', color: '#666' }}>{company.email}</div>}
                  </div>
                </td>
                <td style={{ padding: '12px' }}>{company.code}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{company.employee_count || 0}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{company.admin_count || 0}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    backgroundColor: company.status === 'active' ? '#e8f5e9' : '#ffebee',
                    color: company.status === 'active' ? '#2e7d32' : '#c62828'
                  }}>
                    {company.status}
                  </span>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => openEditModal(company)}
                    style={{ marginRight: '8px', padding: '6px 12px', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openCreateAdminModal(company)}
                    style={{ marginRight: '8px', padding: '6px 12px', cursor: 'pointer', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                  >
                    + Admin
                  </button>
                  {company.id !== 1 && (
                    <button
                      onClick={() => handleStatusChange(company.id, company.status === 'active' ? 'suspended' : 'active')}
                      style={{
                        padding: '6px 12px',
                        cursor: 'pointer',
                        backgroundColor: company.status === 'active' ? '#ff9800' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px'
                      }}
                    >
                      {company.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Company Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '90%' }}>
            <h2 style={{ marginTop: 0 }}>{editingCompany ? 'Edit Company' : 'Create New Company'}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Company Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Company Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  required
                  disabled={!!editingCompany}
                  placeholder="e.g., ACME"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minHeight: '60px' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Registration Number</label>
                <input
                  type="text"
                  value={formData.registration_number}
                  onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '10px 20px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 20px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  {editingCompany ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Admin Modal */}
      {showAdminModal && selectedCompany && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', width: '450px', maxWidth: '90%' }}>
            <h2 style={{ marginTop: 0 }}>Create Admin for {selectedCompany.name}</h2>
            <form onSubmit={handleCreateAdmin}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Username *</label>
                <input
                  type="text"
                  value={adminFormData.username}
                  onChange={(e) => setAdminFormData({ ...adminFormData, username: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Password *</label>
                <input
                  type="password"
                  value={adminFormData.password}
                  onChange={(e) => setAdminFormData({ ...adminFormData, password: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Full Name *</label>
                <input
                  type="text"
                  value={adminFormData.name}
                  onChange={(e) => setAdminFormData({ ...adminFormData, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Email</label>
                <input
                  type="email"
                  value={adminFormData.email}
                  onChange={(e) => setAdminFormData({ ...adminFormData, email: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Role</label>
                <select
                  value={adminFormData.role}
                  onChange={(e) => setAdminFormData({ ...adminFormData, role: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                >
                  <option value="boss">Boss</option>
                  <option value="director">Director</option>
                  <option value="hr">HR</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  style={{ padding: '10px 20px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Create Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompanyManagement;
