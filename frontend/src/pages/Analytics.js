import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { analyticsApi } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import './Analytics.css';

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

const formatRM = (amount) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

function Analytics() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [deptBreakdown, setDeptBreakdown] = useState(null);
  const [salaryRanking, setSalaryRanking] = useState(null);
  const [trend, setTrend] = useState(null);
  const [headcount, setHeadcount] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ov, dept, rank, tr, hc, att] = await Promise.all([
        analyticsApi.getPayrollOverview().catch(() => ({ data: null })),
        analyticsApi.getDepartmentBreakdown().catch(() => ({ data: { departments: [] } })),
        analyticsApi.getSalaryRanking().catch(() => ({ data: { top10: [], topByDepartment: [] } })),
        analyticsApi.getMonthlyTrend().catch(() => ({ data: { trend: [] } })),
        analyticsApi.getHeadcount().catch(() => ({ data: null })),
        analyticsApi.getAttendanceSummary().catch(() => ({ data: null })),
      ]);
      setOverview(ov.data);
      setDeptBreakdown(dept.data);
      setSalaryRanking(rank.data);
      setTrend(tr.data);
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

  const deptPieData = deptBreakdown?.departments?.map(d => ({
    name: d.departmentName,
    value: d.totalGrossExClaims
  })) || [];

  const deptBarData = deptBreakdown?.departments?.map(d => ({
    name: d.departmentName,
    avgSalary: d.avgSalary
  })) || [];

  const top10Data = salaryRanking?.top10?.map(e => ({
    name: e.name.length > 18 ? e.name.substring(0, 18) + '...' : e.name,
    netPay: e.netPayExClaims
  })) || [];

  const deptRankData = salaryRanking?.topByDepartment?.map(d => ({
    name: d.department,
    netPay: d.netPayExClaims
  })).sort((a, b) => b.netPay - a.netPay) || [];

  return (
    <Layout>
      <div className="analytics-page">
        <div className="page-header">
          <h1>Analytics</h1>
          <p className="page-subtitle">
            {overview?.month && overview?.year
              ? `Payroll data for ${['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][overview.month]} ${overview.year}`
              : 'Business insights and reports'}
          </p>
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
          </div>
          <div className="analytics-stat-card">
            <div className="stat-label">Active Employees</div>
            <div className="stat-value">{headcount?.active || overview?.employeeCount || 0}</div>
            {headcount?.newHiresThisMonth > 0 && (
              <div className="stat-change positive">+{headcount.newHiresThisMonth} new this month</div>
            )}
          </div>
          <div className="analytics-stat-card">
            <div className="stat-label">Average Salary</div>
            <div className="stat-value">{formatRM(overview?.avgSalary)}</div>
          </div>
          <div className="analytics-stat-card">
            <div className="stat-label">Total Gross (excl. Claims)</div>
            <div className="stat-value">{formatRM(overview?.totalGrossExClaims)}</div>
            <div className="stat-change neutral">Incl. Claims: {formatRM(overview?.totalGross)}</div>
          </div>
        </div>

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
                <Line type="monotone" dataKey="totalGrossExClaims" stroke="#3b82f6" strokeWidth={2} name="Gross (excl. Claims)" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="totalGross" stroke="#94a3b8" strokeWidth={1} name="Gross (incl. Claims)" dot={{ r: 2 }} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="totalNet" stroke="#10b981" strokeWidth={2} name="Net Pay" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="totalDeductions" stroke="#f59e0b" strokeWidth={2} name="Deductions" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Department Breakdown: Pie + Bar */}
        <div className="analytics-two-col">
          <div className="analytics-chart-card">
            <h3>Payroll Share by Department</h3>
            {deptPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={deptPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {deptPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => formatRM(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8' }}>No department data</p>}
          </div>
          <div className="analytics-chart-card">
            <h3>Average Salary by Department</h3>
            {deptBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptBarData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                  <Tooltip formatter={v => formatRM(v)} />
                  <Bar dataKey="avgSalary" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8' }}>No data</p>}
          </div>
        </div>

        {/* Salary Rankings: Dept rank + Top 10 */}
        <div className="analytics-two-col">
          <div className="analytics-chart-card">
            <h3>Highest Paid Department</h3>
            {deptRankData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptRankData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                  <Tooltip formatter={v => formatRM(v)} />
                  <Bar dataKey="netPay" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Net Pay (excl. Claims)" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#94a3b8' }}>No data</p>}
          </div>
          <div className="analytics-chart-card">
            <h3>Top 10 Highest Paid Employees</h3>
            {top10Data.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10Data} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={95} />
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
            <h3>Department Detail</h3>
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Department</th>
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
