import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { lettersApi, employeeApi } from '../api';
import './Letters.css';

function Letters() {
  const navigate = useNavigate();
  const [letters, setLetters] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState({
    employee_id: '',
    letter_type: '',
    status: ''
  });

  const [form, setForm] = useState({
    employee_id: '',
    letter_type: '',
    subject: '',
    content: '',
    attachment_url: '',
    attachment_name: ''
  });

  const letterTypes = [
    { value: 'warning', label: 'Warning Letter (Surat Amaran)', color: '#d85454' },
    { value: 'appreciation', label: 'Appreciation Letter', color: '#2a9d5c' },
    { value: 'promotion', label: 'Promotion Letter', color: '#5478a8' },
    { value: 'performance_improvement', label: 'Performance Improvement Notice', color: '#e67e22' },
    { value: 'salary_adjustment', label: 'Salary Adjustment Letter', color: '#27ae60' },
    { value: 'general_notice', label: 'General Notice', color: '#7a8a9a' },
    { value: 'termination', label: 'Termination Letter', color: '#c0392b' },
    { value: 'confirmation', label: 'Confirmation Letter', color: '#3498db' }
  ];

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [lettersRes, employeesRes, templatesRes, statsRes] = await Promise.all([
        lettersApi.getAll(filters),
        employeeApi.getAll({ status: 'active' }),
        lettersApi.getTemplates(),
        lettersApi.getStats()
      ]);
      setLetters(lettersRes.data);
      setEmployees(employeesRes.data);
      setTemplates(templatesRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template) => {
    setForm({
      ...form,
      letter_type: template.letter_type,
      subject: template.subject,
      content: template.content
    });
  };

  const handleTypeChange = (type) => {
    setForm({ ...form, letter_type: type });
    // Find matching template and pre-fill
    const template = templates.find(t => t.letter_type === type);
    if (template) {
      setForm(prev => ({
        ...prev,
        letter_type: type,
        subject: template.subject,
        content: template.content
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.letter_type || !form.subject || !form.content) {
      alert('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      await lettersApi.create(form);
      setShowModal(false);
      resetForm();
      fetchData();
      alert('Letter issued successfully! Employee will be notified.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to issue letter');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      employee_id: '',
      letter_type: '',
      subject: '',
      content: '',
      attachment_url: '',
      attachment_name: ''
    });
  };

  const handleView = async (letter) => {
    try {
      const res = await lettersApi.getOne(letter.id);
      setSelectedLetter(res.data);
      setShowViewModal(true);
    } catch (error) {
      console.error('Error fetching letter:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this letter? This action cannot be undone.')) {
      return;
    }
    try {
      await lettersApi.delete(id);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete letter');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeLabel = (type) => {
    const found = letterTypes.find(t => t.value === type);
    return found ? found.label : type;
  };

  const getTypeColor = (type) => {
    const found = letterTypes.find(t => t.value === type);
    return found ? found.color : '#7a8a9a';
  };

  return (
    <div className="letters-page">
      <div className="page-header">
        <div>
          <h1>HR Letters & Notices</h1>
          <p>Issue and manage official letters to employees</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Issue New Letter
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.total_letters || 0}</span>
            <span className="stat-label">Total Letters</span>
          </div>
          <div className="stat-card warning">
            <span className="stat-value">{stats.warning_count || 0}</span>
            <span className="stat-label">Warning Letters</span>
          </div>
          <div className="stat-card success">
            <span className="stat-value">{stats.appreciation_count || 0}</span>
            <span className="stat-label">Appreciation</span>
          </div>
          <div className="stat-card info">
            <span className="stat-value">{stats.unread_count || 0}</span>
            <span className="stat-label">Unread</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        <select
          value={filters.employee_id}
          onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}
        >
          <option value="">All Employees</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>
              {emp.employee_id} - {emp.name}
            </option>
          ))}
        </select>
        <select
          value={filters.letter_type}
          onChange={(e) => setFilters({ ...filters, letter_type: e.target.value })}
        >
          <option value="">All Types</option>
          {letterTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All Status</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      {/* Letters List */}
      {loading ? (
        <div className="loading">Loading letters...</div>
      ) : letters.length === 0 ? (
        <div className="no-data">
          <p>No letters found</p>
        </div>
      ) : (
        <div className="letters-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Issued By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {letters.map(letter => (
                <tr key={letter.id}>
                  <td>{formatDate(letter.created_at)}</td>
                  <td>
                    <div className="employee-info">
                      <span className="emp-name">{letter.employee_name}</span>
                      <span className="emp-id">{letter.employee_code}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      className="type-badge"
                      style={{ backgroundColor: getTypeColor(letter.letter_type) }}
                    >
                      {getTypeLabel(letter.letter_type)}
                    </span>
                  </td>
                  <td className="subject-cell">{letter.subject}</td>
                  <td>
                    <span className={`status-badge ${letter.status}`}>
                      {letter.status}
                    </span>
                  </td>
                  <td>{letter.issued_by_name}</td>
                  <td className="actions-cell">
                    <button className="btn-view" onClick={() => handleView(letter)}>
                      View
                    </button>
                    <button className="btn-delete" onClick={() => handleDelete(letter.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Issue Letter Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal letter-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Issue New Letter</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Select Employee *</label>
                    <select
                      value={form.employee_id}
                      onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                      required
                    >
                      <option value="">Choose employee...</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.employee_id} - {emp.name} ({emp.department_name || 'No Dept'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Letter Type *</label>
                    <select
                      value={form.letter_type}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      required
                    >
                      <option value="">Select type...</option>
                      {letterTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {templates.length > 0 && (
                  <div className="templates-section">
                    <label>Quick Templates:</label>
                    <div className="template-buttons">
                      {templates.map(template => (
                        <button
                          key={template.id}
                          type="button"
                          className={`template-btn ${form.letter_type === template.letter_type ? 'active' : ''}`}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Subject *</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Enter letter subject"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Letter Content *</label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="Enter letter content... Use {{employee_name}} for placeholders"
                    rows="12"
                    required
                  />
                  <span className="field-hint">
                    Available placeholders: {'{{employee_name}}'}, {'{{company_name}}'}, {'{{effective_date}}'}, {'{{details}}'}
                  </span>
                </div>

                <div className="form-group">
                  <label>Attachment URL (Optional)</label>
                  <input
                    type="url"
                    value={form.attachment_url}
                    onChange={(e) => setForm({ ...form, attachment_url: e.target.value })}
                    placeholder="https://example.com/document.pdf"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => { setShowModal(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Issuing...' : 'Issue Letter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Letter Modal */}
      {showViewModal && selectedLetter && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Letter Details</h2>
              <button className="close-btn" onClick={() => setShowViewModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="letter-meta">
                <div className="meta-row">
                  <span className="meta-label">To:</span>
                  <span className="meta-value">{selectedLetter.employee_name} ({selectedLetter.employee_code})</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Type:</span>
                  <span
                    className="type-badge"
                    style={{ backgroundColor: getTypeColor(selectedLetter.letter_type) }}
                  >
                    {getTypeLabel(selectedLetter.letter_type)}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Issued:</span>
                  <span className="meta-value">{formatDate(selectedLetter.created_at)}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Issued By:</span>
                  <span className="meta-value">{selectedLetter.issued_by_name}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Status:</span>
                  <span className={`status-badge ${selectedLetter.status}`}>
                    {selectedLetter.status}
                    {selectedLetter.read_at && ` (${formatDate(selectedLetter.read_at)})`}
                  </span>
                </div>
              </div>

              <div className="letter-subject">
                <strong>Subject:</strong> {selectedLetter.subject}
              </div>

              <div className="letter-content">
                <pre>{selectedLetter.content}</pre>
              </div>

              {selectedLetter.attachment_url && (
                <div className="letter-attachment">
                  <strong>Attachment:</strong>
                  <a href={selectedLetter.attachment_url} target="_blank" rel="noopener noreferrer">
                    {selectedLetter.attachment_name || 'Download Attachment'}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Letters;
