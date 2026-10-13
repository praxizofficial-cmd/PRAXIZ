"use client";

import { Search } from "lucide-react";

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <label className={`table-search shared-search ${compact ? "shared-search-compact" : ""}`.trim()}>
      <span className="sr-only">{label}</span>
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
