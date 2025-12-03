import React, { useState, useEffect } from 'react';
import { payrollV2Api, contributionsApi } from '../api';
import Layout from '../components/Layout';
import './Contributions.css';

function Contributions() {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [details, setDetails] = useState([]);
  const [yearReport, setYearReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('summary'); // 'summary' or 'yearly'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchRuns();
  }, []);

  useEffect(() => {
    if (view === 'yearly') {
      fetchYearlyReport();
    }
  }, [selectedYear, view]);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await payrollV2Api.getRuns();
      // Only show finalized runs
      const finalizedRuns = res.data.filter(r => r.status === 'finalized');
      setRuns(finalizedRuns);
      if (finalizedRuns.length > 0 && !selectedRunId) {
        setSelectedRunId(finalizedRuns[0].id);
        fetchSummary(finalizedRuns[0].id);
      }
    } catch (error) {
      console.error('Error fetching runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (runId) => {
    try {
      const [summaryRes, detailsRes] = await Promise.all([
        contributionsApi.getSummary(runId),
        contributionsApi.getDetails(runId)
      ]);
      setSummary(summaryRes.data);
      setDetails(detailsRes.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const fetchYearlyReport = async () => {
    try {
      const res = await contributionsApi.getReport({ year: selectedYear });
      setYearReport(res.data);
    } catch (error) {
      console.error('Error fetching yearly report:', error);
    }
  };

  const handleRunSelect = (runId) => {
    setSelectedRunId(runId);
    fetchSummary(runId);
  };

  const handleExport = async (type) => {
    if (!selectedRunId) return;

    try {
      let res;
      let filename;

      switch (type) {
        case 'epf':
          res = await contributionsApi.exportEPF(selectedRunId);
          filename = `EPF_${summary.run.month}_${summary.run.year}.csv`;
          break;
        case 'socso':
          res = await contributionsApi.exportSOCSO(selectedRunId);
          filename = `SOCSO_${summary.run.month}_${summary.run.year}.csv`;
          break;
        case 'eis':
          res = await contributionsApi.exportEIS(selectedRunId);
          filename = `EIS_${summary.run.month}_${summary.run.year}.csv`;
          break;
        case 'pcb':
          res = await contributionsApi.exportPCB(selectedRunId);
          filename = `PCB_${summary.run.month}_${summary.run.year}.csv`;
          break;
        default:
          return;
      }

      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('Failed to export file');
    }
  };

  const formatAmount = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getMonthName = (month) => {
    return new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' });
  };

  return (
    <Layout>
      <div className="contributions-page">
        <header className="page-header">
          <div>
            <h1>Contributions</h1>
            <p>Government statutory payments - EPF, SOCSO, EIS, PCB</p>
          </div>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${view === 'summary' ? 'active' : ''}`}
              onClick={() => setView('summary')}
            >
              Monthly View
            </button>
            <button
              className={`toggle-btn ${view === 'yearly' ? 'active' : ''}`}
              onClick={() => setView('yearly')}
            >
              Yearly Report
            </button>
          </div>
        </header>

        {view === 'summary' ? (
          <div className="contributions-layout">
            {/* Runs List */}
            <div className="runs-panel">
              <h3>Finalized Payroll Runs</h3>
              {loading ? (
                <div className="loading">Loading...</div>
              ) : runs.length === 0 ? (
                <div className="no-data">No finalized payroll runs</div>
              ) : (
                <div className="runs-list">
                  {runs.map(run => (
                    <div
                      key={run.id}
                      className={`run-card ${selectedRunId === run.id ? 'selected' : ''}`}
                      onClick={() => handleRunSelect(run.id)}
                    >
                      <div className="run-period">
                        {getMonthName(run.month)} {run.year}
                        {run.department_name && (
                          <span className="run-dept"> - {run.department_name}</span>
                        )}
                      </div>
                      <div className="run-meta">
                        <span className="run-count">{run.item_count} employees</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary Panel */}
            <div className="summary-panel">
              {summary ? (
                <>
                  <div className="summary-header">
                    <h2>
                      {getMonthName(summary.run.month)} {summary.run.year}
                      {summary.run.department_name && ` - ${summary.run.department_name}`}
                    </h2>
                    <span className="employee-count">{summary.employee_count} employees</span>
                  </div>

                  {/* Contribution Cards */}
                  <div className="contribution-cards">
                    {/* EPF */}
                    <div className="contribution-card epf">
                      <div className="card-header">
                        <h3>EPF (KWSP)</h3>
                        <button onClick={() => handleExport('epf')} className="export-btn">
                          Export
                        </button>
                      </div>
                      <div className="card-body">
                        <div className="contrib-row">
                          <span>Employee</span>
                          <span>{formatAmount(summary.contributions.epf.employee)}</span>
                        </div>
                        <div className="contrib-row">
                          <span>Employer</span>
                          <span>{formatAmount(summary.contributions.epf.employer)}</span>
                        </div>
                        <div className="contrib-row total">
                          <span>Total to Pay</span>
                          <span>{formatAmount(summary.contributions.epf.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* SOCSO */}
                    <div className="contribution-card socso">
                      <div className="card-header">
                        <h3>SOCSO (PERKESO)</h3>
                        <button onClick={() => handleExport('socso')} className="export-btn">
                          Export
                        </button>
                      </div>
                      <div className="card-body">
                        <div className="contrib-row">
                          <span>Employee</span>
                          <span>{formatAmount(summary.contributions.socso.employee)}</span>
                        </div>
                        <div className="contrib-row">
                          <span>Employer</span>
                          <span>{formatAmount(summary.contributions.socso.employer)}</span>
                        </div>
                        <div className="contrib-row total">
                          <span>Total to Pay</span>
                          <span>{formatAmount(summary.contributions.socso.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* EIS */}
                    <div className="contribution-card eis">
                      <div className="card-header">
                        <h3>EIS (SIP)</h3>
                        <button onClick={() => handleExport('eis')} className="export-btn">
                          Export
                        </button>
                      </div>
                      <div className="card-body">
                        <div className="contrib-row">
                          <span>Employee</span>
                          <span>{formatAmount(summary.contributions.eis.employee)}</span>
                        </div>
                        <div className="contrib-row">
                          <span>Employer</span>
                          <span>{formatAmount(summary.contributions.eis.employer)}</span>
                        </div>
                        <div className="contrib-row total">
                          <span>Total to Pay</span>
                          <span>{formatAmount(summary.contributions.eis.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* PCB */}
                    <div className="contribution-card pcb">
                      <div className="card-header">
                        <h3>PCB (LHDN)</h3>
                        <button onClick={() => handleExport('pcb')} className="export-btn">
                          Export
                        </button>
                      </div>
                      <div className="card-body">
                        <div className="contrib-row total">
                          <span>Total Tax</span>
                          <span>{formatAmount(summary.contributions.pcb.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grand Total */}
                  <div className="grand-total">
                    <span>Total Contributions to Pay Government</span>
                    <span className="amount">{formatAmount(summary.contributions.grand_total)}</span>
                  </div>

                  {/* Details Table */}
                  <div className="details-section">
                    <h3>Employee Breakdown</h3>
                    <div className="details-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th>IC Number</th>
                            <th>Gross</th>
                            <th>EPF (EE)</th>
                            <th>EPF (ER)</th>
                            <th>SOCSO (EE)</th>
                            <th>SOCSO (ER)</th>
                            <th>EIS (EE)</th>
                            <th>EIS (ER)</th>
                            <th>PCB</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.map(item => (
                            <tr key={item.id}>
                              <td>
                                <strong>{item.employee_name}</strong>
                                <br />
                                <small>{item.emp_code}</small>
                              </td>
                              <td>{item.ic_number || '-'}</td>
                              <td>{formatAmount(item.gross_salary)}</td>
                              <td>{formatAmount(item.epf_employee)}</td>
                              <td>{formatAmount(item.epf_employer)}</td>
                              <td>{formatAmount(item.socso_employee)}</td>
                              <td>{formatAmount(item.socso_employer)}</td>
                              <td>{formatAmount(item.eis_employee)}</td>
                              <td>{formatAmount(item.eis_employer)}</td>
                              <td>{formatAmount(item.pcb)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="no-selection">
                  <p>Select a payroll run to view contributions</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Yearly Report View */
          <div className="yearly-report">
            <div className="year-selector">
              <label>Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {[2023, 2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {yearReport && (
              <>
                <div className="yearly-summary-cards">
                  <div className="yearly-card epf">
                    <h4>EPF Total</h4>
                    <span className="amount">{formatAmount(yearReport.totals.epf_total)}</span>
                    <small>EE: {formatAmount(yearReport.totals.epf_employee)} | ER: {formatAmount(yearReport.totals.epf_employer)}</small>
                  </div>
                  <div className="yearly-card socso">
                    <h4>SOCSO Total</h4>
                    <span className="amount">{formatAmount(yearReport.totals.socso_total)}</span>
                    <small>EE: {formatAmount(yearReport.totals.socso_employee)} | ER: {formatAmount(yearReport.totals.socso_employer)}</small>
                  </div>
                  <div className="yearly-card eis">
                    <h4>EIS Total</h4>
                    <span className="amount">{formatAmount(yearReport.totals.eis_total)}</span>
                    <small>EE: {formatAmount(yearReport.totals.eis_employee)} | ER: {formatAmount(yearReport.totals.eis_employer)}</small>
                  </div>
                  <div className="yearly-card pcb">
                    <h4>PCB Total</h4>
                    <span className="amount">{formatAmount(yearReport.totals.pcb_total)}</span>
                  </div>
                </div>

                <div className="yearly-grand-total">
                  <span>Total {yearReport.year} Contributions</span>
                  <span className="amount">{formatAmount(yearReport.totals.grand_total)}</span>
                </div>

                <div className="monthly-breakdown">
                  <h3>Monthly Breakdown</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Department</th>
                        <th>Employees</th>
                        <th>EPF</th>
                        <th>SOCSO</th>
                        <th>EIS</th>
                        <th>PCB</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearReport.monthly.map((row, idx) => (
                        <tr key={idx}>
                          <td>{getMonthName(row.month)}</td>
                          <td>{row.department_name || 'All'}</td>
                          <td>{row.employee_count}</td>
                          <td>{formatAmount(row.epf_total)}</td>
                          <td>{formatAmount(row.socso_total)}</td>
                          <td>{formatAmount(row.eis_total)}</td>
                          <td>{formatAmount(row.pcb_total)}</td>
                          <td><strong>{formatAmount(row.epf_total + row.socso_total + row.eis_total + row.pcb_total)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Contributions;
