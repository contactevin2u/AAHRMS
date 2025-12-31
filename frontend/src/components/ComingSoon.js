import React from 'react';
import ESSLayout from './ESSLayout';
import './ComingSoon.css';

function ComingSoon({ title }) {
  return (
    <ESSLayout>
      <div className="coming-soon-container">
        <span className="coming-soon-icon">🚧</span>
        <h2 className="coming-soon-title">{title}</h2>
        <p className="coming-soon-text">Coming Soon</p>
        <p className="coming-soon-subtext">This feature is under development</p>
      </div>
    </ESSLayout>
  );
}

export default ComingSoon;
