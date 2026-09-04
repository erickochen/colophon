import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft, BookImage, BookOpen, Check, ChevronLeft, ChevronRight, ChevronsUpDown, ExternalLink, FileJson,
  Headphones, Images, ListPlus, Music, Newspaper, Plus, Podcast, Radio, Search, Sparkles, TriangleAlert, X,
} from 'lucide-react'
import type { PageProps } from '@/app/router'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { useTaxonomy2, type Category2 } from '@/lib/categories2'
import { cleanHtml } from '@/lib/sanitize'
import { localDate } from '@/lib/format'
import { requestsUrl } from '@/lib/mam-api'
import { allowPickedName } from '@/lib/mam-names'
import {
  applyFill, checkRequestDupes, checkTorrentDupes, clearRequestDraft, emptyValues, fetchRequestForm,
  lookupIsbn, readRequestDraft, splitNames, submitDetails, writeRequestDraft,
  MAIN_CAT_NAMES, MEDIA_TYPES,
  type DupeRequest, type DupeTorrent, type FieldError, type Option, type RequestForm, type RequestValues,
} from '@/lib/new-request'
import { useCollapsed } from '@/lib/collapsed'
import { BBComposer } from '@/components/bb-composer'
import { WizardNav, WizardSteps, useWizardStep } from '@/components/wizard'
import { CollapsibleSection } from '@/components/section'
import { FacetOptions, FilterSummary } from '@/components/filters'
import { NameSuggest } from '@/components/name-suggest'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError as FieldErrorText, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { submitNative } from '@/lib/form-submit'

const STEPS = ['Type', 'Details', 'Categories', 'Confirm']
const TITLE_CASE_URL = 'https://titlecaseconverter.com/'
const REQUESTS_URL = requestsUrl()
/** Above this many genres the list gets its own search box. */
const SEARCHABLE_GENRES = 12
/** Shortest name MAM's own check accepts for an author. */
const MIN_AUTHOR_CHARS = 3

const MEDIA_ICONS: Record<number, typeof BookOpen> = {
  1: Headphones, 2: BookOpen, 3: Music, 4: Radio, 5: BookImage, 6: Images, 7: Newspaper, 8: Podcast,
}

/** Which step a rejected field belongs to, keyed by MAM's own error name. */
const ERROR_STEP: Record<string, number> = {
  TITLE: 1, AUTHOR: 1, NARRATOR: 1, SERIES: 1, PUBLISHEDURL: 1, RELEASEDATE: 1, POSTERURL: 1, ISBN: 1,
  LANGUAGE: 1, DESCRIPTION: 1, CATEGORY: 2, CATEGORIES: 2, MAIN_CAT: 2, MEDIATYPE: 0,
}

const errorFor = (errors: FieldError[], key: string) => errors.find((e) => e.key === key)?.message

/** Searchable single choice, the same shape the scheme picker uses. */
function PickOne({
  options, value, onValue, placeholder, searchLabel, invalid,
}: {
  options: Option[]
  value: string
  onValue: (v: string) => void
  placeholder: string
  searchLabel: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-10 w-full justify-start gap-2 px-3 text-13 font-normal',
            !current && 'text-muted-foreground'
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,var(--available-width))] p-0">
        <Command>
          <CommandInput placeholder={searchLabel} />
          <CommandList className="max-h-64">
            <CommandEmpty>Nothing matches that.</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                keywords={[o.label]}
                className="h-8 gap-2 text-12-5"
                onSelect={() => {
                  onValue(o.value)
                  setOpen(false)
                }}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="ml-auto size-3.5 shrink-0 text-brand" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** One field of the form, label on top with the control at full width. */
function Row({
  label, hint, error, children, required,
}: { label: string; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldTitle className="text-13-5">
        {label}
        {required && <span className="text-12 font-normal text-muted-foreground">required</span>}
      </FieldTitle>
      {hint && <FieldDescription className="-mt-1 text-12">{hint}</FieldDescription>}
      {children}
      {error && <FieldErrorText className="text-12">{error}</FieldErrorText>}
    </Field>
  )
}

/** Author and narrator boxes: MAM takes one name per box plus a button that
 * adds another, so the same shape lives here. */
