import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { analyticsApi } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import './Analytics.css';

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#6366f1', '#14b8a6', '#f97316', '#a855f7', '#e11d48', '#0ea5e9', '#65a30d', '#d946ef'];

const formatRM = (amount) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

const formatRM2 = (amount) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

const truncate = (str, max) => str && str.length > max ? str.substring(0, max) + '...' : str;

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function Analytics() {
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [overview, setOverview] = useState(null);
  const [deptBreakdown, setDeptBreakdown] = useState(null);
  const [salaryRanking, setSalaryRanking] = useState(null);
  const [trend, setTrend] = useState(null);
  const [statutory, setStatutory] = useState(null);
  const [otAnalysis, setOTAnalysis] = useState(null);
  const [headcount, setHeadcount] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  useEffect(() => {
    fetchPeriods();
  }, []);

  const fetchPeriods = async () => {
    try {
      const res = await analyticsApi.getAvailablePeriods();
      setPeriods(res.data.periods || []);
      // Auto-select the latest period
      if (res.data.periods?.length > 0) {
        const latest = res.data.periods[0];
        setSelectedMonth(latest.month);
        setSelectedYear(latest.year);
      }
    } catch {
      setPeriods([]);
    }
  };

  const fetchData = useCallback(async (month, year) => {
    try {
      setLoading(true);
      const params = month && year ? { month, year } : {};

      const [ov, dept, rank, tr, stat, ot, hc, att] = await Promise.all([
        analyticsApi.getPayrollOverview(params).catch(() => ({ data: null })),
        analyticsApi.getDepartmentBreakdown(params).catch(() => ({ data: { departments: [] } })),
        analyticsApi.getSalaryRanking(params).catch(() => ({ data: { top10: [], topByDepartment: [] } })),
        analyticsApi.getMonthlyTrend(12).catch(() => ({ data: { trend: [] } })),
        analyticsApi.getStatutoryBreakdown(params).catch(() => ({ data: { statutory: null } })),
        analyticsApi.getOTAnalysis(params).catch(() => ({ data: { otAnalysis: null } })),
        analyticsApi.getHeadcount().catch(() => ({ data: null })),
        analyticsApi.getAttendanceSummary().catch(() => ({ data: null })),
      ]);
      setOverview(ov.data);
      setDeptBreakdown(dept.data);
      setSalaryRanking(rank.data);
      setTrend(tr.data);
      setStatutory(stat.data?.statutory);
      setOTAnalysis(ot.data?.otAnalysis);
      setHeadcount(hc.data);
      setAttendance(att.data);
    } finally {
      setLoading(false);
    }

    // Load AI insights separately (slower)
    setAiLoading(true);
    try {
      const ai = await analyticsApi.getAiInsights();
      setAiInsights(ai.data);
    } catch {
      setAiInsights({ insights: ['Unable to load AI insights.'] });
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMonth && selectedYear) {
      fetchData(selectedMonth, selectedYear);
    }
  }, [selectedMonth, selectedYear, fetchData]);

  const handlePeriodChange = (e) => {
    const [m, y] = e.target.value.split('-');
    setSelectedMonth(parseInt(m));
    setSelectedYear(parseInt(y));
  };

  const handleExportPDF = async () => {
    setPdfExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 15;

      // Title
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('Payroll Analytics Report', pageWidth / 2, y, { align: 'center' });
      y += 8;
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text(`${MONTH_NAMES[selectedMonth]} ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
      y += 12;

      // Overview Stats
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text('Payroll Overview', 14, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Total Gross', formatRM(overview?.totalGross)],
          ['Total Net Pay', formatRM(overview?.totalNet)],
          ['Total Deductions', formatRM(overview?.totalDeductions)],
          ['Employees', String(overview?.employeeCount || 0)],
          ['Average Salary', formatRM(overview?.avgSalary)],
          ['Total Employer Cost', formatRM(overview?.totalEmployerCost)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: { 1: { halign: 'right' } },
      });
      y = doc.lastAutoTable.finalY + 10;

      // Statutory Breakdown
      if (statutory) {
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.text('Statutory Contributions', 14, y);
        y += 6;

        autoTable(doc, {
          startY: y,
          head: [['Type', 'Employee', 'Employer', 'Total']],
          body: [
            ['EPF / KWSP', formatRM2(statutory.epf.employee), formatRM2(statutory.epf.employer), formatRM2(statutory.epf.total)],
            ['SOCSO / PERKESO', formatRM2(statutory.socso.employee), formatRM2(statutory.socso.employer), formatRM2(statutory.socso.total)],
            ['EIS / SIP', formatRM2(statutory.eis.employee), formatRM2(statutory.eis.employer), formatRM2(statutory.eis.total)],
            ['PCB / MTD', formatRM2(statutory.pcb.employee), '-', formatRM2(statutory.pcb.total)],
            ['Total', formatRM2(statutory.totalEmployee), formatRM2(statutory.totalEmployer), formatRM2(statutory.grandTotal)],
          ],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [30, 41, 59] },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        });
        y = doc.lastAutoTable.finalY + 10;
      }

      // Department/Outlet Table
      if (deptBreakdown?.departments?.length > 0) {
        if (y > 220) { doc.addPage(); y = 15; }
        const groupLabel = deptBreakdown.groupBy === 'outlet' ? 'Outlet' : 'Department';
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.text(`${groupLabel} Breakdown`, 14, y);
        y += 6;

        autoTable(doc, {
          startY: y,
          head: [[groupLabel, 'Employees', 'Gross', 'Net Pay', 'Avg Salary', '% of Total']],
          body: deptBreakdown.departments.map(d => [
            d.departmentName,
            String(d.employeeCount),
            formatRM(d.totalGrossExClaims),
            formatRM(d.totalNet),
            formatRM(d.avgSalary),
            `${d.percentage}%`
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        });
        y = doc.lastAutoTable.finalY + 10;
      }

      // OT Analysis
      if (otAnalysis) {
        if (y > 240) { doc.addPage(); y = 15; }
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.text('Overtime Analysis', 14, y);
        y += 6;

        autoTable(doc, {
          startY: y,
          head: [['Metric', 'Value']],
          body: [
            ['Total OT Cost', formatRM(otAnalysis.totalOTCost)],
            ['Total OT Hours', `${otAnalysis.totalOTHours.toFixed(1)}h`],
            ['Employees with OT', `${otAnalysis.employeesWithOT} / ${otAnalysis.totalEmployees}`],
            ['Avg OT Hours', `${otAnalysis.avgOTHours}h`],
            ['Avg OT Cost', formatRM(otAnalysis.avgOTCost)],
          ],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [30, 41, 59] },
          columnStyles: { 1: { halign: 'right' } },
        });
      }

      doc.save(`analytics_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Failed to export PDF');
    } finally {
      setPdfExporting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="analytics-page">
          <div className="analytics-loading">
            <div className="spinner" />
            <span>Loading analytics...</span>
          </div>
        </div>
      </Layout>
    );
  }

  const headcountPieData = headcount ? [
    { name: 'Active', value: parseInt(headcount.confirmed) || 0 },
    { name: 'Probation', value: parseInt(headcount.probation) || 0 },
    { name: 'Resigned', value: parseInt(headcount.resigned) || 0 },
    { name: 'Inactive', value: parseInt(headcount.inactive) || 0 },
  ].filter(d => d.value > 0) : [];

  const groupLabel = deptBreakdown?.groupBy === 'outlet' ? 'Outlet' : 'Department';
  const isOutletBased = deptBreakdown?.groupBy === 'outlet';

  const deptPieData = deptBreakdown?.departments?.map(d => ({
    name: d.departmentName,
    value: d.totalGrossExClaims
  })) || [];

  const deptBarData = deptBreakdown?.departments?.map(d => ({
    name: d.departmentName,
    avgSalary: d.avgSalary
  })) || [];

  // Division ratio: Sales / Operations / Logistics (only meaningful for AA Alive)
  const divisionData = (() => {
    if (isOutletBased) return []; // Skip for Mimix
    if (!deptBreakdown?.departments?.length) return [];
    let sales = 0, operations = 0, logistics = 0;
    let salesCount = 0, opsCount = 0, logCount = 0;
    deptBreakdown.departments.forEach(d => {
      const name = (d.departmentName || '').toLowerCase();
      if (name.includes('indoor') || name.includes('outdoor')) {
        sales += d.totalGrossExClaims;
        salesCount += d.employeeCount;
      } else if (name.includes('driver')) {
        logistics += d.totalGrossExClaims;
        logCount += d.employeeCount;
      } else {
        operations += d.totalGrossExClaims;
        opsCount += d.employeeCount;
      }
    });
    return [
      { name: 'Sales', value: sales, count: salesCount },
      { name: 'Operations', value: operations, count: opsCount },
      { name: 'Logistics', value: logistics, count: logCount },
    ].filter(d => d.value > 0);
  })();

  const divisionTotal = divisionData.reduce((s, d) => s + d.value, 0);

  const top10Data = salaryRanking?.top10?.map(e => ({
    name: e.name,
    netPay: e.netPayExClaims
  })) || [];

  const deptRankData = salaryRanking?.topByDepartment?.map(d => ({
    name: d.department,
    netPay: d.netPayExClaims
  })).sort((a, b) => b.netPay - a.netPay) || [];

  // For pie chart: use bar chart when too many items
  const usePieForDept = deptPieData.length <= 8;

  return (
    <Layout>
      <div className="analytics-page">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>Analytics</h1>
            <p className="page-subtitle">
              {selectedMonth && selectedYear
                ? `Payroll data for ${MONTH_NAMES[selectedMonth]} ${selectedYear}`
                : 'Business insights and reports'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {periods.length > 0 && (
              <select
                className="period-selector"
                value={selectedMonth && selectedYear ? `${selectedMonth}-${selectedYear}` : ''}
                onChange={handlePeriodChange}
              >
                {periods.map(p => (
                  <option key={`${p.month}-${p.year}`} value={`${p.month}-${p.year}`}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
            <button
              className="export-pdf-btn"
              onClick={handleExportPDF}
              disabled={pdfExporting}
            >
              {pdfExporting ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="analytics-stats-row">
          <div className="analytics-stat-card">
            <div className="stat-label">Total Payroll (Net)</div>
            <div className="stat-value">{formatRM(overview?.totalNet)}</div>
            {overview?.momChange != null && (
              <div className={`stat-change ${overview.momChange >= 0 ? 'positive' : 'negative'}`}>
                {overview.momChange >= 0 ? '+' : ''}{overview.momChange}% vs last month
              </div>
            )}
            {overview?.yoyChange != null && (
              <div className={`stat-change ${overview.yoyChange >= 0 ? 'positive' : 'negative'}`}>
                {overview.yoyChange >= 0 ? '+' : ''}{overview.yoyChange}% vs last year
              </div>
            )}
          </div>
          <div className="analytics-stat-card">
            <div className="stat-label">Active Employees</div>
            <div className="stat-value">{headcount?.active || overview?.employeeCount || 0}</div>
            {headcount?.newHiresThisMonth > 0 && (
              <div className="stat-change positive">+{headcount.newHiresThisMonth} new this month</div>
            )}
            {overview?.yoyHeadcountChange != null && overview.yoyHeadcountChange !== 0 && (
              <div className={`stat-change ${overview.yoyHeadcountChange >= 0 ? 'positive' : 'negative'}`}>
                {overview.yoyHeadcountChange >= 0 ? '+' : ''}{overview.yoyHeadcountChange} vs last year
              </div>
            )}
          </div>
          <div className="analytics-stat-card">
            <div className="stat-label">Average Salary</div>
            <div className="stat-value">{formatRM(overview?.avgSalary)}</div>
          </div>
          <div className="analytics-stat-card highlight-card">
            <div className="stat-label">Total Employer Cost</div>
            <div className="stat-value">{formatRM(overview?.totalEmployerCost)}</div>
            <div className="stat-change neutral">
              Gross: {formatRM(overview?.totalGross)} + Statutory: {formatRM((overview?.employerEPF || 0) + (overview?.employerSOCSO || 0) + (overview?.employerEIS || 0))}
            </div>
          </div>
        </div>

        {/* Statutory Breakdown */}
        {statutory && (
          <div className="analytics-chart-card statutory-card">
            <h3>Statutory Contributions</h3>
            <div className="statutory-grid">
              <div className="statutory-item">
                <div className="statutory-header">
                  <span className="statutory-label">EPF / KWSP</span>
                  <span className="statutory-total">{formatRM(statutory.epf.total)}</span>
                </div>
                <div className="statutory-detail">
                  <span>Employee: {formatRM2(statutory.epf.employee)}</span>
                  <span>Employer: {formatRM2(statutory.epf.employer)}</span>
                </div>
                <div className="statutory-bar">
                  <div className="statutory-bar-fill epf" style={{ width: statutory.grandTotal > 0 ? `${(statutory.epf.total / statutory.grandTotal * 100)}%` : '0%' }} />
                </div>
              </div>
              <div className="statutory-item">
                <div className="statutory-header">
                  <span className="statutory-label">SOCSO / PERKESO</span>
                  <span className="statutory-total">{formatRM(statutory.socso.total)}</span>
                </div>
                <div className="statutory-detail">
                  <span>Employee: {formatRM2(statutory.socso.employee)}</span>
                  <span>Employer: {formatRM2(statutory.socso.employer)}</span>
                </div>
                <div className="statutory-bar">
                  <div className="statutory-bar-fill socso" style={{ width: statutory.grandTotal > 0 ? `${(statutory.socso.total / statutory.grandTotal * 100)}%` : '0%' }} />
                </div>
              </div>
              <div className="statutory-item">
                <div className="statutory-header">
                  <span className="statutory-label">EIS / SIP</span>
                  <span className="statutory-total">{formatRM(statutory.eis.total)}</span>
                </div>
                <div className="statutory-detail">
                  <span>Employee: {formatRM2(statutory.eis.employee)}</span>
                  <span>Employer: {formatRM2(statutory.eis.employer)}</span>
                </div>
                <div className="statutory-bar">
                  <div className="statutory-bar-fill eis" style={{ width: statutory.grandTotal > 0 ? `${(statutory.eis.total / statutory.grandTotal * 100)}%` : '0%' }} />
                </div>
              </div>
              <div className="statutory-item">
                <div className="statutory-header">
                  <span className="statutory-label">PCB / MTD</span>
                  <span className="statutory-total">{formatRM(statutory.pcb.total)}</span>
                </div>
                <div className="statutory-detail">
                  <span>Employee only</span>
                  <span></span>
                </div>
                <div className="statutory-bar">
                  <div className="statutory-bar-fill pcb" style={{ width: statutory.grandTotal > 0 ? `${(statutory.pcb.total / statutory.grandTotal * 100)}%` : '0%' }} />
                </div>
              </div>
            </div>
            <div className="statutory-summary">
              <div><span>Total Employee Deductions</span><strong>{formatRM(statutory.totalEmployee)}</strong></div>
              <div><span>Total Employer Contributions</span><strong>{formatRM(statutory.totalEmployer)}</strong></div>
              <div className="statutory-grand-total"><span>Grand Total</span><strong>{formatRM(statutory.grandTotal)}</strong></div>
            </div>
          </div>
        )}

        {/* Monthly Payroll Trend */}
        {trend?.trend?.length > 0 && (
          <div className="analytics-chart-card">
            <h3>Monthly Payroll Trend</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trend.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatRM(v)} />
                <Legend />
                <Line type="monotone" dataKey="totalEmployerCost" stroke="#ef4444" strokeWidth={2} name="Employer Cost" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="totalGrossExClaims" stroke="#3b82f6" strokeWidth={2} name="Gross (excl. Claims)" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="totalNet" stroke="#10b981" strokeWidth={2} name="Net Pay" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="totalDeductions" stroke="#f59e0b" strokeWidth={1} name="Deductions" dot={{ r: 2 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Department Breakdown: Pie/Bar + Avg Salary Bar */}
        <div className="analytics-two-col">
          <div className="analytics-chart-card">
            <h3>Payroll Share by {groupLabel}</h3>
            {deptPieData.length > 0 ? (
              usePieForDept ? (
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={deptPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius={90}
                      label={({ name, percent }) => percent >= 0.05 ? `${truncate(name, 12)} ${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={({ percent }) => percent >= 0.05}
                      fontSize={11}
                    >
                      {deptPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => formatRM(v)} />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value) => truncate(value, 18)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                // Too many items for pie - use horizontal bar
                <ResponsiveContainer width="100%" height={Math.max(300, deptPieData.length * 26)}>
                  <BarChart data={deptPieData.sort((a, b) => b.value - a.value)} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} tickFormatter={(v) => truncate(v, 18)} />
                    <Tooltip formatter={v => formatRM(v)} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Gross (excl. Claims)" />
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : <p style={{ color: '#94a3b8' }}>No {groupLabel.toLowerCase()} data</p>}
          </div>
          <div className="analytics-chart-card">
            <h3>Average Salary by {groupLabel}</h3>
            {deptBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, deptBarData.length * 28)}>
                <BarChart data={deptBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} tickFormatter={(v) => truncate(v, 18)} />
                  <Tooltip formatter={v => formatRM(v)} />
                  <Bar dataKey="avgSalary" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8' }}>No data</p>}
          </div>
        </div>

        {/* OT Analysis */}
        {otAnalysis && otAnalysis.totalOTCost > 0 && (
          <div className="analytics-two-col">
            <div className="analytics-chart-card">
              <h3>Overtime Analysis</h3>
              <div className="ot-stats-grid">
                <div className="ot-stat">
                  <div className="ot-stat-value">{formatRM(otAnalysis.totalOTCost)}</div>
                  <div className="ot-stat-label">Total OT Cost</div>
                  {otAnalysis.otCostChange != null && (
                    <div className={`stat-change ${otAnalysis.otCostChange >= 0 ? 'negative' : 'positive'}`}>
                      {otAnalysis.otCostChange >= 0 ? '+' : ''}{otAnalysis.otCostChange}% vs last month
                    </div>
                  )}
                </div>
                <div className="ot-stat">
                  <div className="ot-stat-value">{otAnalysis.totalOTHours.toFixed(1)}h</div>
                  <div className="ot-stat-label">Total OT Hours</div>
                </div>
                <div className="ot-stat">
                  <div className="ot-stat-value">{otAnalysis.employeesWithOT} / {otAnalysis.totalEmployees}</div>
                  <div className="ot-stat-label">Employees with OT</div>
                </div>
                <div className="ot-stat">
                  <div className="ot-stat-value">{otAnalysis.avgOTHours}h</div>
                  <div className="ot-stat-label">Avg OT per Employee</div>
                </div>
              </div>
            </div>
            <div className="analytics-chart-card">
              <h3>Top OT Earners</h3>
              {otAnalysis.topOTEarners?.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(250, otAnalysis.topOTEarners.length * 30)}>
                  <BarChart
                    data={otAnalysis.topOTEarners.map(e => ({ name: e.name, otAmount: e.otAmount, otHours: e.otHours }))}
                    layout="vertical"
                    margin={{ left: 10, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} tickFormatter={(v) => truncate(v, 18)} />
                    <Tooltip formatter={(v, name) => name === 'otAmount' ? formatRM(v) : `${v}h`} />
                    <Bar dataKey="otAmount" fill="#f59e0b" radius={[0, 4, 4, 0]} name="OT Amount" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ color: '#94a3b8' }}>No OT data</p>}
            </div>
          </div>
        )}

        {/* Division Salary Ratio - Only for AA Alive (department-based) */}
        {divisionData.length > 0 && (
          <div className="analytics-two-col">
            <div className="analytics-chart-card">
              <h3>Salary Ratio by Division</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={divisionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    <Cell fill="#3b82f6" />
                    <Cell fill="#f59e0b" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <Tooltip formatter={v => formatRM(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="analytics-chart-card">
              <h3>Division Breakdown</h3>
              <div style={{ padding: '8px 0' }}>
                {divisionData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < divisionData.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>{d.name}</div>
                      <div style={{ color: '#64748b', fontSize: 13 }}>{d.count} employees</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 16 }}>{formatRM(d.value)}</div>
                      <div style={{ color: '#64748b', fontSize: 13 }}>{divisionTotal > 0 ? (d.value / divisionTotal * 100).toFixed(1) : 0}% of total</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderTop: '2px solid #e2e8f0', marginTop: 4 }}>
                  <div style={{ fontWeight: 600, color: '#64748b' }}>Total</div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 16 }}>{formatRM(divisionTotal)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Salary Rankings: Dept rank + Top 10 */}
        <div className="analytics-two-col">
          <div className="analytics-chart-card">
            <h3>Highest Paid {groupLabel}</h3>
            {deptRankData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, deptRankData.length * 28)}>
                <BarChart data={deptRankData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} tickFormatter={(v) => truncate(v, 18)} />
                  <Tooltip formatter={v => formatRM(v)} />
                  <Bar dataKey="netPay" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Net Pay (excl. Claims)" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8' }}>No data</p>}
          </div>
          <div className="analytics-chart-card">
            <h3>Top 10 Highest Paid Employees</h3>
            {top10Data.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, top10Data.length * 30)}>
                <BarChart data={top10Data} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} tickFormatter={(v) => truncate(v, 20)} />
                  <Tooltip formatter={v => formatRM(v)} />
                  <Bar dataKey="netPay" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Net Pay (excl. Claims)" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8' }}>No data</p>}
          </div>
        </div>

        {/* Department Detail Table */}
        {deptBreakdown?.departments?.length > 0 && (
          <div className="analytics-chart-card">
            <h3>{groupLabel} Detail</h3>
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>{groupLabel}</th>
                    <th>Employees</th>
                    <th>Total Salary</th>
                    <th>Gross (excl. Claims)</th>
                    <th>Avg Salary</th>
                    <th>% of Payroll</th>
                  </tr>
                </thead>
                <tbody>
                  {deptBreakdown.departments.map((d, i) => (
                    <tr key={d.departmentId || i}>
                      <td>
                        <span className={`rank-badge ${i < 3 ? `top-${i + 1}` : ''}`}>{i + 1}</span>
                      </td>
                      <td><strong>{d.departmentName}</strong></td>
                      <td>{d.employeeCount}</td>
                      <td>{formatRM(d.totalNet)}</td>
                      <td>{formatRM(d.totalGrossExClaims)}</td>
                      <td>{formatRM(d.avgSalary)}</td>
                      <td>{d.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Headcount & Attendance Row */}
        <div className="analytics-two-col">
          <div className="analytics-chart-card">
            <h3>Headcount Breakdown</h3>
            {headcountPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={headcountPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {headcountPieData.map((_, i) => <Cell key={i} fill={['#10b981', '#f59e0b', '#ef4444', '#94a3b8'][i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8' }}>No headcount data</p>}
          </div>
          <div className="analytics-chart-card">
            <h3>Attendance Summary (This Month)</h3>
            {attendance ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '12px 0' }}>
                <div className="analytics-stat-card">
                  <div className="stat-label">Avg Hours/Day</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>{attendance.avgHours || '-'}</div>
                </div>
                <div className="analytics-stat-card">
                  <div className="stat-label">Total OT Hours</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>{attendance.totalOTHours || 0}</div>
                </div>
                <div className="analytics-stat-card">
                  <div className="stat-label">Late Arrivals</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>{attendance.lateCount || 0}</div>
                </div>
                <div className="analytics-stat-card">
                  <div className="stat-label">Attendance Rate</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>{attendance.attendanceRate || 0}%</div>
                </div>
              </div>
            ) : <p style={{ color: '#94a3b8' }}>No attendance data</p>}
          </div>
        </div>

        {/* AI Insights */}
        <div className="analytics-chart-card analytics-ai-card">
          <h3>AI Insights</h3>
          {aiLoading ? (
            <div className="ai-loading">
              <div className="spinner" />
              <span>Analyzing payroll data...</span>
            </div>
          ) : aiInsights?.insights ? (
            <ul className="ai-insights-list">
              {aiInsights.insights.map((insight, i) => (
                <li key={i}>{insight}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#94a3b8', padding: 12 }}>AI insights will appear here once data is loaded.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default Analytics;
