import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  detail?: string;
}

interface DropdownProps {
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
  width?: number;
}

const VISIBLE_OPTIONS = 60;

export function Dropdown({
  label,
  options,
  value,
  onChange,
  searchable = false,
  width,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? options.filter((option) =>
          `${option.label} ${option.detail ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
      : options;
    return filtered.slice(0, VISIBLE_OPTIONS);
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchable) searchInput.current?.focus();
  }, [isOpen, searchable]);

  const open = () => {
    setQuery("");
    setHighlighted(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setIsOpen(true);
  };

  const choose = (option: DropdownOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  const handleKeys = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (
        event.key === "ArrowDown" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        open();
      }
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(matches.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && matches[highlighted]) {
      event.preventDefault();
      choose(matches[highlighted]);
    }
  };

  return (
    <div
      className="dropdown"
      ref={container}
      onKeyDown={handleKeys}
      style={width ? { width } : undefined}
    >
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
      >
        <span className="dropdown-label">{label}</span>
        <span className="dropdown-value">{selected?.label ?? "Any"}</span>
        <svg className="dropdown-caret" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="dropdown-panel">
          {searchable && (
            <input
              ref={searchInput}
              className="dropdown-search"
              placeholder={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
            />
          )}
          <ul
            className="dropdown-list"
            role="listbox"
            id={listId}
            aria-label={label}
          >
            {matches.map((option, position) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={
                  position === highlighted ? "is-highlighted" : undefined
                }
                onPointerMove={() => setHighlighted(position)}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {option.detail && (
                  <span className="dropdown-detail">{option.detail}</span>
                )}
              </li>
            ))}
            {matches.length === 0 && (
              <li className="dropdown-empty">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

interface SegmentedProps<Value extends string> {
  label: string;
  options: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}

export function Segmented<Value extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<Value>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
