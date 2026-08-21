import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { CalendarDays, X } from 'lucide-react';
import { parseISO, isValid } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from './Menu';
import { Button } from './Button';
import { NativeSelect } from './Input';
import { cn } from '@/lib/cn';
import { formatDate, toISODate } from '@/lib/format';
import { useBusinessOptional } from '@/stores/BusinessContext';
import type { DateRangePreset } from '@/types';

const dayPickerClassNames = {
  months: 'flex flex-col',
  month: 'space-y-2',
  caption: 'flex justify-center relative items-center h-8',
  caption_label: 'text-base font-medium text-content',
  nav: 'flex items-center gap-1',
  nav_button:
    'h-7 w-7 inline-flex items-center justify-center rounded text-content-muted hover:bg-subtle hover:text-content transition-colors',
  nav_button_previous: 'absolute left-0',
  nav_button_next: 'absolute right-0',
  table: 'w-full border-collapse',
  head_row: 'flex',
  head_cell: 'w-8 text-xs font-medium text-content-muted',
  row: 'flex w-full mt-1',
  cell: 'w-8 h-8 text-center p-0 relative',
  day: 'h-8 w-8 rounded text-sm text-content-secondary hover:bg-subtle transition-colors',
  day_selected: '!bg-primary !text-primary-fg hover:!bg-primary-hover',
  day_today: 'font-semibold text-primary',
  day_outside: 'text-content-muted opacity-40',
  day_disabled: 'opacity-30 cursor-not-allowed',
  day_range_middle: '!bg-primary-subtle !text-content rounded-none',
  day_range_start: 'rounded-l',
  day_range_end: 'rounded-r',
};

export interface DatePickerProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled,
  invalid,
  clearable = true,
  className,
  id,
}: DatePickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const business = useBusinessOptional();
  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded border border-line bg-surface px-2.5 text-left text-base shadow-sm transition-colors',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
            'disabled:cursor-not-allowed disabled:bg-subtle',
            invalid && 'border-danger',
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-content-muted" />
          <span className={cn('flex-1 truncate', !selected && 'text-content-muted')}>
            {selected ? formatDate(selected, business?.business.dateFormat) : placeholder}
          </span>
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-content-muted hover:bg-subtle hover:text-content"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? toISODate(date) : null);
            setOpen(false);
          }}
          classNames={dayPickerClassNames}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface DateRangeValue {
  preset: DateRangePreset;
  from?: string | undefined;
  to?: string | undefined;
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  this_year: 'This year',
  custom: 'Custom range',
};

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
}): React.ReactElement {
  const business = useBusinessOptional();
  const dateFormat = business?.business.dateFormat;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <NativeSelect
        aria-label="Date range"
        value={value.preset}
        onChange={(e) => {
          const preset = e.target.value as DateRangePreset;
          onChange(preset === 'custom' ? { ...value, preset } : { preset });
        }}
        className="h-8 w-auto text-sm"
      >
        {(Object.keys(PRESET_LABELS) as DateRangePreset[]).map((preset) => (
          <option key={preset} value={preset}>
            {PRESET_LABELS[preset]}
          </option>
        ))}
      </NativeSelect>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <DatePicker
            value={value.from ?? null}
            onChange={(from) => onChange({ ...value, from: from ?? undefined })}
            placeholder="From"
            clearable={false}
            className="h-8 w-36 text-sm"
          />
          <span className="text-sm text-content-muted">to</span>
          <DatePicker
            value={value.to ?? null}
            onChange={(to) => onChange({ ...value, to: to ?? undefined })}
            placeholder="To"
            clearable={false}
            className="h-8 w-36 text-sm"
          />
        </div>
      )}

      {value.preset === 'custom' && value.from && value.to && (
        <span className="text-sm text-content-muted">
          {formatDate(value.from, dateFormat)} – {formatDate(value.to, dateFormat)}
        </span>
      )}
    </div>
  );
}

/** Shared "clear all" affordance for filter toolbars. */
export function FilterReset({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <X className="h-3.5 w-3.5" />
      Clear
    </Button>
  );
}
