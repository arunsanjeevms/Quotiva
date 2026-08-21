import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronDown, Loader2, Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Menu';
import { cn } from '@/lib/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** Server-side search: called as the user types. */
  onSearchChange?: (query: string) => void;
  /** Renders a persistent action row at the bottom, e.g. "New customer". */
  createAction?: { label: string; onSelect: (query: string) => void };
}

/**
 * Searchable single-select. Used for customer and product pickers where the
 * list can be large enough that a native select is unusable.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No results found.',
  loading = false,
  disabled = false,
  invalid = false,
  className,
  onSearchChange,
  createAction,
}: ComboboxProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const handleQuery = (next: string): void => {
    setQuery(next);
    onSearchChange?.(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded border border-line bg-surface px-2.5 text-left text-base shadow-sm transition-colors',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
            'disabled:cursor-not-allowed disabled:bg-subtle',
            invalid && 'border-danger focus:border-danger focus:ring-danger/20',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-content-muted')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-content-muted" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={!onSearchChange} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-content-muted" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={handleQuery}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent text-base outline-none placeholder:text-content-muted"
            />
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-content-muted" />}
          </div>

          <Command.List className="max-h-64 overflow-y-auto p-1">
            {!loading && (
              <Command.Empty className="px-2 py-6 text-center text-sm text-content-muted">
                {emptyMessage}
              </Command.Empty>
            )}

            {options.map((option) => (
              <Command.Item
                key={option.value}
                value={onSearchChange ? option.value : `${option.label} ${option.description ?? ''}`}
                disabled={option.disabled}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-base outline-none',
                  'data-[selected=true]:bg-subtle data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
                )}
              >
                <Check
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-primary',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-content">{option.label}</span>
                  {option.description && (
                    <span className="block truncate text-sm text-content-muted">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.meta && (
                  <span className="shrink-0 tabular text-sm text-content-muted">{option.meta}</span>
                )}
              </Command.Item>
            ))}
          </Command.List>

          {createAction && (
            <div className="border-t border-line p-1">
              <button
                type="button"
                onClick={() => {
                  createAction.onSelect(query);
                  setOpen(false);
                  setQuery('');
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-base text-primary hover:bg-primary-subtle"
              >
                <Plus className="h-3.5 w-3.5" />
                {createAction.label}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
