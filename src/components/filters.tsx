// One filter language for every list page: a framed bar holding the search
// field, segments and facet popovers, with a summary row of what is active.
import * as React from 'react'
import { Calendar as CalendarIcon, ChevronDown, Pin, Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { fmtInt } from '@/lib/format'
import { PILL_LIMIT, sameState, useSavedFilters, type SavedSet } from '@/lib/saved-filters'
import { toast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import type { DateRange } from 'react-day-picker'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export interface FacetOption {
  value: string
  label: string
  count?: number
  /** Items waiting for attention, drawn as a brand pill in segments. */
  badge?: number
  /** 1 nests the row under the plain row above it, for grouped lists. */
  depth?: 0 | 1
  /** Off limits next to what is already picked. */
  disabled?: boolean
  /** Why it is off limits, shown on hover and to a screen reader. */
  hint?: string
}

/** Shared control height, so every trigger on a bar lines up. */
export const TRIGGER = 'h-8 gap-1.5 text-[12.5px] font-medium'

/** The quiet action next to a list of chips, as used by Clear all. */
export const QUIET_LINK = 'h-auto p-0 text-[12px] text-brand'

// A glyph this small still needs a finger-sized target. The pseudo-element
// grows the tap area to the 24px minimum without moving anything on screen.
export const TAP_TARGET = "relative after:absolute after:-inset-1 after:content-['']"

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardContent className="grid gap-3 px-6 py-3.5">{children}</CardContent>
    </Card>
  )
}

export function FilterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

/** Quiet lead-in word that finishes a sentence the search field started, as in
 * "search … in [Title] [Author]". Anything else carries its own label: a select
 * takes a prefix, a facet takes its name. */
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
  onFocus,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  /** Fires when the field takes focus, for rows that only matter while typing. */
  onFocus?: () => void
  placeholder: string
  submitLabel?: string
  autoFocus?: boolean
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
  /** Sits at the right of an empty field, for a shortcut key badge. */
  hint?: React.ReactNode
}) {
  const field = (
    <InputGroup className="h-10 flex-1">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            onChange('')
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {!value && hint && <InputGroupAddon align="inline-end">{hint}</InputGroupAddon>}
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onChange('')}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
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

/** Wrapping pill row for category tabs; pair with FilterPill inside a Tabs root. */
export function FilterPillList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TabsList
      className={cn(
        'w-full flex-wrap justify-start gap-1.5 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto',
        className
      )}
    >
      {children}
    </TabsList>
  )
}

/** Pill-shaped tab for category switchers, in the shared active state. */
export function FilterPill({
  value, title, count, className, children,
}: { value: string; title?: string; count?: number; className?: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      title={title}
      className={cn(
        'h-auto flex-none justify-between gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground shadow-none transition-colors hover:bg-accent/50 data-active:border-brand/40 data-active:bg-brand-soft data-active:font-medium data-active:text-accent-foreground data-active:shadow-none',
        className
      )}
    >
      {children}
      {count != null && <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{fmtInt(count)}</span>}
    </TabsTrigger>
  )
}

