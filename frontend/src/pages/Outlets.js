import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { outletsApi } from '../api';
import Layout from '../components/Layout';
import './Departments.css'; // Reuse departments styling

function Outlets() {
  const navigate = useNavigate();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  const viewEmployees = (outletId) => {
    navigate(`/admin/employees?outlet_id=${outletId}`);
  };

  useEffect(() => {
    fetchOutlets();
  }, []);

  const fetchOutlets = async () => {
    try {
      setLoading(true);
      const res = await outletsApi.getAll();
      setOutlets(res.data);
    } catch (error) {
      console.error('Error fetching outlets:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="departments-page">
        <header className="page-header">
          <div>
            <h1>Outlets</h1>
            <p>View outlet locations and employees</p>
          </div>
        </header>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : outlets.length === 0 ? (
          <div className="no-departments">
            <p>No outlets found.</p>
          </div>
        ) : (
          <div className="departments-grid">
            {outlets.map(outlet => (
              <div key={outlet.id} className="dept-card">
                <div className="dept-header">
                  <h3>{outlet.name}</h3>
                  <span
                    className="employee-count clickable"
                    onClick={() => viewEmployees(outlet.id)}
                    title="View employees in this outlet"
                  >
                    {outlet.employee_count || 0} employees
                  </span>
                </div>

                {outlet.address && (
                  <div className="dept-type">
                    <span className="type-label">Address:</span>
                    <span className="type-value">{outlet.address}</span>
                  </div>
                )}

                <div className="dept-actions">
                  <button
                    onClick={() => viewEmployees(outlet.id)}
                    className="view-employees-btn"
                  >
                    View Employees
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Outlets;
