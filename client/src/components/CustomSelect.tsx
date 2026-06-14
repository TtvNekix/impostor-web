import { useEffect, useRef, useState } from 'react';

export interface CustomSelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface CustomSelectProps<T extends string | number> {
  value: T;
  options: CustomSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Accessible dark-theme dropdown that replaces the native <select>.
 * - The trigger looks like a select (chevron, padding, border)
 * - Click toggles a popup list of options
 * - Click outside / Escape closes the popup
 * - Arrow keys move the highlight, Enter selects
 *
 * The browser's native <option> popup on Windows / macOS ignores our
 * `background` and `color` CSS, so we render our own list to guarantee
 * readable dark-theme styling.
 */
export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Sync highlight when value changes externally                    */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlight(idx);
  }, [value, options]);

  /* ---------------------------------------------------------------- */
  /*  Close on outside click / Escape                                 */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDownTrigger = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => (h + dir + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) commit(highlight);
      else setOpen(true);
    } else if (e.key === 'Escape' && open) {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`custom-select${open ? ' custom-select--open' : ''}${disabled ? ' custom-select--disabled' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="custom-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDownTrigger}
      >
        <span className="custom-select__value">{current?.label ?? ''}</span>
        <svg
          className="custom-select__chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M2 4 L6 8 L10 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && !disabled && (
        <ul className="custom-select__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((opt, idx) => {
            const selected = opt.value === value;
            const active = idx === highlight;
            return (
              <li
                key={String(opt.value)}
                role="option"
                aria-selected={selected}
                className={
                  `custom-select__option${selected ? ' custom-select__option--selected' : ''}` +
                  `${active ? ' custom-select__option--active' : ''}`
                }
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => commit(idx)}
              >
                {opt.label}
                {selected && (
                  <svg
                    className="custom-select__check"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 7 L6 11 L12 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
