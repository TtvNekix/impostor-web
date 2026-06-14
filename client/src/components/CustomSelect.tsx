import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
 *
 * Implementation notes
 * ---------------------
 * - The popup is rendered into a React portal attached to `document.body`
 *   with `position: fixed`. This is required because the menu is often
 *   nested inside containers with `backdrop-filter`, `transform`, or
 *   `will-change`, all of which create a new CSS stacking context and
 *   would otherwise trap a high z-index behind sibling elements.
 *   See https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context
 *
 * - The browser's native <option> popup on Windows / macOS Chrome ignores
 *   our `background` and `color` CSS, so we render our own list to
 *   guarantee readable dark-theme styling.
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
  const [popupStyle, setPopupStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLUListElement | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Sync highlight when value changes externally                    */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlight(idx);
  }, [value, options]);

  /* ---------------------------------------------------------------- */
  /*  Compute popup position from trigger rect                        */
  /* ---------------------------------------------------------------- */
  const computePopupStyle = () => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    const desiredWidth = Math.max(rect.width, 140);
    const margin = 6; // gap between trigger and popup
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(220, Math.max(120, openUpward ? spaceAbove : spaceBelow));
    return {
      top: openUpward ? rect.top - maxHeight - margin : rect.bottom + margin,
      left: rect.left,
      width: desiredWidth,
      maxHeight,
    };
  };

  useLayoutEffect(() => {
    if (!open) {
      setPopupStyle(null);
      return;
    }
    setPopupStyle(computePopupStyle());
  }, [open]);

  /* ---------------------------------------------------------------- */
  /*  Close on outside click / Escape                                 */
  /*  Keep popup glued to trigger on scroll/resize                    */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!open) return;

    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onScrollOrResize = () => {
      setPopupStyle(computePopupStyle());
    };
    const onWindowBlur = () => setOpen(false);

    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('blur', onWindowBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const popup =
    open && !disabled && popupStyle
      ? createPortal(
          <ul
            ref={popupRef}
            className="custom-select__menu"
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: popupStyle.top,
              left: popupStyle.left,
              width: popupStyle.width,
              maxHeight: popupStyle.maxHeight,
            }}
          >
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
                  onMouseDown={(e) => {
                    // Use mousedown so the click registers before the
                    // outside-click handler runs (which would close us first).
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    commit(idx);
                  }}
                >
                  <span className="custom-select__option-label">{opt.label}</span>
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
          </ul>,
          document.body,
        )
      : null;

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

      {popup}
    </div>
  );
}