/** Small fixed choice set. Single picks one, multiple toggles freely. */
export function FilterSegments({
  options,
  value,
  onChange,
  type = 'single',
  ariaLabel,
  className,
}: {
  options: FacetOption[]
  /** Names the group, e.g. "Search in" or "Media type". */
  ariaLabel?: string
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
      aria-label={ariaLabel}
      value={value as string[]}
      onValueChange={onChange as (v: string[]) => void}
      className={cn('flex-wrap', className)}
    >
      {items}
    </ToggleGroup>
  ) : (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={ariaLabel}
      value={value as string}
      onValueChange={(v) => v && (onChange as (x: string) => void)(v)}
      className={cn('flex-wrap', className)}
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

/** A filter that is only ever on or off, in the same frame as a facet trigger so
 * a bar of controls stays one row. The note rides along on hover, for a filter
 * that works differently from the ones beside it. */
export function FilterToggle({
  pressed, onPressedChange, label, note, icon,
}: {
  pressed: boolean
  onPressedChange: (v: boolean) => void
  label: string
  note?: string
  icon?: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={pressed}
      title={note}
      onClick={() => onPressedChange(!pressed)}
      className={cn(TRIGGER, pressed && 'bg-brand-soft text-accent-foreground')}
    >
      {icon}
      {label}
    </Button>
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
        <Button variant="link" onClick={onClear} className="h-auto p-0 text-[12px] text-brand">
          Clear
        </Button>
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
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => !o.disabled && onToggle(o.value)}
                  role="checkbox"
                  aria-checked={selected.includes(o.value)}
                  disabled={o.disabled}
                  title={o.hint}
                  className={cn(o.disabled && 'opacity-45')}
                >
                  <Checkbox checked={selected.includes(o.value)} aria-hidden className="pointer-events-none" />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto pl-2 text-[11px] text-muted-foreground">{o.hint}</span>}
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
            title={o.hint}
            className={cn(
              'flex items-center gap-2 rounded-sm px-1.5 py-1.5 text-[12.5px] font-normal hover:bg-accent/50',
              o.disabled && 'opacity-45'
            )}
          >
            <Checkbox
              checked={selected.includes(o.value)}
              disabled={o.disabled}
              onCheckedChange={() => onToggle(o.value)}
            />
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

/** Two-way switch at the head of a facet, for a list that can mean include or
 * exclude. Sits above the options it flips, so the meaning is set before the
 * picking starts. */
export function FacetMode({
  value, onChange, options, ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: FacetOption[]
  ariaLabel: string
}) {
  return (
    <div className="border-b p-1.5">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={ariaLabel}
        value={value}
        onValueChange={(v) => v && onChange(v)}
        className="w-full"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className="h-7 flex-1 text-[12px] text-muted-foreground data-pressed:bg-brand-soft data-pressed:text-accent-foreground"
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
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
}: {
  value: string
  onChange: (v: string) => void
  /** Each label says what it does on its own; the control carries no lead-in
   * word of its own. The name for a screen reader goes in ariaLabel. */
  options: FacetOption[]
  align?: 'start' | 'center' | 'end'
  ariaLabel?: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className={cn('h-8 w-auto text-[12.5px]', className)}>
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

/* Date fields travel as YYYY-MM-DD, which the endpoints speak. Both sides parse
 * in local time: an ISO string would land on UTC midnight plus shift the day for
 * anyone west of Greenwich. */
const asDate = (v: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

const asText = (d: Date | undefined): string =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''

const dayLabel = (d: Date | undefined): string =>
  d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

/** How a picked span reads. One day gives one date; a span names both ends;
 * one filled side reads as open-ended. */
export function dateRangeLabel(from: string, to: string, empty = ''): string {
  const a = asDate(from)
  const b = asDate(to)
  if (a && b) return +a === +b ? dayLabel(a) : `${dayLabel(a)} to ${dayLabel(b)}`
  if (a) return `From ${dayLabel(a)}`
  if (b) return `Until ${dayLabel(b)}`
  return empty
}

/** Two dates as one control, open-ended when a side is empty. A pick reports
 * outward once it is settled, on the second day or when the calendar closes,
 * because a search per click earns a 403. */
export function FilterDateRange({
  from,
  to,
  onChange,
  ariaLabel,
  placeholder = 'Pick a range',
  className,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  ariaLabel: string
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  // Touched keeps an emptied calendar empty: a draft of undefined would
  // otherwise read as "nothing picked yet" plus fall back to the settled span.
  const [draft, setDraft] = React.useState<{ touched: boolean; range?: DateRange }>({ touched: false })
  // Either side on its own is a valid span, so an end-only filter still reads
  // back in the trigger plus keeps its Clear button.
  const settled: DateRange | undefined =
    asDate(from) || asDate(to) ? { from: asDate(from), to: asDate(to) } : undefined
  const shown = (draft.touched ? draft.range : settled) ?? { from: undefined }

  const send = (next: DateRange | undefined) => {
    setDraft({ touched: false })
    onChange(asText(next?.from), asText(next?.to))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next && draft.touched) send(draft.range)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={ariaLabel} className={cn(TRIGGER, 'justify-start font-normal', className)}>
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          {dateRangeLabel(asText(shown.from), asText(shown.to), placeholder)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          autoFocus
          defaultMonth={shown.from}
          selected={shown}
          onSelect={(next) => {
            // The first day of a span comes back with both ends on it, so only
            // the second click makes it a range worth searching for.
            if (next?.from && next.to && +next.from !== +next.to) {
              send(next)
              setOpen(false)
            } else {
              setDraft({ touched: true, range: next })
            }
          }}
        />
        {(shown.from || shown.to) && (
          <>
            <Separator />
            <div className="flex justify-end px-2.5 py-1.5">
              <Button
                variant="link"
                onClick={() => {
                  send(undefined)
                  setOpen(false)
                }}
                className="h-auto p-0 text-[12px] text-brand"
              >
                Clear dates
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
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
  actions,
  meta,
  children,
  className,
}: {
  chips?: FilterChip[]
  onClearAll?: () => void
  /** Quiet links that act on the filters shown here, beside Clear all. */
  actions?: React.ReactNode
  meta?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const list = chips ?? []
  if (list.length === 0 && !meta && !children && !actions) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-2 px-6', className)}>
      {list.map((c) => (
        <Badge key={c.key} variant="outline" className="gap-1 rounded-full py-[3px] pl-2.5 pr-1 text-[12px] font-normal text-muted-foreground">
          {c.label}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${c.label}`}
            onClick={c.onRemove}
            className={cn('size-4 rounded-full text-muted-foreground/70 hover:bg-transparent hover:text-foreground', TAP_TARGET)}
          >
            <X className="size-3" />
          </Button>
        </Badge>
      ))}
      {list.length > 0 && onClearAll && (
        <Button variant="link" onClick={onClearAll} className={QUIET_LINK}>
          Clear all
        </Button>
      )}
      {actions}
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

const STORAGE_REFUSED = 'Your browser is blocking storage, so nothing was kept.'

export interface SavedViews {
  sets: SavedSet[]
  /** The set holding exactly what is on screen, so its pill reads as active. */
  active: SavedSet | null
  /** The set last applied, kept for the update action once filters move on. */
  loaded: SavedSet | null
  dirty: boolean
  canSave: boolean
  /** Whether the summary actions render anything, so a page can leave the row
   * out instead of spacing an empty one. */
  hasActions: boolean
  apply: (set: SavedSet) => void
  saveNew: () => void
  updateLoaded: () => void
  togglePin: () => void
}

/** Saved filter sets for one page. The active pill follows the filters
 * themselves, so applying a set, clearing the bar or landing on a pinned set
 * all read the same way. */
export function useSavedViews({
  page,
  state,
  name,
  filtered,
  onApply,
}: {
  page: string
  state: Record<string, unknown>
  /** Suggested name, normally the chips joined together. */
  name: string
  /** Whether anything is filtered right now, which is what Save asks about. */
  filtered: boolean
  onApply: (state: Record<string, unknown>) => void
}): SavedViews {
  const store = useSavedFilters(page)
  const [loadedId, setLoadedId] = React.useState<string | null>(null)
  const active = store.sets.find((s) => sameState(s.state, state)) ?? null
  const activeId = active?.id ?? null
  React.useEffect(() => {
    if (activeId) setLoadedId(activeId)
  }, [activeId])
  const loaded = loadedId ? (store.sets.find((s) => s.id === loadedId) ?? null) : null

  return {
    sets: store.sets,
    active,
    loaded,
    dirty: !active && loaded != null,
    canSave: filtered,
    hasActions: filtered && !active,
    apply: (set) => {
      setLoadedId(set.id)
      onApply(set.state)
    },
    saveNew: () => {
      const { ok, set } = store.save(name, state, name)
      if (!ok) {
        toast.error('Could not save these filters', { description: STORAGE_REFUSED })
        return
      }
      setLoadedId(set.id)
      toast.success(`Saved as "${set.name}"`)
    },
    updateLoaded: () => {
      if (!loaded) return
      if (!store.update(loaded.id, state, name)) {
        toast.error('Could not update this set', { description: STORAGE_REFUSED })
        return
      }
      toast.success(`Updated "${loaded.name}"`)
    },
    togglePin: () => {
      if (!active) return
      if (!store.pin(active.id, !active.pinned)) {
        toast.error('Could not change the default', { description: STORAGE_REFUSED })
      }
    },
  }
}

const savedLabel = (set: SavedSet) => (set.pinned ? `${set.name}, opens by default` : set.name)

/** The saved sets of a page, as one row of pills plus the default toggle. The
 * row is absent until the page holds a set. */
export function FilterSaved({ views, className }: { views: SavedViews; className?: string }) {
  if (views.sets.length === 0) return null
  const shown = views.sets.slice(0, PILL_LIMIT)
  const rest = views.sets.slice(PILL_LIMIT)
  const restActive = rest.some((s) => s.id === views.active?.id)

  return (
    <FilterRow className={className}>
      <FilterHint>Saved</FilterHint>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Saved filters"
        value={views.active?.id ?? ''}
        onValueChange={(v) => {
          const hit = views.sets.find((s) => s.id === v)
          if (hit) views.apply(hit)
        }}
        className="flex-wrap"
      >
        {shown.map((s) => (
          <ToggleGroupItem
            key={s.id}
            value={s.id}
            aria-label={savedLabel(s)}
            className={cn(
              'h-8 px-3 text-[12.5px] font-medium text-muted-foreground',
              'data-pressed:bg-brand-soft data-pressed:text-accent-foreground'
            )}
          >
            {s.pinned && <Pin aria-hidden className="size-3 text-muted-foreground" />}
            <span className="max-w-48 truncate">{s.name}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {rest.length > 0 && (
        <FilterFacet label="More" count={restActive ? 1 : 0} width="w-64">
          <Command>
            <CommandInput placeholder="Filter saved…" />
            <CommandList className="max-h-64">
              <CommandEmpty>Nothing by that name.</CommandEmpty>
              <CommandGroup>
                {rest.map((s) => (
                  <CommandItem key={s.id} value={s.name} onSelect={() => views.apply(s)}>
                    {s.pinned && <Pin aria-hidden className="size-3 text-muted-foreground" />}
                    <span className="truncate">{s.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </FilterFacet>
      )}
      {views.active && (
        <FilterToggle
          pressed={views.active.pinned === true}
          onPressedChange={views.togglePin}
          label="Default"
          note="Open this page with these filters"
          icon={<Pin className="size-3.5" />}
        />
      )}
    </FilterRow>
  )
}

/** Save plus update, for the summary row next to Clear all. */
export function FilterSavedActions({ views }: { views: SavedViews }) {
  if (!views.canSave || views.active) return null
  if (views.dirty && views.loaded) {
    return (
      <>
        <Button variant="link" onClick={views.updateLoaded} className={QUIET_LINK}>
          Update "{views.loaded.name}"
        </Button>
        <Button variant="link" onClick={views.saveNew} className={QUIET_LINK}>
          Save as new
        </Button>
      </>
    )
  }
  return (
    <Button variant="link" onClick={views.saveNew} className={QUIET_LINK}>
      Save these filters
    </Button>
  )
}
