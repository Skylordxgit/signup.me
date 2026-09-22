"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";

export type MultiSelectOption = {
  value: string;
  label: string;
  group?: string;
  count?: number;
};

export function MultiSelectDropdown({
  label,
  placeholder = "Select options...",
  options,
  selected = [],
  onChange,
  disabled = false,
  maxDisplayChips = 3,
}: {
  label?: string;
  placeholder?: string;
  options: (string | MultiSelectOption)[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  maxDisplayChips?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedOptions: MultiSelectOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const filteredOptions = normalizedOptions.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase()) ||
      (opt.group && opt.group.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const toggleOption = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((item) => item !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const removeChip = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((item) => item !== val));
  };

  const selectAll = () => {
    const allValues = normalizedOptions.map((o) => o.value);
    const combined = Array.from(new Set([...selected, ...allValues]));
    onChange(combined);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="admMultiSelectWrap" ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {label && (
        <label className="admFieldLabel" style={{ display: "block", marginBottom: "4px", fontSize: "var(--text-xs)", fontWeight: 650 }}>
          {label}
        </label>
      )}

      {/* Trigger Box */}
      <div
        className={`admMultiSelectTrigger ${disabled ? "isDisabled" : ""}`}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) setOpen(!open);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "4px",
          minHeight: "38px",
          padding: "4px 8px",
          background: "var(--c-surface)",
          border: "1px solid var(--c-line)",
          borderRadius: "var(--radius-md)",
          cursor: disabled ? "not-allowed" : "pointer",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: "var(--c-faint)", fontSize: "var(--text-xs)", padding: "2px 4px" }}>
            {placeholder}
          </span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", flex: 1, minWidth: 0 }}>
            {selected.slice(0, maxDisplayChips).map((val) => {
              const opt = normalizedOptions.find((o) => o.value === val);
              return (
                <span
                  key={val}
                  className="admChip"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 8px",
                    background: "var(--c-accent-soft)",
                    color: "var(--c-accent)",
                    border: "1px solid var(--c-line)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                  }}
                >
                  <span>{opt?.label || val}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${opt?.label || val}`}
                    onClick={(e) => removeChip(val, e)}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "inherit",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            {selected.length > maxDisplayChips && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 6px",
                  background: "var(--c-surface-sunken)",
                  color: "var(--c-muted)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                }}
              >
                +{selected.length - maxDisplayChips} more
              </span>
            )}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
          {selected.length > 0 && (
            <button
              type="button"
              title="Clear selections"
              aria-label="Clear selections"
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              style={{
                border: 0,
                background: "transparent",
                color: "var(--c-muted)",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={15} style={{ color: "var(--c-muted)" }} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {open && (
        <div
          className="admMultiSelectMenu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--c-surface)",
            border: "1px solid var(--c-line)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: "8px",
            maxHeight: "280px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {/* Search bar inside dropdown */}
          <div className="admSearchField" style={{ width: "100%" }}>
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                height: "30px",
                fontSize: "var(--text-xs)",
                paddingLeft: "34px !important",
              }}
            />
          </div>

          {/* Quick Toolbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "2px 4px",
              borderBottom: "1px solid var(--c-line)",
              fontSize: "var(--text-xs)",
              color: "var(--c-muted)",
            }}
          >
            <span>
              <strong>{selected.length}</strong> selected
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={selectAll}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "var(--c-accent)",
                  cursor: "pointer",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "var(--c-muted)",
                  cursor: "pointer",
                  fontSize: "var(--text-xs)",
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Options List */}
          <div
            style={{
              overflowY: "auto",
              maxHeight: "180px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {filteredOptions.length === 0 ? (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--c-muted)", fontSize: "var(--text-xs)" }}>
                No options match &quot;{search}&quot;
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: isSelected ? "var(--c-accent-soft)" : "transparent",
                      color: isSelected ? "var(--c-accent)" : "var(--c-text)",
                      cursor: "pointer",
                      fontSize: "var(--text-xs)",
                      fontWeight: isSelected ? 600 : 500,
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOption(opt.value)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {opt.count !== undefined && (
                      <span style={{ color: "var(--c-muted)", fontSize: "11px" }}>
                        ({opt.count})
                      </span>
                    )}
                    {isSelected && <Check size={14} style={{ color: "var(--c-accent)" }} />}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
