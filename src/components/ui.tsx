import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function Spinner() {
  return <div className="spinner" aria-label="Загрузка" />;
}

export function Alert({
  type = 'info',
  children,
}: {
  type?: 'info' | 'error' | 'success' | 'warn';
  children: ReactNode;
}) {
  return <div className={`alert alert-${type}`}>{children}</div>;
}

export function Button({
  variant = 'primary',
  size,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm';
}) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="form-group">
      <label>{label}</label>
      {children}
      {hint && (
        <span className="muted" style={{ fontSize: '0.75rem' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({
  emoji = '📅',
  title,
  text,
}: {
  emoji?: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <div className="emoji">{emoji}</div>
      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      {text && <p className="muted">{text}</p>}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (c: string) => void;
  colors: string[];
}) {
  return (
    <div className="color-grid" role="listbox" aria-label="Цвет">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-swatch ${value === c ? 'selected' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}

export function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label}
    />
  );
}
