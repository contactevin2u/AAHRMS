import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ESSLayout from '../../components/ESSLayout';
import ESSLeave from './ESSLeave';
import ESSClaims from './ESSClaims';
import ESSOTApproval from './ESSOTApproval';
import { isSupervisorOrManager, isMimixCompany } from '../../utils/permissions';
import './ESSRequests.css';

function ESSRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
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

        {/* Tab Content - Directly embedded components */}
        {activeTab === 'leave' && <ESSLeave embedded={true} />}
        {activeTab === 'claims' && <ESSClaims embedded={true} />}
        {activeTab === 'ot' && showOTTab && <ESSOTApproval embedded={true} />}
      </div>
    </ESSLayout>
  );
}

export default ESSRequests;
