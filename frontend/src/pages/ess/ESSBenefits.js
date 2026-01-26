import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSBenefits.css';

function ESSBenefits() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [benefits, setBenefits] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      const info = JSON.parse(storedInfo);
      if (!info.features?.benefitsInKind) {
        navigate('/ess/dashboard');
        return;
      }
    }
    fetchBenefits();
  }, [navigate]);

  const fetchBenefits = async () => {
    try {
      const res = await essApi.getBenefits();
      setBenefits(res.data.benefits || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      console.error('Error fetching benefits:', err);
      setError(err.response?.data?.error || 'Failed to load benefits');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat(language === 'ms' ? 'ms-MY' : 'en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getBenefitIcon = (type) => {
    const icons = {
      company_car: '&#x1F697;',
      laptop: '&#x1F4BB;',
      mobile_phone: '&#x1F4F1;',
      ipad: '&#x1F4F1;',
      fuel_card: '&#x26FD;',
      parking: '&#x1F17F;&#xFE0F;',
      insurance: '&#x1F3E5;',
      housing: '&#x1F3E0;',
      other: '&#x1F381;'
    };
    return icons[type] || icons.other;
  };

  if (loading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>{t('common.loading')}</p>
        </div>
      </ESSLayout>
    );
  }

  return (
    <ESSLayout>
      <div className="ess-benefits">
        <h1>{t('benefits.benefitsInKind')}</h1>
        <p className="subtitle">{t('benefits.subtitle')}</p>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {/* Summary Card */}
        {summary && (
          <div className="summary-card">
            <div className="summary-row">
              <div className="summary-item">
                <span className="summary-label">{t('benefits.activeBenefits')}</span>
                <span className="summary-value">{summary.total_active}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">{t('benefits.annualValue')}</span>
                <span className="summary-value">{formatCurrency(summary.annual_value)}</span>
              </div>
            </div>
            <div className="summary-row">
              <div className="summary-item">
                <span className="summary-label">{t('benefits.monthlyValue')}</span>
                <span className="summary-value">{formatCurrency(summary.monthly_value)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">{t('benefits.taxableValue')}</span>
                <span className="summary-value">{formatCurrency(summary.taxable_annual)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Benefits List */}
        {benefits.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">&#x1F381;</span>
            <p>{t('benefits.noBenefits')}</p>
          </div>
        ) : (
          <div className="benefits-list">
            {benefits.map((benefit) => (
              <div key={benefit.id} className="benefit-card">
                <div className="benefit-header">
                  <span
                    className="benefit-icon"
                    dangerouslySetInnerHTML={{ __html: getBenefitIcon(benefit.benefit_type) }}
                  />
                  <div className="benefit-info">
                    <h3>{benefit.benefit_name}</h3>
                    <span className="benefit-type">{benefit.type_name || benefit.benefit_type}</span>
                  </div>
                  {benefit.taxable && (
                    <span className="taxable-badge">{t('benefits.taxable')}</span>
                  )}
                </div>

                {benefit.description && (
                  <p className="benefit-description">{benefit.description}</p>
                )}

                <div className="benefit-details">
                  <div className="detail-row">
                    <span className="detail-label">{t('benefits.annualValue')}</span>
                    <span className="detail-value">{formatCurrency(benefit.annual_value)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('benefits.monthlyValue')}</span>
                    <span className="detail-value">{formatCurrency(benefit.monthly_value)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('benefits.assignedDate')}</span>
                    <span className="detail-value">{formatDate(benefit.assigned_date)}</span>
                  </div>
                  {benefit.serial_number && (
                    <div className="detail-row">
                      <span className="detail-label">{t('benefits.serialNo')}</span>
                      <span className="detail-value">{benefit.serial_number}</span>
                    </div>
                  )}
                  {benefit.asset_tag && (
                    <div className="detail-row">
                      <span className="detail-label">{t('benefits.assetTag')}</span>
                      <span className="detail-value">{benefit.asset_tag}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Note */}
        <div className="info-note">
          <span className="info-icon">&#x2139;&#xFE0F;</span>
          <p>{t('benefits.infoNote')}</p>
        </div>
      </div>
    </ESSLayout>
  );
}

export default ESSBenefits;
