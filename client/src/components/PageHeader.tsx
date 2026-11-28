import React from 'react';

interface PageHeaderProps {
  icon: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Unified top header used across every page in Kotiäly so typography,
 * alignment, spacing, and responsive wrapping are 100% consistent.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  icon,
  title,
  subtitle,
  badge,
  actions,
}) => {
  return (
    <div className="page-header">
      <div className="page-header-left">
        <div className="page-header-title-row">
          <span className="page-header-icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="page-header-title">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
};
