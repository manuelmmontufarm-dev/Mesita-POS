import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type IconName =
  | 'arrow-left' | 'calendar' | 'card' | 'cash' | 'check' | 'chevron-right'
  | 'close' | 'conflict' | 'edit' | 'history' | 'info' | 'logout' | 'map'
  | 'menu' | 'minus' | 'plus' | 'print' | 'refresh' | 'save' | 'search'
  | 'settings' | 'sync' | 'table' | 'transfer' | 'trash' | 'users' | 'wifi-off';

const paths: Record<IconName, ReactNode> = {
  'arrow-left': <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M7 15h3" /></>,
  cash: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M7 9H5v2M17 9h2v2M7 15H5v-2M17 15h2v-2" /><circle cx="12" cy="12" r="2.5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  conflict: <><path d="M10.3 3.5 2.7 17a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15M15 6v15" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5M6.1 8a7 7 0 0 1 11.7-2.4L20 8M4 16l2.2 2.4A7 7 0 0 0 17.9 16" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  sync: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-2.4L20 8M4 16l2.2 2.4A7 7 0 0 0 17.9 16" /></>,
  table: <><rect x="3" y="5" width="18" height="10" rx="2" /><path d="M7 15v6M17 15v6M3 10h18" /></>,
  transfer: <><path d="M3 10h18M5 10V8l7-5 7 5v2M5 14v5M9 14v5M15 14v5M19 14v5M3 21h18" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  'wifi-off': <><path d="m2 2 20 20M8.5 8.5A12 12 0 0 1 21 9M5 12.5a9.5 9.5 0 0 1 3-1.8M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 9a15 15 0 0 1 3.2-1.7" /></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return <span className="spinner" role="status"><span aria-hidden="true" /> <span className="sr-only">{label}</span></span>;
}

export function AsyncButton({ busy, children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && <Spinner />}{children}
    </button>
  );
}

export function Modal({ title, description, children, onClose, wide = false }: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('button, input, textarea, select')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className={`modal-panel${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  children?: ReactNode;
}) {
  const icon: IconName = tone === 'danger' || tone === 'warning' ? 'conflict' : tone === 'success' ? 'check' : 'info';
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} />
      <div><strong>{title}</strong>{children && <div>{children}</div>}</div>
    </div>
  );
}

export function StatePill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`state-pill state-${tone}`}>{children}</span>;
}
