import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: ReactNode;
  /** The menu section the page lives under, so a phone user knows where they are. */
  eyebrow?: string;
  subtitle?: ReactNode;
  /** Page-level buttons, right-aligned on a wide screen and wrapped under the title on a phone. */
  actions?: ReactNode;
  children?: ReactNode;
};

function PageHeader({ title, eyebrow, subtitle, actions, children }: PageHeaderProps) {
  return (
    <header className="pageHeader">
      <div className="pageHeader-text">
        {eyebrow && <p className="pageHeader-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {subtitle && <p className="pageHeader-sub">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="pageHeader-actions">{actions}</div>}
    </header>
  );
}

export default PageHeader;
