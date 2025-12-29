import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi } from '../../api';
import Layout from '../../components/Layout';

// Import sub-components
import EmployeeTable from './EmployeeTable';
import EmployeeStats from './EmployeeStats';
import EmployeeFilters from './EmployeeFilters';
import EmployeeDetailModal from './EmployeeDetailModal';

import '../Employees.css';

function Employees() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Main data state
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [filter, setFilter] = useState({
    department_id: searchParams.get('department_id') || '',
    status: 'active',
    search: '',
    employment_type: ''
  });

  // Selection state (for viewing purposes)
  const [selectedEmployees, setSelectedEmployees] = useState([]);

  // View employee detail modal
  const [viewEmployee, setViewEmployee] = useState(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [empRes, deptRes, statsRes] = await Promise.all([
        employeeApi.getAll(filter),
        departmentApi.getAll(),
        employeeApi.getStats()
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  const goToDepartments = () => navigate('/admin/departments');

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedEmployees(employees.map(emp => emp.id));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleSelectEmployee = (empId) => {
    setSelectedEmployees(prev =>
      prev.includes(empId)
        ? prev.filter(id => id !== empId)
        : [...prev, empId]
    );
  };

  return (
    <Layout>
      <div className="employees-page">
        <header className="page-header">
          <div>
            <h1>Employees</h1>
            <p>View your team members</p>
          </div>
        </header>

        <EmployeeStats stats={stats} />

        <EmployeeFilters
          filter={filter}
          setFilter={setFilter}
          departments={departments}
        />

        <EmployeeTable
          employees={employees}
          selectedEmployees={selectedEmployees}
          onSelectAll={handleSelectAll}
          onSelectEmployee={handleSelectEmployee}
          onViewEmployee={setViewEmployee}
          goToDepartments={goToDepartments}
          loading={loading}
        />

        {/* Employee Detail Modal */}
        {viewEmployee && (
          <EmployeeDetailModal
            employee={viewEmployee}
            onClose={() => setViewEmployee(null)}
          />
        )}
      </div>
    </Layout>
  );
}

export default Employees;
