import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { lettersApi, employeeApi } from '../api';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Layout from '../components/Layout';
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

  // State for placeholder input prompts
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false);
  const [placeholderInputs, setPlaceholderInputs] = useState({});
  const [pendingTemplate, setPendingTemplate] = useState(null);

  // Auto-fill placeholders (replaced automatically based on selected employee/company)
  const autoFillPlaceholders = ['employee_name', 'company_name', 'effective_date', 'position'];

  // User-input placeholders (require manual input)
  const userInputPlaceholders = {
    reason: { label: 'Reason for Warning', placeholder: 'e.g., Repeated tardiness' },
    details: { label: 'Details', placeholder: 'Enter specific details...' },
    new_position: { label: 'New Position', placeholder: 'e.g., Senior Manager' },
    old_salary: { label: 'Previous Salary (RM)', placeholder: 'e.g., 3000' },
    new_salary: { label: 'New Salary (RM)', placeholder: 'e.g., 3500' },
    improvement_1: { label: 'Improvement Area 1', placeholder: 'e.g., Attendance' },
    improvement_2: { label: 'Improvement Area 2', placeholder: 'e.g., Communication' },
    improvement_3: { label: 'Improvement Area 3', placeholder: 'e.g., Productivity' },
    review_period: { label: 'Review Period', placeholder: 'e.g., 30 days' },
    final_pay_date: { label: 'Final Pay Date', placeholder: 'e.g., 2024-02-28' }
  };

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

  // Extract all placeholders from content
  const extractPlaceholders = (content) => {
    const matches = content.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  };

  // Get user-input placeholders that need to be filled
  const getUserInputPlaceholders = (content) => {
    const allPlaceholders = extractPlaceholders(content);
    return allPlaceholders.filter(p => !autoFillPlaceholders.includes(p) && userInputPlaceholders[p]);
  };

  // Replace auto-fill placeholders with actual values
  const replaceAutoFillPlaceholders = (content, subject) => {
    const selectedEmployee = employees.find(e => e.id === parseInt(form.employee_id));
    const today = new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' });

    let newContent = content;
    let newSubject = subject;

    const replacements = {
      employee_name: selectedEmployee?.name || '{{employee_name}}',
      company_name: 'AA Group',
      effective_date: today,
      position: selectedEmployee?.position || selectedEmployee?.designation || '{{position}}'
    };

    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      newContent = newContent.replace(regex, value);
      newSubject = newSubject.replace(regex, value);
    });

    return { content: newContent, subject: newSubject };
  };

  // Replace user-input placeholders
  const replaceUserInputPlaceholders = (content, subject, inputs) => {
    let newContent = content;
    let newSubject = subject;

    Object.entries(inputs).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      newContent = newContent.replace(regex, value || `[${key}]`);
      newSubject = newSubject.replace(regex, value || `[${key}]`);
    });

    return { content: newContent, subject: newSubject };
  };

  const handleTemplateSelect = (template) => {
    if (!form.employee_id) {
      alert('Please select an employee first');
      return;
    }

    // Check for user-input placeholders
    const userPlaceholders = getUserInputPlaceholders(template.content);

    if (userPlaceholders.length > 0) {
      // Show placeholder input modal
      const initialInputs = {};
      userPlaceholders.forEach(p => { initialInputs[p] = ''; });
      setPlaceholderInputs(initialInputs);
      setPendingTemplate(template);
      setShowPlaceholderModal(true);
    } else {
      // No user input needed, just replace auto-fill placeholders
      const { content, subject } = replaceAutoFillPlaceholders(template.content, template.subject);
      setForm({
        ...form,
        letter_type: template.letter_type,
        subject,
        content
      });
    }
  };

  const handlePlaceholderSubmit = () => {
    if (!pendingTemplate) return;

    // First replace auto-fill, then user inputs
    let { content, subject } = replaceAutoFillPlaceholders(pendingTemplate.content, pendingTemplate.subject);
    ({ content, subject } = replaceUserInputPlaceholders(content, subject, placeholderInputs));

    setForm({
      ...form,
      letter_type: pendingTemplate.letter_type,
      subject,
      content
    });

    setShowPlaceholderModal(false);
    setPendingTemplate(null);
    setPlaceholderInputs({});
  };

  const handleTypeChange = (type) => {
    setForm({ ...form, letter_type: type });
    // Find matching template and pre-fill
    const template = templates.find(t => t.letter_type === type);
    if (template && form.employee_id) {
      handleTemplateSelect(template);
    } else if (template) {
      // No employee selected yet, just set the type
      setForm(prev => ({
        ...prev,
        letter_type: type
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

  const handleDownload = async () => {
    const element = document.getElementById('letter-print');
    if (!element) return;

    try {
      // Capture with higher scale for better quality
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794, // A4 width at 96 DPI
        windowHeight: 1123 // A4 height at 96 DPI
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      // A4 dimensions
      const pageWidth = 210;
      const pageHeight = 297;

      // Calculate image dimensions to fit A4 with margins
      const margin = 10; // 10mm margins
      const contentWidth = pageWidth - (margin * 2);
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // If content fits on one page
      if (imgHeight <= pageHeight - (margin * 2)) {
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      } else {
        // Multi-page handling
        let heightLeft = imgHeight;
        let position = margin;
        let pageNum = 0;

        while (heightLeft > 0) {
          if (pageNum > 0) {
            pdf.addPage();
          }

          const pageContentHeight = Math.min(pageHeight - (margin * 2), heightLeft);
          const srcY = pageNum * (pageHeight - (margin * 2)) * (canvas.height / imgHeight);

          pdf.addImage(
            imgData, 'PNG',
            margin, position,
            imgWidth, imgHeight,
            undefined, 'FAST',
            0
          );

          heightLeft -= (pageHeight - (margin * 2));
          pageNum++;
        }
      }

      const fileName = `Letter_${selectedLetter.employee_name}_${new Date(selectedLetter.created_at).toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to download letter. Please try printing instead.');
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
    <Layout>
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
                    placeholder="Select a template above or enter letter content..."
                    rows="12"
                    required
                  />
                  <span className="field-hint">
                    Tip: Select employee first, then choose a template. Placeholders will be auto-filled.
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

      {/* Placeholder Input Modal */}
      {showPlaceholderModal && pendingTemplate && (
        <div className="modal-overlay" onClick={() => setShowPlaceholderModal(false)}>
          <div className="modal placeholder-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Fill in Letter Details</h2>
              <button className="close-btn" onClick={() => setShowPlaceholderModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: '#666' }}>
                Please provide the following information for the <strong>{pendingTemplate.name}</strong>:
              </p>
              {Object.keys(placeholderInputs).map(key => (
                <div className="form-group" key={key}>
                  <label>{userInputPlaceholders[key]?.label || key} *</label>
                  {key === 'details' ? (
                    <textarea
                      value={placeholderInputs[key]}
                      onChange={(e) => setPlaceholderInputs({ ...placeholderInputs, [key]: e.target.value })}
                      placeholder={userInputPlaceholders[key]?.placeholder || `Enter ${key}...`}
                      rows="4"
                      required
                    />
                  ) : (
                    <input
                      type={key.includes('salary') ? 'number' : 'text'}
                      value={placeholderInputs[key]}
                      onChange={(e) => setPlaceholderInputs({ ...placeholderInputs, [key]: e.target.value })}
                      placeholder={userInputPlaceholders[key]?.placeholder || `Enter ${key}...`}
                      required
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={() => {
                setShowPlaceholderModal(false);
                setPendingTemplate(null);
                setPlaceholderInputs({});
              }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-submit"
                onClick={handlePlaceholderSubmit}
                disabled={Object.values(placeholderInputs).some(v => !v.trim())}
              >
                Apply to Letter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Letter Modal */}
      {showViewModal && selectedLetter && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Letter Details</h2>
              <div className="modal-header-actions">
                <button className="btn-download" onClick={handleDownload}>Download PDF</button>
                <button className="btn-print" onClick={() => window.print()}>Print</button>
                <button className="close-btn" onClick={() => setShowViewModal(false)}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {/* Letter Preview with Letterhead */}
              <div className="letter-preview" id="letter-print">
                {/* Letterhead */}
                <div className="letterhead">
                  <div className="letterhead-logo">
                    <img src="/logo.png" alt="AA Alive" />
                  </div>
                  <div className="letterhead-info">
                    <h1>AA Alive Sdn. Bhd.</h1>
                    <p className="company-reg">Company No.: 1204108-D</p>
                    <p className="company-address">
                      1, Jalan Perusahaan Amari, Kawasan Industri Batu Caves,<br />
                      68100 Batu Caves, Selangor
                    </p>
                  </div>
                </div>

                <div className="letter-divider"></div>

                {/* Letter Date */}
                <div className="letter-date">
                  Date: {new Date(selectedLetter.created_at).toLocaleDateString('en-MY', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>

                {/* Letter Recipient */}
                <div className="letter-recipient">
                  <p><strong>To:</strong></p>
                  <p>{selectedLetter.employee_name}</p>
                  <p>Employee ID: {selectedLetter.employee_code}</p>
                  {selectedLetter.department_name && <p>Department: {selectedLetter.department_name}</p>}
                </div>

                {/* Letter Subject */}
                <div className="letter-subject-line">
                  <strong>Subject: {selectedLetter.subject}</strong>
                </div>

                {/* Letter Body */}
                <div className="letter-body">
                  <pre>{selectedLetter.content}</pre>
                </div>

                {/* Signature Section */}
                <div className="letter-signature">
                  <div className="signature-block">
                    <div className="signature-line"></div>
                    <p className="signature-name">{selectedLetter.issued_by_name}</p>
                    {selectedLetter.issued_by_designation && (
                      <p className="signature-designation">{selectedLetter.issued_by_designation}</p>
                    )}
                    <p className="signature-date">
                      Date: {new Date(selectedLetter.created_at).toLocaleDateString('en-MY')}
                    </p>
                  </div>
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

              {/* Letter Meta Info (not printed) */}
              <div className="letter-meta-info">
                <span className={`status-badge ${selectedLetter.status}`}>
                  {selectedLetter.status === 'read' ? 'Read' : 'Unread'}
                  {selectedLetter.read_at && ` on ${formatDate(selectedLetter.read_at)}`}
                </span>
                <span
                  className="type-badge"
                  style={{ backgroundColor: getTypeColor(selectedLetter.letter_type) }}
                >
                  {getTypeLabel(selectedLetter.letter_type)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </Layout>
  );
}

export default Letters;
