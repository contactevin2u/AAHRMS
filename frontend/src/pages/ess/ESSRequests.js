import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ESSLayout from '../../components/ESSLayout';
import { isSupervisorOrManager, isMimixCompany } from '../../utils/permissions';
import './ESSRequests.css';

function ESSRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');

  // Check if user can see OT approvals
  const isMimix = isMimixCompany(employeeInfo);
  const isSupOrMgr = isSupervisorOrManager(employeeInfo);
  const showOTTab = isSupOrMgr && isMimix;

  // Get active tab from URL or default to 'leave'
  const activeTab = searchParams.get('tab') || 'leave';

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  return (
    <ESSLayout>
      <div className="ess-requests-page">
        {/* Tab Header */}
        <div className="ess-requests-tabs">
          <button
            className={activeTab === 'leave' ? 'active' : ''}
            onClick={() => setActiveTab('leave')}
          >
            Leave
          </button>
          <button
            className={activeTab === 'claims' ? 'active' : ''}
            onClick={() => setActiveTab('claims')}
          >
            Claims
          </button>
          {showOTTab && (
            <button
              className={activeTab === 'ot' ? 'active' : ''}
              onClick={() => setActiveTab('ot')}
            >
              OT Approvals
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'leave' && <RequestCard title="Leave Requests" icon="🏖️" description="Apply for annual leave, medical leave, or other time off" buttonText="Manage Leave" path="/ess/leave" navigate={navigate} />}
        {activeTab === 'claims' && <RequestCard title="Expense Claims" icon="🧾" description="Submit and track your expense claims" buttonText="Manage Claims" path="/ess/claims" navigate={navigate} />}
        {activeTab === 'ot' && showOTTab && <RequestCard title="OT Approvals" icon="⏰" description="Review and approve overtime requests from your team" buttonText="View OT Requests" path="/ess/ot-approval" navigate={navigate} />}
      </div>
    </ESSLayout>
  );
}

// Request Card Component
function RequestCard({ title, icon, description, buttonText, path, navigate }) {
  return (
    <div className="request-card-content">
      <div className="request-icon">{icon}</div>
      <h3 className="request-title">{title}</h3>
      <p className="request-description">{description}</p>
      <button
        className="request-action-btn"
        onClick={() => navigate(path)}
      >
        {buttonText}
      </button>
    </div>
  );
}

export default ESSRequests;
