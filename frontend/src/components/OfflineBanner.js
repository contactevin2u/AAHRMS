import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import './OfflineBanner.css';

/**
 * OfflineBanner - Shows when user is offline
 * Can optionally block actions when offline
 */
function OfflineBanner({ blockAction = false, actionName = 'This action' }) {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className={`offline-banner ${blockAction ? 'blocking' : ''}`}>
      <span className="offline-icon">&#x1F4E1;</span>
      <span className="offline-message">
        {blockAction
          ? `${actionName} requires internet connection. Please reconnect.`
          : 'You are offline. Some features may be limited.'}
      </span>
      {blockAction && (
        <button className="retry-btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      )}
    </div>
  );
}

export default OfflineBanner;
