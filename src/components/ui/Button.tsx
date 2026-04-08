import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/* ── shadcn-style Button (new) ── */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ShadButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const ShadButton = React.forwardRef<HTMLButtonElement, ShadButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
ShadButton.displayName = "ShadButton"

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

  return (
    <button
      className={`${baseClass} ${variantClass} ${className}`}
      disabled={disabled || isLoading}
      style={fullWidth ? { width: '100%' } : {}}
      {...props}
    >
      {isLoading && <span className="spinner" />}
      {!isLoading && leftIcon && <span className="icon-left">{leftIcon}</span>}
      {children}
    </button>
  );
};

export { ShadButton, buttonVariants, Button }