function NameRows({
  kind, values, onValues, placeholder, error,
}: {
  kind: 'author' | 'narrator'
  values: string[]
  onValues: (v: string[]) => void
  placeholder: string
  error?: string
}) {
  const rows = values.length ? values : ['']
  return (
    <div className="grid gap-2">
      {rows.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <NameSuggest
            kind={kind}
            defaultValue={name}
            placeholder={placeholder}
            className="h-10 w-full text-13"
            onChange={(v) => onValues(rows.map((old, j) => (j === i ? v : old)))}
            onPick={(hit) => {
              const el = document.activeElement
              if (el instanceof HTMLInputElement) allowPickedName(el, hit.name)
            }}
          />
          {rows.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Remove this ${kind}`}
              onClick={() => onValues(rows.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      <div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-12-5"
          onClick={() => onValues([...rows, ''])}
        >
          <Plus /> Add another {kind}
        </Button>
      </div>
      {error && <p className="text-12 text-destructive">{error}</p>}
    </div>
  )
}

function SeriesRows({
  values, onValues,
}: { values: RequestValues['series']; onValues: (v: RequestValues['series']) => void }) {
  const rows = values.length ? values : [{ name: '', extra: '' }]
  return (
    <div className="grid gap-2">
      {rows.map((s, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <div className="min-w-48 flex-1">
            <NameSuggest
              kind="series"
              defaultValue={s.name}
              placeholder="Series name"
              className="h-10 w-full text-13"
              onChange={(v) => onValues(rows.map((old, j) => (j === i ? { ...old, name: v } : old)))}
            />
          </div>
          <Input
            value={s.extra}
            placeholder="Number in series"
            aria-label="Number in series"
            className="h-10 w-40 text-13"
            onChange={(e) => onValues(rows.map((old, j) => (j === i ? { ...old, extra: e.target.value } : old)))}
          />
          {rows.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Remove this series"
              onClick={() => onValues(rows.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      <div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-12-5"
          onClick={() => onValues([...rows, { name: '', extra: '' }])}
        >
          <Plus /> Add another series
        </Button>
      </div>
    </div>
  )
}

/** Paste a block of names at once, the way MAM's fast fill takes them. */
function FastFillDialog({
  open, onOpenChange, onNames,
}: { open: boolean; onOpenChange: (v: boolean) => void; onNames: (kind: 'author' | 'narrator' | 'series', names: string[]) => void }) {
  const [kind, setKind] = useState<'author' | 'narrator' | 'series'>('author')
  const [text, setText] = useState('')
  const [splitAmp, setSplitAmp] = useState(false)
  const names = splitNames(text, splitAmp)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fast fill names</DialogTitle>
          <DialogDescription>
            One name per line. Semicolons split too, so a copied credits line usually lands right.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as typeof kind)}
            className="justify-start"
          >
            <ToggleGroupItem value="author" className="h-8 px-3 text-12-5">Authors</ToggleGroupItem>
            <ToggleGroupItem value="narrator" className="h-8 px-3 text-12-5">Narrators</ToggleGroupItem>
            <ToggleGroupItem value="series" className="h-8 px-3 text-12-5">Series</ToggleGroupItem>
          </ToggleGroup>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Terry Pratchett\nNeil Gaiman'}
            className="min-h-32 text-13"
          />
          <FieldLabel className="text-12-5 font-normal">
            <Field orientation="horizontal">
              <Checkbox checked={splitAmp} onCheckedChange={(v) => setSplitAmp(v === true)} />
              <FieldTitle className="text-12-5 font-normal">Split on ampersands too</FieldTitle>
            </Field>
          </FieldLabel>
          <p className="text-12 text-muted-foreground">
            {names.length === 0 ? 'Nothing to add yet.' : `${names.length} ${names.length === 1 ? 'name' : 'names'} ready.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={names.length === 0}
            onClick={() => {
              onNames(kind, names)
              setText('')
              onOpenChange(false)
            }}
          >
            Add {names.length > 0 ? names.length : ''} to the form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** MAM accepts a metadata blob that fills the whole form at once. */
function JsonFillDialog({
  open, onOpenChange, onData,
}: { open: boolean; onOpenChange: (v: boolean) => void; onData: (data: unknown) => void }) {
  const [text, setText] = useState('')
  const [bad, setBad] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fill from JSON</DialogTitle>
          <DialogDescription>
            Paste a metadata blob and the fields it names get filled. Everything stays editable afterwards.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setBad(null)
          }}
          placeholder='{"title":"…","authors":["…"]}'
          className="min-h-40 font-mono text-12-5"
        />
        {bad && <p className="text-12 text-destructive">{bad}</p>}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              try {
                onData(JSON.parse(text))
                setText('')
                onOpenChange(false)
              } catch {
                setBad('That is not valid JSON, so nothing was filled in.')
              }
            }}
          >
            Fill the form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What is about to be sent, so the credit is never spent on a blind form. */
function SummaryCard({
  values, form, taxonomyNames, onEdit,
}: {
  values: RequestValues
  form: RequestForm
  taxonomyNames: Map<number, string>
  onEdit: (step: number) => void
}) {
  const mediaName = MEDIA_TYPES.find((m) => m.id === Number(values.mediaType))?.name ?? ''
  const language = form.languages.find((l) => l.value === values.language)?.label ?? ''
  const category = form.categories.find((c) => c.value === values.category)?.label ?? ''
  const genres = values.categories.map((id) => taxonomyNames.get(Number(id))).filter(Boolean)
  const authors = values.authors.filter(Boolean)
  const series = values.series.filter((s) => s.name.trim())
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Title', value: values.title, step: 1 },
    { label: authors.length > 1 ? 'Authors' : 'Author', value: authors.join(', '), step: 1 },
    { label: 'Series', value: series.map((s) => [s.name, s.extra].filter(Boolean).join(' ')).join(', '), step: 1 },
    { label: 'Narrator', value: values.narrators.filter(Boolean).join(', '), step: 1 },
    { label: 'Type', value: [mediaName, language].filter(Boolean).join(' · '), step: 0 },
    { label: 'Released', value: values.releaseDate, step: 1 },
    { label: 'Category', value: category, step: 2 },
    { label: genres.length > 1 ? 'Genres' : 'Genre', value: genres.join(', '), step: 2 },
  ]
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3.5">
        <CardTitle>What you are asking for</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 pb-5">
        {rows
          .filter((r) => r.value.trim())
          .map((r) => (
            <div key={r.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-13">
              <span className="w-20 shrink-0 text-12 text-muted-foreground">{r.label}</span>
              <span className="min-w-0 flex-1 leading-snug">{r.value}</span>
              <button
                type="button"
                onClick={() => onEdit(r.step)}
                className="shrink-0 text-12 text-brand hover:underline"
              >
                Edit
              </button>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}

function DupeTorrentRow({ t }: { t: DupeTorrent }) {
  return (
    <a
      href={`/t/${t.id}`}
      target="_blank"
      rel="noopener"
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-6 py-2.5 hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1 text-13 font-medium leading-snug">{t.title}</span>
      {t.authors.length > 0 && (
        <span className="text-12 text-muted-foreground">{t.authors.join(', ')}</span>
      )}
      <span className="text-11-5 tabular-nums text-muted-foreground">
        {t.filetype && `${t.filetype.toUpperCase()} · `}{t.sizeReadable}
        {t.added > 0 && ` · ${localDate(new Date(t.added * 1000).toISOString())}`}
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  )
}

function DupeRequestRow({ r }: { r: DupeRequest }) {
  return (
    <a
      href={`/t/r/${r.requestTime}`}
      target="_blank"
      rel="noopener"
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-6 py-2.5 hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1 text-13 font-medium leading-snug">{r.title}</span>
      {r.authors.length > 0 && (
        <span className="text-12 text-muted-foreground">{r.authors.join(', ')}</span>
      )}
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  )
}

export function NewRequestView(props: PageProps) {
  const taxonomy = useTaxonomy2()
  const rules = useCollapsed('new-request')
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [values, setValues] = useState<RequestValues>(emptyValues())
  const [form, setForm] = useState<RequestForm | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formFailed, setFormFailed] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldError[]>([])
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState(false)
  const [combined, setCombined] = useState<{ combined: string; lr: string } | null>(null)
  const [dupeTorrents, setDupeTorrents] = useState<DupeTorrent[] | null>(null)
  const [dupeRequests, setDupeRequests] = useState<DupeRequest[] | null>(null)
  const [agreeTorrents, setAgreeTorrents] = useState(false)
  const [agreeRequests, setAgreeRequests] = useState(false)
  const [isbnBusy, setIsbnBusy] = useState(false)
  const [fastFill, setFastFill] = useState(false)
  const [jsonFill, setJsonFill] = useState(false)
  const [draftOffer, setDraftOffer] = useState(false)
  const [sending, setSending] = useState(false)
  const { topRef, live } = useWizardStep(step, `Step ${step + 1} of ${STEPS.length}, ${STEPS[step]}.`)
  /** The values the current blob was built from, so an edit can invalidate it. */
  const confirmedFor = useRef<string | null>(null)
  /** Only the newest dupe run may write its answer into the lists. */
  const dupeRun = useRef(0)

  const mediaType = Number(values.mediaType) || 0
  const mainCat = MEDIA_TYPES.find((m) => m.id === mediaType)?.mainCat ?? ''

  // MAM prints the rules beside its own form plus the credit balance, so both
  // belong on the first step here.
  const intro = useMemo(() => {
    const main = props.page.mainContent
    const rules = main?.querySelector('fieldset')
    const text = [...(main?.querySelectorAll('div') ?? [])]
      .map((d) => (d.textContent ?? '').replace(/\s+/g, ' '))
      .find((t) => /Remaining Credits/i.test(t))
    const monthly = text?.match(/(\d+)\s+of\s+(\d+)\s+this month/i)
    const extra = text?.match(/([\d.,]+)\s+extra credits/i)
    return {
      rulesHtml: rules ? cleanHtml(rules) : null,
      credits: monthly ? `${monthly[1]} of ${monthly[2]} credits this month` : null,
      extraCredits: extra ? `${extra[1]} extra` : null,
    }
  }, [props.page.mainContent])

  // Picking a media type decides which form the server renders, so the section
  // it belongs to fetches that form once.
  useEffect(() => {
    if (!mainCat) return
    if (form?.mainCat === mainCat) return
    let live = true
    setFormBusy(true)
    setFormFailed(false)
    fetchRequestForm(mainCat)
      .then((f) => {
        if (!live) return
        setForm(f)
        setFormBusy(false)
      })
      .catch(() => {
        if (!live) return
        setFormBusy(false)
        setFormFailed(true)
      })
    return () => {
      live = false
    }
  }, [mainCat, form?.mainCat])

  useEffect(() => {
    if (readRequestDraft()) setDraftOffer(true)
  }, [])

  // Anything typed survives a misclick, so the draft follows the values. It
  // waits until the offered draft is answered, since saving over it first would
  // leave nothing to pick up.
  useEffect(() => {
    if (draftOffer || !values.mediaType) return
    writeRequestDraft({ values, mainCat, step })
  }, [values, mainCat, step, draftOffer])

  // What MAM handed back belongs to the values it was given. Any edit after
  // that makes the blob stale, so it goes and the last step closes again.
  useEffect(() => {
    if (!combined) return
    if (confirmedFor.current === JSON.stringify(values)) return
    confirmedFor.current = null
    setCombined(null)
    setDupeTorrents(null)
    setDupeRequests(null)
    setAgreeTorrents(false)
    setAgreeRequests(false)
    setReached((r) => Math.min(r, 2))
    setStep((s) => (s === 3 ? 2 : s))
  }, [values, combined])

  const setValue = useCallback(<K extends keyof RequestValues>(key: K, v: RequestValues[K]) => {
    setValues((s) => ({ ...s, [key]: v }))
    setLocalErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }, [])

  const genresFor = useCallback(
    (media: number, main: number) =>
      (taxonomy?.categories ?? []).filter(
        (c) => c.mediaTypes.includes(media) && (!main || c.mainTypes.includes(main))
      ),
    [taxonomy]
  )
  const genres = useMemo(
    () => genresFor(mediaType, Number(values.mainType) || 0),
    [genresFor, mediaType, values.mainType]
  )

  const byId = useMemo(() => new Map((taxonomy?.categories ?? []).map((c) => [c.id, c])), [taxonomy])
  const genreNames = useMemo(() => new Map((taxonomy?.categories ?? []).map((c) => [c.id, c.name])), [taxonomy])
  const picked = useMemo(() => new Set(values.categories.map(Number)), [values.categories])
  /** Pairs MAM marks as impossible. The data names the clash on one side only,
   * so both sides are stored to keep the block symmetric. */
  const conflicts = useMemo(() => {
    const map = new Map<number, Set<number>>()
    const add = (a: number, b: number) => {
      const set = map.get(a) ?? new Set<number>()
      set.add(b)
      map.set(a, set)
    }
    for (const c of taxonomy?.categories ?? []) {
      for (const other of c.excludes) {
        add(c.id, other)
        add(other, c.id)
      }
    }
    return map
  }, [taxonomy])
  const blocked = useMemo(() => {
    const out = new Map<number, string>()
    for (const id of picked) {
      for (const other of conflicts.get(id) ?? []) {
        if (!picked.has(other)) out.set(other, `Does not go with ${genreNames.get(id) ?? 'your pick'}`)
      }
    }
    return out
  }, [picked, conflicts, genreNames])

  /** A different type means a different form. The searchable category plus the
   * flags belong to the section MAM just replaced. Genres outside the new type
   * go the way MAM's own picker drops them. */
  function chooseMediaType(id: string) {
    const nextMain = MEDIA_TYPES.find((m) => String(m.id) === id)?.mainCat ?? ''
    const keep = new Set(genresFor(Number(id), Number(values.mainType) || 0).map((c) => c.id))
    setValues((s) => ({
      ...s,
      mediaType: id,
      categories: s.categories.filter((c) => keep.has(Number(c))),
      category: nextMain === mainCat ? s.category : '',
      flags: nextMain === mainCat ? s.flags : [],
    }))
    setLocalErrors({})
  }

  function chooseMainType(id: string) {
    const keep = new Set(genresFor(mediaType, Number(id)).map((c) => c.id))
    setValues((s) => ({ ...s, mainType: id, categories: s.categories.filter((c) => keep.has(Number(c))) }))
    setLocalErrors((e) => {
      const next = { ...e }
      delete next.mainType
      return next
    })
  }

  function toggleGenre(cat: Category2, on: boolean) {
    setLocalErrors((e) => {
      const next = { ...e }
      delete next.categories
      return next
    })
    setValues((s) => {
      const set = new Set(s.categories.map(Number))
      if (on) {
        set.add(cat.id)
        // MAM stores which genres only make sense together, so the pair comes
        // along rather than failing later.
        for (const need of cat.requires) set.add(need)
      } else {
        set.delete(cat.id)
        for (const other of [...set]) {
          if (byId.get(other)?.requires.includes(cat.id)) set.delete(other)
        }
      }
      return { ...s, categories: [...set].map(String) }
    })
  }

  function validateDetails(): boolean {
    const errors: Record<string, string> = {}
    if (values.title.trim().length < 2) errors.title = 'A title is needed.'
    if (!values.authors.some((a) => a.trim().length >= MIN_AUTHOR_CHARS)) {
      errors.authors = 'At least one author name, three letters or more.'
    }
    if (!values.language) errors.language = 'Pick the language of what you are asking for.'
    if (!/^https?:\/\/.{5,}/i.test(values.publishedURL.trim())) {
      errors.publishedURL = 'A link starting with http or https that shows it was published.'
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.releaseDate)) errors.releaseDate = 'A release date, as yyyy-mm-dd.'
    setLocalErrors(errors)
    return Object.keys(errors).length === 0
  }

  function validateCategories(): boolean {
    const errors: Record<string, string> = {}
    if (!values.mainType) errors.mainType = 'Fiction or nonfiction.'
    if (values.categories.length === 0) errors.categories = 'Pick at least one genre.'
    if (!values.category) errors.category = 'Pick the searchable category.'
    setLocalErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function toConfirm() {
    if (!form || !validateCategories()) return
    setChecking(true)
    setServerErrors([])
    setAgreeTorrents(false)
    setAgreeRequests(false)
    const snapshot = JSON.stringify(values)
    try {
      const result = await submitDetails(values, form)
      if (!result.ok) {
        confirmedFor.current = null
        setCombined(null)
        setServerErrors(result.errors)
        const first = result.errors.map((e) => ERROR_STEP[e.key]).find((n) => n !== undefined)
        setStep(first ?? 1)
        toast.error('MAM sent the form back', { description: result.errors.map((e) => e.message).join(' ') })
        return
      }
      confirmedFor.current = snapshot
      setCombined({ combined: result.combined, lr: result.lr })
      setStep(3)
      setReached((r) => Math.max(r, 3))
      setDupeTorrents(null)
      setDupeRequests(null)
      const run = ++dupeRun.current
      const fresh = () => dupeRun.current === run
      void checkTorrentDupes(result.combined)
        .then((rows) => { if (fresh()) setDupeTorrents(rows) })
        .catch(() => { if (fresh()) setDupeTorrents([]) })
      void checkRequestDupes(result.combined)
        .then((rows) => { if (fresh()) setDupeRequests(rows) })
        .catch(() => { if (fresh()) setDupeRequests([]) })
    } catch {
      toast.error('MAM did not answer', { description: 'Try the last step again in a moment.' })
    } finally {
      setChecking(false)
    }
  }

  async function runIsbn() {
    if (!form || !values.isbn.trim()) return
    setIsbnBusy(true)
    try {
      const data = await lookupIsbn(values.isbn.trim())
      if (data.success === false || data.totalItems === 0) {
        toast.warning('Nothing found for that number', { description: data.msg ?? 'Filling it in by hand still works.' })
        return
      }
      setValues((s) => applyFill(s, data, form))
      toast.success('Filled in what the lookup knows', { description: 'Check it before you move on.' })
    } catch {
      toast.error('The lookup did not answer')
    } finally {
      setIsbnBusy(false)
    }
  }

  function createRequest() {
    if (!combined) return
    setSending(true)
    const el = document.createElement('form')
    el.method = 'post'
    el.action = '/tor/newRequest.php'
    el.style.display = 'none'
    const add = (name: string, value: string) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      el.appendChild(input)
    }
    add('combined', combined.combined)
    add('lr', combined.lr)
    add('checkTor', 'on')
    add('checkRequests', 'on')
    add('torrentSearchChecked', 'true')
    add('requestSearchChecked', 'true')
    document.body.appendChild(el)
    // The draft stays until the reader drops it. A refused POST leaves them on
    // MAM's own page, where losing everything typed is the worse outcome.
    submitNative(el)
  }

  const canLeaveType = !!values.mediaType && !!form && !formBusy
  const dupesDone = dupeTorrents !== null && dupeRequests !== null
  const ready = agreeTorrents && agreeRequests && dupesDone && !!combined

  function next() {
    if (step === 0) {
      if (!canLeaveType) return
      setStep(1)
      setReached((r) => Math.max(r, 1))
      return
    }
    if (step === 1) {
      if (!validateDetails()) return
      setStep(2)
      setReached((r) => Math.max(r, 2))
      return
    }
    if (step === 2) void toConfirm()
  }

  return (
    <div ref={topRef} className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader
        title="New request"
        sub="Ask the site for something that is not here yet. One request costs one credit."
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 text-12-5">
              <a href={REQUESTS_URL}><ArrowLeft /> All requests</a>
            </Button>
            {intro.credits ? (
            <Badge
              variant="secondary"
              title={intro.extraCredits ? `${intro.extraCredits} credits on top of the monthly ones` : undefined}
              className="h-8 gap-1.5 px-3 text-12 font-normal"
            >
              <Sparkles className="size-3.5 text-brand" />
              <span>{intro.credits}</span>
              {intro.extraCredits && <span className="text-muted-foreground">{' '}plus {intro.extraCredits}</span>}
            </Badge>
            ) : null}
          </span>
        }
      />

      <WizardSteps steps={STEPS} step={step} reached={reached} onStep={setStep} label="Request steps" />

      {draftOffer && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-4 py-2.5 text-12-5">
          <span>An unfinished request is waiting.</span>
          <span className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-12"
              onClick={() => {
                clearRequestDraft()
                setDraftOffer(false)
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="h-7 text-12"
              onClick={() => {
                const draft = readRequestDraft()
                if (draft) {
                  setValues(draft.values)
                  setStep(Math.min(draft.step, 2))
                  setReached(Math.min(draft.step, 2))
                }
                setDraftOffer(false)
              }}
            >
              Pick it up
            </Button>
          </span>
        </div>
      )}

      {serverErrors.length > 0 && (
        <div className="grid gap-1.5 rounded-lg bg-destructive/10 px-4 py-3 text-13">
          <span className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 text-destructive" /> MAM sent the form back
          </span>
          <ul className="grid gap-0.5 pl-6 text-12-5 text-muted-foreground">
            {serverErrors.map((e, i) => <li key={i} className="list-disc">{e.message}</li>)}
          </ul>
        </div>
      )}

      {step === 0 && (
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5">
              <CardTitle>What are you asking for?</CardTitle>
              <p className="pt-0.5 text-12 text-muted-foreground">
                This picks the section your request lands in plus the fields on the next step.
              </p>
            </CardHeader>
            <CardContent className="pb-5">
              <RadioGroup
                value={values.mediaType}
                onValueChange={(v) => chooseMediaType(String(v))}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {MEDIA_TYPES.map((m) => {
                  const Icon = MEDIA_ICONS[m.id] ?? BookOpen
                  return (
                    <FieldLabel key={m.id} htmlFor={`media-${m.id}`} className="text-13 font-normal">
                      <Field orientation="horizontal">
                        <RadioGroupItem value={String(m.id)} id={`media-${m.id}`} />
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <FieldTitle className="text-13">{m.name}</FieldTitle>
                        <span className="ml-auto text-11-5 text-muted-foreground">{MAIN_CAT_NAMES[m.mainCat]}</span>
                      </Field>
                    </FieldLabel>
                  )
                })}
              </RadioGroup>
              {formBusy && (
                <p className="flex items-center gap-2 pt-3 text-12 text-muted-foreground">
                  <Spinner className="size-3.5" /> Loading the form for this type
                </p>
              )}
              {formFailed && (
                <p className="pt-3 text-12 text-destructive">
                  MAM did not hand over the form. Pick the type again to retry.
                </p>
              )}
            </CardContent>
          </Card>

          {intro.rulesHtml && (
            <Card className="gap-0 overflow-hidden py-0">
              <CollapsibleSection
                title="The rules for a request"
                open={rules.isOpen('rules')}
                onOpenChange={(o) => rules.setOpen('rules', o)}
              >
                <CardContent className="py-4">
                  <RichHtml
                    html={intro.rulesHtml}
                    className="text-12-5 leading-normal text-muted-foreground [&_a]:text-brand [&_legend]:hidden"
                  />
                </CardContent>
              </CollapsibleSection>
            </Card>
          )}
        </>
      )}

      {step > 0 && !form && (
        <Card className="gap-0 py-0">
          <CardContent className="grid gap-3 py-6">
            {formBusy ? (
              <p className="flex items-center gap-2 text-13 text-muted-foreground">
                <Spinner className="size-4" /> Loading the form for this type
              </p>
            ) : (
              <>
                <p className="text-13">MAM did not hand over the form for this type.</p>
                <Button variant="outline" size="sm" className="h-8 w-fit text-12-5" onClick={() => setStep(0)}>
                  <ChevronLeft /> Back to the type
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && form && (
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5">
              <CardTitle>Start from a number</CardTitle>
              <p className="pt-0.5 text-12 text-muted-foreground">
                An ISBN or ASIN fills in the title, the author plus the description. Everything stays editable.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={values.isbn}
                  onChange={(e) => setValue('isbn', e.target.value)}
                  placeholder="9780261102217 or ASIN: B002RI9SLQ"
                  aria-label="ISBN or ASIN"
                  className="h-10 min-w-56 flex-1 text-13"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 text-12-5"
                  disabled={isbnBusy || !values.isbn.trim()}
                  onClick={() => void runIsbn()}
                >
                  {isbnBusy ? <><Spinner /> Looking up</> : <><Search /> Autofill</>}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-12" onClick={() => setFastFill(true)}>
                  <ListPlus /> Fast fill names
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-12" onClick={() => setJsonFill(true)}>
                  <FileJson /> Fill from JSON
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5"><CardTitle>About the item</CardTitle></CardHeader>
            <CardContent className="grid gap-6 pb-6">
              <Row
                label="Title"
                required
                error={localErrors.title ?? errorFor(serverErrors, 'TITLE')}
                hint={
                  <>
                    Title and subtitle together, as published.{' '}
                    <a href={TITLE_CASE_URL} target="_blank" rel="noopener" className="text-brand hover:underline">
                      Check the capitals
                    </a>
                  </>
                }
              >
                <Input
                  value={values.title}
                  onChange={(e) => setValue('title', e.target.value)}
                  placeholder="Title: Subtitle"
                  className="h-10 text-13"
                />
              </Row>

              <Row label="Author" required error={localErrors.authors ?? errorFor(serverErrors, 'AUTHOR')} hint="One name per box.">
                <NameRows kind="author" values={values.authors} onValues={(v) => setValue('authors', v)} placeholder="Author name" />
              </Row>

              <Row label="Series" hint="Leave empty when it stands alone. The number goes in its own box.">
                <SeriesRows values={values.series} onValues={(v) => setValue('series', v)} />
              </Row>

              {form.hasNarrator && (
                <Row label="Narrator" hint="Only when you are after a specific reading.">
                  <NameRows kind="narrator" values={values.narrators} onValues={(v) => setValue('narrators', v)} placeholder="Narrator name" />
                </Row>
              )}

              <Row label="Language" required error={localErrors.language ?? errorFor(serverErrors, 'LANGUAGE')}>
                <PickOne
                  options={form.languages}
                  value={values.language}
                  onValue={(v) => setValue('language', v)}
                  placeholder="Pick a language"
                  searchLabel="Search languages…"
                  invalid={!!localErrors.language}
                />
              </Row>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5"><CardTitle>Where it comes from</CardTitle></CardHeader>
            <CardContent className="grid gap-6 pb-6">
              <Row
                label="Proof it exists"
                required
                error={localErrors.publishedURL ?? errorFor(serverErrors, 'PUBLISHEDURL')}
                hint="A page showing it was published, released or broadcast. Nothing unreleased may be asked for."
              >
                <Input
                  type="url"
                  value={values.publishedURL}
                  onChange={(e) => setValue('publishedURL', e.target.value)}
                  placeholder="https://"
                  className="h-10 text-13"
                />
              </Row>

              <Row label="Release date" required error={localErrors.releaseDate ?? errorFor(serverErrors, 'RELEASEDATE')}>
                <Input
                  type="date"
                  value={values.releaseDate}
                  max={form.releaseMax ?? undefined}
                  onChange={(e) => setValue('releaseDate', e.target.value)}
                  className="h-10 w-52 text-13"
                />
              </Row>

              <Row label="Cover image" hint="A link to a cover. The lookup fills this in when it finds one.">
                <Input
                  type="url"
                  value={values.posterURL}
                  onChange={(e) => setValue('posterURL', e.target.value)}
                  placeholder="https://"
                  className="h-10 text-13"
                />
              </Row>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5"><CardTitle>What exactly you want</CardTitle></CardHeader>
            <CardContent className="grid gap-6 pb-6">
              <Row
                label="Request specifics"
                hint="Edition, format wishes plus where it can be found. Asking for a whole series means listing every part."
              >
                <Textarea
                  value={values.description}
                  onChange={(e) => setValue('description', e.target.value)}
                  placeholder="Unabridged, epub preferred, available on Overdrive."
                  className="min-h-32 text-13"
                />
              </Row>

              <Row
                label="Publisher's description"
                hint="Optional. A good summary earns votes plus the uploader can reuse it."
              >
                <BBComposer
                  value={values.bookDescription}
                  onChange={(v) => setValue('bookDescription', v)}
                  className="w-full"
                  minHeightClass="min-h-40"
                  placeholder="Paste the blurb here…"
                />
              </Row>

              {form.flags.length > 0 && (
                <Row label="Flags">
                  <div className="grid gap-2">
                    {form.flags.map((f) => (
                      <FieldLabel key={f.name} className="text-13 font-normal">
                        <Field orientation="horizontal">
                          <Checkbox
                            checked={values.flags.includes(f.name)}
                            onCheckedChange={(v) =>
                              setValue('flags', v === true ? [...values.flags, f.name] : values.flags.filter((n) => n !== f.name))
                            }
                          />
                          <FieldTitle className="text-13">{f.label}</FieldTitle>
                        </Field>
                      </FieldLabel>
                    ))}
                  </div>
                </Row>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {step === 2 && form && (
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5">
              <CardTitle>Fiction or nonfiction</CardTitle>
              <p className="pt-0.5 text-12 text-muted-foreground">This narrows the genre list below.</p>
            </CardHeader>
            <CardContent className="pb-5">
              <RadioGroup
                value={values.mainType}
                onValueChange={(v) => chooseMainType(String(v))}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {(taxonomy?.mainTypes ?? [{ id: 1, name: 'Fiction' }, { id: 2, name: 'Nonfiction' }]).map((t) => (
                  <FieldLabel key={t.id} htmlFor={`main-${t.id}`} className="text-13 font-normal">
                    <Field orientation="horizontal">
                      <RadioGroupItem value={String(t.id)} id={`main-${t.id}`} />
                      <FieldTitle className="text-13">{t.name}</FieldTitle>
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              {(localErrors.mainType || errorFor(serverErrors, 'MAIN_CAT')) && (
                <p className="pt-2 text-12 text-destructive">{localErrors.mainType ?? errorFor(serverErrors, 'MAIN_CAT')}</p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5">
              <CardTitle>Genres</CardTitle>
              <p className="pt-0.5 text-12 text-muted-foreground">
                Pick everything that applies. Only the genres that fit your choices are listed.
              </p>
            </CardHeader>
            <CardContent className="px-0 pb-3">
              {!taxonomy ? (
                <p className="flex items-center gap-2 px-6 text-12 text-muted-foreground">
                  <Spinner className="size-3.5" /> Loading genres
                </p>
              ) : !values.mainType ? (
                <p className="px-6 text-12-5 text-muted-foreground">Pick fiction or nonfiction first.</p>
              ) : genres.length === 0 ? (
                <p className="px-6 text-12-5 text-muted-foreground">MAM lists no genres for this combination.</p>
              ) : (
                <>
                  <FilterSummary
                    className="pb-2.5"
                    chips={values.categories
                      .map((id) => ({ id: Number(id), name: genreNames.get(Number(id)) }))
                      .filter((g): g is { id: number; name: string } => !!g.name)
                      .map((g) => ({
                        key: String(g.id),
                        label: g.name,
                        onRemove: () => {
                          const cat = byId.get(g.id)
                          if (cat) toggleGenre(cat, false)
                        },
                      }))}
                    onClearAll={() => setValue('categories', [])}
                  />
                  <FacetOptions
                    searchable={genres.length > SEARCHABLE_GENRES}
                    searchPlaceholder="Search genres…"
                    emptyText="No genre matches that."
                    maxHeight="max-h-80"
                    columns={2}
                    options={genres.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                      disabled: blocked.has(c.id) && !picked.has(c.id),
                      hint: blocked.get(c.id),
                    }))}
                    selected={values.categories}
                    onToggle={(value) => {
                      const cat = byId.get(Number(value))
                      if (cat) toggleGenre(cat, !picked.has(cat.id))
                    }}
                  />
                </>
              )}
              {(localErrors.categories || errorFor(serverErrors, 'CATEGORIES')) && (
                <p className="px-6 pt-2 text-12 text-destructive">{localErrors.categories ?? errorFor(serverErrors, 'CATEGORIES')}</p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5">
              <CardTitle>Searchable category</CardTitle>
              <p className="pt-0.5 text-12 text-muted-foreground">
                The one MAM's search runs on today. It is a separate list, so it needs its own pick.
              </p>
            </CardHeader>
            <CardContent className="pb-5">
              <PickOne
                options={form.categories}
                value={values.category}
                onValue={(v) => setValue('category', v)}
                placeholder="Pick a category"
                searchLabel="Search categories…"
                invalid={!!localErrors.category}
              />
              {(localErrors.category || errorFor(serverErrors, 'CATEGORY')) && (
                <p className="pt-2 text-12 text-destructive">{localErrors.category ?? errorFor(serverErrors, 'CATEGORY')}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {step === 3 && (
        <>
          {form && (
            <SummaryCard
              values={values}
              form={form}
              taxonomyNames={genreNames}
              onEdit={(s) => setStep(s)}
            />
          )}

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5">
              <CardTitle className="flex items-center gap-2">
                Already on the site?
                {dupeTorrents && dupeTorrents.length > 0 && (
                  <Badge variant="secondary" className="text-11 font-normal">{dupeTorrents.length}</Badge>
                )}
              </CardTitle>
              <p className="pt-0.5 text-12 text-muted-foreground">
                MAM looked for torrents that match what you filled in.
              </p>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {dupeTorrents === null ? (
                <p className="flex items-center gap-2 px-6 py-4 text-12-5 text-muted-foreground">
                  <Spinner className="size-3.5" /> Searching torrents
                </p>
              ) : dupeTorrents.length === 0 ? (
                <p className="px-6 py-4 text-12-5 text-muted-foreground">No torrents look like this one.</p>
              ) : (
                <div className="grid divide-y">
                  {dupeTorrents.map((t) => <DupeTorrentRow key={t.id} t={t} />)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5">
              <CardTitle className="flex items-center gap-2">
                Already requested?
                {dupeRequests && dupeRequests.length > 0 && (
                  <Badge variant="secondary" className="text-11 font-normal">{dupeRequests.length}</Badge>
                )}
              </CardTitle>
              <p className="pt-0.5 text-12 text-muted-foreground">
                Voting on an existing request is free and gets the same result.
              </p>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {dupeRequests === null ? (
                <p className="flex items-center gap-2 px-6 py-4 text-12-5 text-muted-foreground">
                  <Spinner className="size-3.5" /> Searching requests
                </p>
              ) : dupeRequests.length === 0 ? (
                <p className="px-6 py-4 text-12-5 text-muted-foreground">No open request matches this.</p>
              ) : (
                <div className="grid divide-y">
                  {dupeRequests.map((r) => <DupeRequestRow key={r.requestTime} r={r} />)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5"><CardTitle>Before it costs you a credit</CardTitle></CardHeader>
            <CardContent className="grid gap-2.5 pb-5">
              <FieldLabel className="text-13 font-normal">
                <Field orientation="horizontal">
                  <Checkbox checked={agreeTorrents} onCheckedChange={(v) => setAgreeTorrents(v === true)} />
                  <FieldTitle className="text-13">
                    {dupeTorrents && dupeTorrents.length > 0
                      ? 'None of those torrents are what I am after'
                      : 'I searched the torrents and it is not here'}
                  </FieldTitle>
                </Field>
              </FieldLabel>
              <FieldLabel className="text-13 font-normal">
                <Field orientation="horizontal">
                  <Checkbox checked={agreeRequests} onCheckedChange={(v) => setAgreeRequests(v === true)} />
                  <FieldTitle className="text-13">
                    {dupeRequests && dupeRequests.length > 0
                      ? 'None of those requests are what I am after'
                      : 'I searched the requests and it is not here'}
                  </FieldTitle>
                </Field>
              </FieldLabel>
              <p className="pt-1 text-12 text-muted-foreground">
                A duplicate gets deleted and the credit is gone with it.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      <WizardNav step={step} count={STEPS.length} onBack={() => setStep((s) => Math.max(0, s - 1))}>
        {step < 3 ? (
          <Button size="sm" disabled={(step === 0 && !canLeaveType) || (step > 0 && !form) || checking} onClick={next}>
            {checking ? <><Spinner /> Checking</> : <>Next <ChevronRight /></>}
          </Button>
        ) : (
          <Button size="sm" disabled={!ready || sending} onClick={createRequest}>
            {sending ? <><Spinner /> Sending</> : 'Create request'}
          </Button>
        )}
      </WizardNav>

      <p aria-live="polite" className="sr-only">{live}</p>

      <FastFillDialog
        open={fastFill}
        onOpenChange={setFastFill}
        onNames={(kind, names) => {
          if (kind === 'series') {
            const kept = values.series.filter((s) => s.name.trim())
            setValue('series', [...kept, ...names.map((n) => ({ name: n, extra: '' }))])
            return
          }
          const key = kind === 'narrator' ? 'narrators' : 'authors'
          setValue(key, [...values[key].filter(Boolean), ...names])
        }}
      />
      <JsonFillDialog
        open={jsonFill}
        onOpenChange={setJsonFill}
        onData={(data) => {
          if (!form) return
          setValues((s) => applyFill(s, data as Parameters<typeof applyFill>[1], form))
          toast.success('Filled in what the blob names')
        }}
      />
    </div>
  )
}
