import React, { useState, useEffect } from 'react';
import { publicHolidaysApi, companiesApi } from '../api';
import Layout from '../components/Layout';
import './PublicHolidays.css';

function PublicHolidays() {
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isSuperAdmin = adminInfo.role === 'super_admin';

  const [holidays, setHolidays] = useState([]);
  const [yearSummary, setYearSummary] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // Filters
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [form, setForm] = useState({
    name: '',
    date: '',
    description: '',
    extra_pay: true
  });

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    } else {
      // Non-super admin - use their company
      setSelectedCompany(adminInfo.company_id);
    }
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      fetchHolidays();
      fetchYearSummary();
    }
  }, [selectedCompany, selectedYear]);

  const fetchCompanies = async () => {
    try {
      const res = await companiesApi.getAll();
      setCompanies(res.data);
      if (res.data.length > 0) {
        setSelectedCompany(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    }
  };

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const res = await publicHolidaysApi.getAll({
        company_id: selectedCompany,
        year: selectedYear
      });
      setHolidays(res.data);
    } catch (err) {
      console.error('Failed to fetch holidays:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchYearSummary = async () => {
    try {
      const res = await publicHolidaysApi.getByYear(selectedCompany);
      setYearSummary(res.data);
    } catch (err) {
      console.error('Failed to fetch year summary:', err);
    }
  };

  const handleImportMalaysia = async (year) => {
    if (!selectedCompany) {
      alert('Please select a company first');
      return;
    }

    setImporting(true);
    try {
      const res = await publicHolidaysApi.importMalaysia(selectedCompany, year);
      alert(`Imported ${res.data.inserted} holidays for ${year}. ${res.data.skipped} already existed.`);
      fetchHolidays();
      fetchYearSummary();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import holidays');
    } finally {
      setImporting(false);
    }
  };

  const handleToggleExtraPay = async (id) => {
    try {
      await publicHolidaysApi.toggleExtraPay(id);
      fetchHolidays();
    } catch (err) {
      alert('Failed to toggle extra pay');
    }
  };

  const handleBulkExtraPay = async (extraPay) => {
    const holidayIds = holidays.map(h => h.id);
    if (holidayIds.length === 0) return;

    try {
      await publicHolidaysApi.bulkExtraPay(holidayIds, extraPay);
      fetchHolidays();
    } catch (err) {
      alert('Failed to update holidays');
    }
  };

  const openAddModal = () => {
    setEditingHoliday(null);
    setForm({
      name: '',
      date: '',
      description: '',
      extra_pay: true
    });
    setShowModal(true);
  };

  const openEditModal = (holiday) => {
    setEditingHoliday(holiday);
    setForm({
      name: holiday.name,
      date: holiday.date.split('T')[0],
      description: holiday.description || '',
      extra_pay: holiday.extra_pay
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingHoliday) {
        await publicHolidaysApi.update(editingHoliday.id, form);
      } else {
        await publicHolidaysApi.create({
          ...form,
          company_id: selectedCompany
        });
      }
      setShowModal(false);
      fetchHolidays();
      fetchYearSummary();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save holiday');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this holiday?')) return;

    try {
      await publicHolidaysApi.delete(id);
      fetchHolidays();
      fetchYearSummary();
    } catch (err) {
      alert('Failed to delete holiday');
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-MY', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getAvailableYears = () => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  };

  return (
    <Layout>
      <div className="public-holidays-page">
        <header className="page-header">
          <div>
            <h1>Public Holidays</h1>
            <p>Manage Malaysia public holidays and extra pay settings</p>
          </div>
          <div className="header-actions">
            <button onClick={openAddModal} className="add-btn">
              + Add Holiday
            </button>
          </div>
        </header>

        {/* Filters */}
        <div className="filters-bar">
          {isSuperAdmin && (
            <div className="filter-group">
              <label>Company</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
              >
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-group">
            <label>Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {getAvailableYears().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="filter-actions">
            <button
              onClick={() => handleImportMalaysia(selectedYear)}
              disabled={importing}
              className="import-btn"
            >
              {importing ? 'Importing...' : `Import ${selectedYear} Malaysia Holidays`}
            </button>
          </div>
        </div>

        {/* Year Summary Cards */}
        {yearSummary.length > 0 && (
          <div className="year-summary">
            {yearSummary.map(ys => (
              <div
                key={ys.year}
                className={`summary-card ${parseInt(ys.year) === selectedYear ? 'active' : ''}`}
                onClick={() => setSelectedYear(parseInt(ys.year))}
              >
                <div className="year">{ys.year}</div>
                <div className="count">{ys.count} holidays</div>
                <div className="extra-pay">{ys.extra_pay_count} with extra pay</div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk Actions */}
        {holidays.length > 0 && (
          <div className="bulk-actions">
            <span>Bulk actions:</span>
            <button onClick={() => handleBulkExtraPay(true)} className="bulk-btn enable">
              Enable Extra Pay for All
            </button>
            <button onClick={() => handleBulkExtraPay(false)} className="bulk-btn disable">
              Disable Extra Pay for All
            </button>
          </div>
        )}

        {/* Holidays Table */}
        {loading ? (
          <div className="loading">Loading holidays...</div>
        ) : holidays.length === 0 ? (
          <div className="no-data">
            <p>No public holidays found for {selectedYear}.</p>
            <p>Click "Import {selectedYear} Malaysia Holidays" to add Malaysia federal holidays.</p>
          </div>
        ) : (
          <div className="holidays-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Holiday Name</th>
                  <th>Description</th>
                  <th className="center">Extra Pay</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map(holiday => (
                  <tr key={holiday.id}>
                    <td className="date-cell">
                      {formatDate(holiday.date)}
                    </td>
                    <td className="name-cell">
                      <strong>{holiday.name}</strong>
                    </td>
                    <td className="desc-cell">
                      {holiday.description || '-'}
                    </td>
                    <td className="center">
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={holiday.extra_pay}
                          onChange={() => handleToggleExtraPay(holiday.id)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td className="actions">
                      <button onClick={() => openEditModal(holiday)} className="edit-btn">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(holiday.id)} className="delete-btn">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingHoliday ? 'Edit Holiday' : 'Add Holiday'}</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Holiday Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Hari Raya Aidilfitri"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional description..."
                    rows="2"
                  />
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.extra_pay}
                      onChange={(e) => setForm({ ...form, extra_pay: e.target.checked })}
                    />
                    <span>Extra Pay (2x rate for employees working on this day)</span>
                  </label>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    {editingHoliday ? 'Update' : 'Add Holiday'}
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

export default PublicHolidays;
