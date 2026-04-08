import * as React from "react"
import { cn } from "@/lib/utils"

/* ── shadcn-style Card (new) ── */
const ShadCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-border bg-white text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  )
)
ShadCard.displayName = "ShadCard"

const ShadCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
)
ShadCardHeader.displayName = "ShadCardHeader"

const ShadCardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
ShadCardTitle.displayName = "ShadCardTitle"

const ShadCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
)
ShadCardContent.displayName = "ShadCardContent"

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

export { ShadCard, ShadCardHeader, ShadCardTitle, ShadCardContent, Card }
