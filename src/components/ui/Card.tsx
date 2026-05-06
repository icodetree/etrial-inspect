import * as React from "react";

/* ── Legacy Card (backward compat for AuditConfigForm) ── */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: React.ReactNode;
}

const Card = ({ title, children, className = '', ...props }: CardProps) => {
  return (
    <section className={`card ${className}`} {...props}>
      {title && <h2 className="card-title">{title}</h2>}
      {children}
    </section>
  );
};

export { Card };
