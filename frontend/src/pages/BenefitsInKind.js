import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { benefitsApi, employeeApi } from '../api';
import './BenefitsInKind.css';

const BenefitsInKind = () => {
  const [benefits, setBenefits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [benefitTypes, setBenefitTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBenefit, setEditingBenefit] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    benefit_type: '',
    employee_id: ''
  });

  const [formData, setFormData] = useState({
    employee_id: '',
    benefit_name: '',
    benefit_type: '',
    description: '',
    annual_value: '',
    assigned_date: new Date().toISOString().split('T')[0],
    serial_number: '',
    asset_tag: '',
    condition: 'good',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [benefitsRes, employeesRes, typesRes] = await Promise.all([
        benefitsApi.getAll(filters),
        employeeApi.getAll(),
        benefitsApi.getTypes().catch(() => ({ data: [] }))
      ]);
      setBenefits(benefitsRes.data);
      setEmployees(employeesRes.data);
      setBenefitTypes(typesRes.data || []);
    } catch (error) {
      console.error('Error fetching benefits:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingBenefit(null);
    setFormData({
      employee_id: '',
      benefit_name: '',
      benefit_type: '',
      description: '',
      annual_value: '',
      assigned_date: new Date().toISOString().split('T')[0],
      serial_number: '',
      asset_tag: '',
      condition: 'good',
      notes: ''
    });
    setShowModal(true);
  };

  const openEditModal = (benefit) => {
    setEditingBenefit(benefit);
    setFormData({
      employee_id: benefit.employee_id,
      benefit_name: benefit.benefit_name,
      benefit_type: benefit.benefit_type,
      description: benefit.description || '',
      annual_value: benefit.annual_value || '',
      assigned_date: benefit.assigned_date?.split('T')[0] || '',
      serial_number: benefit.serial_number || '',
      asset_tag: benefit.asset_tag || '',
      condition: benefit.condition || 'good',
      notes: benefit.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBenefit) {
        await benefitsApi.update(editingBenefit.id, formData);
      } else {
        await benefitsApi.create(formData);
      }
      setShowModal(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save benefit');
    }
  };

  const handleReturn = async (benefit) => {
    if (!window.confirm(`Mark "${benefit.benefit_name}" as returned from ${benefit.employee_name}?`)) {
      return;
    }

    const condition = prompt('Enter condition (good/fair/poor):', 'good');
    if (!condition) return;

    try {
      await benefitsApi.returnBenefit(benefit.id, {
        return_date: new Date().toISOString().split('T')[0],
        condition
      });
      fetchData();
    } catch (error) {
      alert('Failed to mark as returned');
    }
  };

  const handleDelete = async (benefit) => {
    if (!window.confirm(`Delete "${benefit.benefit_name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await benefitsApi.delete(benefit.id);
      fetchData();
    } catch (error) {
      alert('Failed to delete benefit');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `RM ${parseFloat(value).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status) => {
    const badges = {
      active: 'status-active',
      returned: 'status-returned',
      lost: 'status-lost'
    };
    return badges[status] || 'status-active';
  };

  const getConditionBadge = (condition) => {
    const badges = {
      good: 'condition-good',
      fair: 'condition-fair',
      poor: 'condition-poor'
    };
    return badges[condition] || 'condition-good';
  };

  // Calculate totals
  const activeBenefits = benefits.filter(b => b.status === 'active');
  const totalAnnualValue = activeBenefits.reduce((sum, b) => sum + parseFloat(b.annual_value || 0), 0);
  const totalMonthlyValue = totalAnnualValue / 12;

  return (
    <Layout>
      <div className="bik-page">
        <div className="page-header">
          <div className="header-content">
            <h1>Benefits In Kind</h1>
            <p>Manage company assets assigned to employees</p>
          </div>
          <button className="add-btn" onClick={openAddModal}>
            + Assign Benefit
          </button>
        </div>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">&#128187;</div>
            <div className="summary-content">
              <span className="summary-value">{activeBenefits.length}</span>
              <span className="summary-label">Active Benefits</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">&#128176;</div>
            <div className="summary-content">
              <span className="summary-value">{formatCurrency(totalAnnualValue)}</span>
              <span className="summary-label">Total Annual Value</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">&#128197;</div>
            <div className="summary-content">
              <span className="summary-value">{formatCurrency(totalMonthlyValue)}</span>
              <span className="summary-label">Monthly Value</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-group">
            <label>Status</label>
            <select name="status" value={filters.status} onChange={handleFilterChange}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="returned">Returned</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Type</label>
            <select name="benefit_type" value={filters.benefit_type} onChange={handleFilterChange}>
              <option value="">All Types</option>
              {benefitTypes.map(type => (
                <option key={type.code} value={type.code}>{type.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Employee</label>
            <select name="employee_id" value={filters.employee_id} onChange={handleFilterChange}>
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Benefits Table */}
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="bik-table-wrapper">
            <table className="bik-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Benefit</th>
                  <th>Type</th>
                  <th>Annual Value</th>
                  <th>Assigned</th>
                  <th>Asset Tag</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {benefits.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="no-data">
                      No benefits found
                    </td>
                  </tr>
                ) : (
                  benefits.map(benefit => (
                    <tr key={benefit.id}>
                      <td>
                        <div className="employee-info">
                          <span className="emp-name">{benefit.employee_name}</span>
                          <span className="emp-dept">{benefit.department_name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="benefit-info">
                          <span className="benefit-name">{benefit.benefit_name}</span>
                          {benefit.description && (
                            <span className="benefit-desc">{benefit.description}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="type-badge">{benefit.benefit_type_name || benefit.benefit_type}</span>
                      </td>
                      <td className="value-cell">
                        {formatCurrency(benefit.annual_value)}
                        <span className="monthly-value">
                          ({formatCurrency(benefit.monthly_value)}/mo)
                        </span>
                      </td>
                      <td>{formatDate(benefit.assigned_date)}</td>
                      <td className="asset-tag">
                        {benefit.asset_tag || '-'}
                        {benefit.serial_number && (
                          <span className="serial-number">S/N: {benefit.serial_number}</span>
                        )}
                      </td>
                      <td>
                        <span className={`condition-badge ${getConditionBadge(benefit.condition)}`}>
                          {benefit.condition}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusBadge(benefit.status)}`}>
                          {benefit.status}
                        </span>
                        {benefit.return_date && (
                          <span className="return-date">
                            Returned: {formatDate(benefit.return_date)}
                          </span>
                        )}
                      </td>
                      <td className="actions-cell">
                        <button
                          className="action-btn edit"
                          onClick={() => openEditModal(benefit)}
                          title="Edit"
                        >
                          Edit
                        </button>
                        {benefit.status === 'active' && (
                          <button
                            className="action-btn return"
                            onClick={() => handleReturn(benefit)}
                            title="Mark as Returned"
                          >
                            Return
                          </button>
                        )}
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(benefit)}
                          title="Delete"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingBenefit ? 'Edit Benefit' : 'Assign New Benefit'}</h2>
                <button className="close-btn" onClick={() => setShowModal(false)}>x</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Employee *</label>
                    <select
                      name="employee_id"
                      value={formData.employee_id}
                      onChange={handleInputChange}
                      required
                      disabled={!!editingBenefit}
                    >
                      <option value="">Select Employee</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.name} ({e.employee_id})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Benefit Name *</label>
                    <input
                      type="text"
                      name="benefit_name"
                      value={formData.benefit_name}
                      onChange={handleInputChange}
                      placeholder="e.g., Company Car - Toyota Vios"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Type *</label>
                    <select
                      name="benefit_type"
                      value={formData.benefit_type}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select Type</option>
                      <option value="CAR">Company Car</option>
                      <option value="IPAD">iPad</option>
                      <option value="LAPTOP">Laptop</option>
                      <option value="PHONE">Mobile Phone</option>
                      <option value="FUEL">Fuel Card</option>
                      <option value="PARKING">Parking</option>
                      <option value="HOUSING">Housing</option>
                      <option value="FURNITURE">Furniture</option>
                      <option value="UNIFORM">Uniform/Attire</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Annual Value (RM) *</label>
                    <input
                      type="number"
                      name="annual_value"
                      value={formData.annual_value}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      step="0.01"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Assigned Date *</label>
                    <input
                      type="date"
                      name="assigned_date"
                      value={formData.assigned_date}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Asset Tag</label>
                    <input
                      type="text"
                      name="asset_tag"
                      value={formData.asset_tag}
                      onChange={handleInputChange}
                      placeholder="e.g., AA-CAR-001"
                    />
                  </div>
                  <div className="form-group">
                    <label>Serial Number</label>
                    <input
                      type="text"
                      name="serial_number"
                      value={formData.serial_number}
                      onChange={handleInputChange}
                      placeholder="e.g., SN123456"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Condition</label>
                    <select
                      name="condition"
                      value={formData.condition}
                      onChange={handleInputChange}
                    >
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Additional details about the benefit..."
                    rows="2"
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="Internal notes..."
                    rows="2"
                  />
                </div>

                <div className="modal-footer">
                  <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    {editingBenefit ? 'Update' : 'Assign Benefit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BenefitsInKind;
