"use client";

import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";
import { X, type LucideIcon } from "lucide-react";

export function IconButton({ icon: Icon, label, ...props }: { icon: LucideIcon; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`admIconButton ${props.className || ""}`} title={label} aria-label={label}><Icon size={18} aria-hidden="true" /></button>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const controlId = useId();
  if (isValidElement<{ id?: string }>(children) && typeof children.type === 'string' && ['input', 'select', 'textarea', 'button'].includes(children.type)) {
    return <div className="admField"><label htmlFor={children.props.id || controlId}>{label}</label>{cloneElement(children, { id: children.props.id || controlId })}</div>;
  }
  return <div className="admField"><span>{label}</span>{children}</div>;
}

export function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="admDialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><IconButton icon={X} label="Close dialog" onClick={onClose} /></header>
    {children}
  </dialog>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`admBadge admBadge-${status}`}><i aria-hidden="true" />{status}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="admEmpty"><h3>{title}</h3>{children}</div>;
}

export function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="admSectionHeading"><h2>{title}</h2><div>{children}</div></div>;
}
