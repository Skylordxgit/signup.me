"use client";

/**
 * Shared admin UI primitives.
 *
 * Every admin screen composes these instead of hand-rolling its own buttons,
 * cards, dialogs or states, so spacing, sizing, focus and icon treatment stay
 * identical across the panel. Icons come from lucide-react only.
 */

import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";
import { Loader2, X, type LucideIcon } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "admPrimary",
  secondary: "",
  outline: "admOutline",
  ghost: "admGhost",
  danger: "admDestructive",
};

/** The one button. Every admin action uses this or IconButton. */
export function Button({
  variant = "secondary",
  size,
  icon: Icon,
  loading = false,
  block = false,
  children,
  className = "",
  disabled,
  ...props
}: {
  variant?: ButtonVariant;
  size?: "sm";
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = ["admButton", variantClass[variant], size === "sm" ? "admSmall" : "", block ? "admBlock" : "", className].filter(Boolean).join(" ");
  return (
    <button type="button" {...props} className={classes} disabled={disabled || loading}>
      {loading ? <Loader2 className="admSpinner" size={16} aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** Icon-only button. The label is required: it becomes the tooltip and a11y name. */
export function IconButton({
  icon: Icon,
  label,
  tone,
  ...props
}: { icon: LucideIcon; label: string; tone?: "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`admIconButton ${tone === "danger" ? "admIconDanger" : ""} ${props.className || ""}`}
      title={label}
      aria-label={label}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

/** Label + control pair. Associates the label with native controls automatically. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  const controlId = useId();
  const isNative = isValidElement<{ id?: string }>(children) && typeof children.type === "string" && ["input", "select", "textarea", "button"].includes(children.type);
  return (
    <div className="admField">
      {isNative ? (
        <>
          <label htmlFor={(children as React.ReactElement<{ id?: string }>).props.id || controlId}>{label}</label>
          {cloneElement(children as React.ReactElement<{ id?: string }>, { id: (children as React.ReactElement<{ id?: string }>).props.id || controlId })}
        </>
      ) : (
        <>
          <span>{label}</span>
          {children}
        </>
      )}
      {hint && !error && <small className="admHelper">{hint}</small>}
      {error && <small className="admFieldError" role="alert">{error}</small>}
    </div>
  );
}

/** Modal dialog. Native <dialog> so focus trapping and Esc come from the platform. */
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`admDialog ${wide ? "admDialogWide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <IconButton icon={X} label="Close dialog" onClick={onClose} />
      </header>
      <div className="admDialogBody">{children}</div>
    </dialog>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`admBadge admBadge-${status}`}>
      <i aria-hidden="true" />
      {status}
    </span>
  );
}

/** Empty state: icon, title, explanation, and the action that resolves it. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="admEmpty">
      {Icon && (
        <span className="admEmptyIcon">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children && <div className="admActionRow">{children}</div>}
    </div>
  );
}

/** Loading state. Never leave a blank screen while data is in flight. */
export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="admLoading" role="status">
      <Loader2 className="admSpinner" size={22} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Skeleton placeholder for content whose shape is known ahead of time. */
export function Skeleton({ height = 12, width = "100%", className = "" }: { height?: number | string; width?: number | string; className?: string }) {
  return <span aria-hidden="true" className={`admSkeleton ${className}`} style={{ display: "block", height, width }} />;
}

export function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="admSectionHeading">
      <h2>{title}</h2>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

/** Screen title block: title, supporting copy and the screen's primary actions. */
export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="admPageHeading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children ? <div className="admActionRow">{children}</div> : null}
    </div>
  );
}

/** Standard content card with an optional header row. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`admCard ${className}`}>
      {(title || actions) && (
        <div className="admCardHeader">
          <div>
            {title && <h3>{title}</h3>}
            {description && <p>{description}</p>}
          </div>
          {actions ? <div className="admActionRow">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
