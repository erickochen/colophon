// One filter language for every list page: a framed bar holding the search
// field, segments and facet popovers, with a summary row of what is active.
import * as React from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { fmtInt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export interface FacetOption {
  value: string
  label: string
  count?: number
  /** Items waiting for attention, drawn as a brand pill in segments. */
  badge?: number
  /** 1 nests the row under the plain row above it, for grouped lists. */
  depth?: 0 | 1
}

/** Shared control height, so every trigger on a bar lines up. */
const TRIGGER = 'h-8 gap-1.5 text-[12.5px] font-medium'

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardContent className="grid gap-3 px-4 py-3.5">{children}</CardContent>
    </Card>
  )
}

export function FilterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

/** Quiet lead-in word before a group of controls, like "in" or "show". */
export function FilterHint({ children }: { children: React.ReactNode }) {
  return <span className="pr-0.5 text-[12px] text-muted-foreground">{children}</span>
}

export function FilterSearch({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel = 'Search',
  autoFocus,
  className,
  inputRef,
  hint,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  placeholder: string
  submitLabel?: string
  autoFocus?: boolean
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
  /** Sits at the right of an empty field, for a shortcut key badge. */
  hint?: React.ReactNode
}) {
  const field = (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            onChange('')
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn('h-10 pl-9', (value || hint) && 'pr-10')}
      />
      {!value && hint && <span className="absolute right-3 top-1/2 -translate-y-1/2">{hint}</span>}
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )

  if (!onSubmit) return <div className={cn('flex gap-2', className)}>{field}</div>
  return (
    <form
      className={cn('flex gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {field}
      <Button type="submit" className="h-10 px-5">{submitLabel}</Button>
    </form>
  )
}

/** Small fixed choice set. Single picks one, multiple toggles freely. */
export function FilterSegments({
  options,
  value,
  onChange,
  type = 'single',
  className,
}: {
  options: FacetOption[]
  className?: string
} & (
  | { type?: 'single'; value: string; onChange: (v: string) => void }
  | { type: 'multiple'; value: string[]; onChange: (v: string[]) => void }
)) {
  const items = options.map((o) => (
    <ToggleGroupItem
      key={o.value}
      value={o.value}
      aria-label={o.badge ? `${o.label}, ${fmtInt(o.badge)} new` : o.label}
      className={cn(
        'h-8 px-3 text-[12.5px] font-medium text-muted-foreground',
        'data-pressed:bg-brand-soft data-pressed:text-accent-foreground'
      )}
    >
      {o.label}
      {o.count != null && (
        <span className="text-[11px] tabular-nums text-muted-foreground">{fmtInt(o.count)}</span>
      )}
      {!!o.badge && (
        <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-brand">
          {fmtInt(o.badge)}
        </span>
      )}
    </ToggleGroupItem>
  ))

  return type === 'multiple' ? (
    <ToggleGroup
      type="multiple"
      variant="outline"
      value={value as string[]}
      onValueChange={onChange as (v: string[]) => void}
      className={className}
    >
      {items}
    </ToggleGroup>
  ) : (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value as string}
      onValueChange={(v) => v && (onChange as (x: string) => void)(v)}
      className={className}
    >
      {items}
    </ToggleGroup>
  )
}

/** Popover holding one facet. The badge carries how many picks are live. */
export function FilterFacet({
  label,
  count = 0,
  width = 'w-72',
  align = 'start',
  icon,
  children,
}: {
  label: string
  count?: number
  width?: string
  align?: 'start' | 'center' | 'end'
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={TRIGGER}>
          {icon}
          {label}
          {count > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums">
              {count}
            </Badge>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className={cn('p-0', width)}>
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** Checkbox list inside a facet, searchable once the list gets long. */
export function FacetOptions({
  options,
  selected,
  onToggle,
  onClear,
  searchable,
  searchPlaceholder = 'Filter…',
  emptyText = 'Nothing to pick.',
  columns = 1,
  maxHeight = 'max-h-64',
}: {
  options: FacetOption[]
  selected: string[]
  onToggle: (value: string) => void
  onClear?: () => void
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
  columns?: 1 | 2
  maxHeight?: string
}) {
  const footer = onClear && selected.length > 0 && (
    <>
      <Separator />
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="text-[11.5px] text-muted-foreground">{selected.length} selected</span>
        <button type="button" onClick={onClear} className="text-[12px] text-brand hover:underline">
          Clear
        </button>
      </div>
    </>
  )

  if (searchable) {
    return (
      <>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className={maxHeight}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => onToggle(o.value)}>
                  <Checkbox checked={selected.includes(o.value)} className="pointer-events-none" />
                  <span className="truncate">{o.label}</span>
                  {o.count != null && (
                    <span className="ml-auto pl-2 text-[11px] tabular-nums text-muted-foreground">{fmtInt(o.count)}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {footer}
      </>
    )
  }

  return (
    <>
      <div className={cn('overflow-y-auto p-1.5', maxHeight, columns === 2 && 'grid grid-cols-2 gap-x-2')}>
        {options.length === 0 && <p className="px-1.5 py-2 text-[12.5px] text-muted-foreground">{emptyText}</p>}
        {options.map((o) => (
          <Label
            key={o.value}
            className="flex items-center gap-2 rounded-sm px-1.5 py-1.5 text-[12.5px] font-normal hover:bg-accent/50"
          >
            <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onToggle(o.value)} />
            <span className={cn('truncate', o.depth === 1 && 'pl-2 text-muted-foreground')}>{o.label}</span>
            {o.count != null && (
              <span className="ml-auto pl-2 text-[11px] tabular-nums text-muted-foreground">{fmtInt(o.count)}</span>
            )}
          </Label>
        ))}
      </div>
      {footer}
    </>
  )
}

/** Titled block inside a wider facet popover. */
export function FacetSection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-2">
      <div className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {note && <span className="ml-1.5 font-normal normal-case tracking-normal">{note}</span>}
      </div>
      {children}
    </div>
  )
}

export function FilterSelect({
  value,
  onChange,
  options,
  align = 'start',
  ariaLabel,
  className,
  prefix,
}: {
  value: string
  onChange: (v: string) => void
  options: FacetOption[]
  align?: 'start' | 'center' | 'end'
  ariaLabel?: string
  className?: string
  prefix?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className={cn('h-8 w-auto text-[12.5px]', className)}>
        {prefix && <span className="text-muted-foreground">{prefix}</span>}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align={align} className="max-h-72">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

/** Row under the bar: what filters right now plus the result count. */
export function FilterSummary({
  chips,
  onClearAll,
  meta,
  children,
  className,
}: {
  chips?: FilterChip[]
  onClearAll?: () => void
  meta?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const list = chips ?? []
  if (list.length === 0 && !meta && !children) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-2 px-1', className)}>
      {list.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-input bg-card py-[3px] pl-2.5 pr-2 text-[12px] text-muted-foreground"
        >
          {c.label}
          <button
            type="button"
            aria-label={`Remove ${c.label}`}
            onClick={c.onRemove}
            className="rounded-sm text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {list.length > 0 && onClearAll && (
        <button type="button" onClick={onClearAll} className="text-[12px] text-brand hover:underline">
          Clear all
        </button>
      )}
      {(meta || children) && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {meta && <span className="text-[12px] tabular-nums text-muted-foreground">{meta}</span>}
          {children}
        </div>
      )}
    </div>
  )
}

export function toggleValue<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}
