"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export type ManagerModule = {
  id: string;
  label: string;
  icon: string;
  description: string;
  badge?: number;
  content: ReactNode;
};

/** Native dialog provides focus trapping and makes the lobby inert while open. */
export default function ManagerModuleDialog({ module, onClose, onPrevious, onNext, labels }: {
  module: ManagerModule | undefined;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  labels: { back: string; previous: string; next: string; close: string };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = Boolean(module);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);

  return (
    <dialog ref={dialogRef} className="manager-module-dialog" aria-labelledby={titleId}
      onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {module ? <article>
        <header className="manager-module-dialog-header">
          <button type="button" onClick={onClose} className="manager-dialog-back">‹ {labels.back}</button>
          <div><h2 id={titleId}>{module.label}</h2><p>{module.description}</p></div>
          <nav aria-label={module.label}>
            <button type="button" onClick={onPrevious} aria-label={labels.previous}>‹</button>
            <button type="button" onClick={onNext} aria-label={labels.next}>›</button>
            <button type="button" onClick={onClose} aria-label={labels.close}>×</button>
          </nav>
        </header>
        <div key={module.id} className="manager-module-content">{module.content}</div>
      </article> : null}
    </dialog>
  );
}
