import * as React from "react";

/* ── Legacy Button (backward compat for AuditConfigForm / AuditTerminal) ── */
type LegacyButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';

interface LegacyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LegacyButtonVariant;
  isLoading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
}

const Button = ({
  children,
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  leftIcon,
  className = '',
  disabled,
  ...props
}: LegacyButtonProps) => {
  const baseClass = 'btn';
  const variantClass = `btn-${variant}`;
  const fullWidthClass = fullWidth ? 'btn-full' : '';

  return (
    <button
      className={[baseClass, variantClass, fullWidthClass, className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className="spinner" />}
      {!isLoading && leftIcon && <span className="icon-left">{leftIcon}</span>}
      {children}
    </button>
  );
};

export { Button };
