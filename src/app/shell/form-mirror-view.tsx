import { createContext, Fragment, useContext, useEffect, useId, useReducer, useRef, useState, type ReactNode } from 'react'
import { Paperclip, RotateCcw, Save } from 'lucide-react'
import { asBooleanRadio, asBooleanSelect, cleanLabel, type MirrorControl, type MirrorForm, type MirrorRow } from '@/lib/form-mirror'
import { registerInvalidAnchor } from '@/lib/invalid-anchor'
import { rewriteFor, STATIC_LABELS } from '@/lib/pref-labels'
import { submitGuarded } from '@/lib/form-submit'
import { BBComposer } from '@/components/bb-composer'
import { RichHtml } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/** Help for settings MAM itself leaves unexplained, keyed by input name. Only
 * add an entry when the page shows no explanation of its own. */
const CURATED_NOTES: Record<string, string> = {
  country: 'Shown as a flag next to your name on your profile.',
  disableWysiwyg: 'Rich text editing for posts and messages. Screen readers may work better with it off.',
}

/** Notes MAM prints that a renamed row makes contradictory or redundant. */
const DROP_NOTES = new Set(['disableWysiwyg', 'acceptpms'])

const SHORT_OPTION = 20

type Layout = 'settings' | 'compose'

/** Id of the row title a widget sits in. Widgets borrow it through
 * `aria-labelledby`, so a switch is announced with the setting it belongs to. */
const RowLabelId = createContext<string | undefined>(undefined)

/** The label a control carries itself: checkbox text or the allow/deny wording
 * of a boolean select. Rows lift this to the left column so every widget can sit
 * on one shared right-hand alignment line. Rewritten names win over MAM's. */
function ownLabel(c: MirrorControl): string | null {
  const rewrite = rewriteFor(c.name)
  if (rewrite) return rewrite.title
  if (c.kind === 'checkbox') return cleanLabel(c.label) || null
  const bool = asBooleanSelect(c)
  return bool?.label || null
}

/** Compact widgets sit right-aligned next to their label; the rest stack below. */
function isCompact(c: MirrorControl): boolean {
  switch (c.kind) {
    case 'checkbox':
    case 'file':
    case 'text':
      return true
    case 'select':
      return true
    case 'radio':
      if (asBooleanRadio(c)) return true
      return c.options.length <= 3 && c.options.every((o) => cleanLabel(o.label).length <= SHORT_OPTION)
    default:
      return false
  }
}

function BoolSwitch({ on, off, onChange, labelledBy, invert }: { on: { el: HTMLInputElement }; off: { el: HTMLInputElement }; onChange: () => void; labelledBy?: string; invert?: boolean }) {
  const [yes, no] = invert ? [off, on] : [on, off]
  return (
    <Switch
      aria-labelledby={labelledBy}
      defaultChecked={yes.el.checked}
      onCheckedChange={(v) => {
        yes.el.checked = v
        no.el.checked = !v
        onChange()
      }}
    />
  )
}

/** Mirrored textarea as a BBCode composer; MAM textareas accept BB codes. */
function MirrorComposer({ c, onChange }: { c: Extract<MirrorControl, { kind: 'textarea' }>; onChange: () => void }) {
  const [val, setVal] = useState(c.el.value)
  return (
    <BBComposer
      value={val}
      onChange={(v) => {
        setVal(v)
        c.el.value = v
        onChange()
      }}
      className="w-full"
      minHeightClass="min-h-48"
      placeholder="Write your post…"
    />
  )
}

/** The interactive widget only - never its own label; rows do all labelling.
 * `wide` is set by compose forms, where fields fill the row instead of sitting
 * at the right edge like a setting. */
function Widget({ c, onChange, wide }: { c: MirrorControl; onChange: () => void; wide?: boolean }) {
  const labelledBy = useContext(RowLabelId)
  const invert = rewriteFor(c.name)?.invert
  switch (c.kind) {
    case 'radio': {
      const bool = asBooleanRadio(c)
      if (bool) return <BoolSwitch on={bool.on} off={bool.off} onChange={onChange} labelledBy={labelledBy} invert={invert} />
      const short = c.options.length <= 3 && c.options.every((o) => cleanLabel(o.label).length <= SHORT_OPTION)
      const value = c.options.find((o) => o.el.checked)?.value
      if (short) {
        return (
          <ToggleGroup
            aria-labelledby={labelledBy}
            type="single"
            variant="outline"
            value={value}
            onValueChange={(v) => {
              if (!v) return
              for (const o of c.options) o.el.checked = o.value === v
              onChange()
            }}
            className="justify-start"
          >
            {c.options.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value} className="px-3 text-[12.5px]">{cleanLabel(o.label)}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        )
      }
      // Descriptive options: the wording IS the explanation, so keep it in full.
      return (
        <RadioGroup
          aria-labelledby={labelledBy}
          value={value}
          onValueChange={(v) => {
            for (const o of c.options) o.el.checked = o.value === v
            onChange()
          }}
          className="gap-2.5"
        >
          {c.options.map((o) => (
            <Label key={o.value} className="flex items-start gap-2.5 text-[13px] font-normal leading-snug">
              <RadioGroupItem value={o.value} className="mt-0.5" />
              <span>{cleanLabel(o.label)}</span>
            </Label>
          ))}
        </RadioGroup>
      )
    }

    case 'checkbox':
      return (
        <Switch
          aria-labelledby={labelledBy}
          defaultChecked={c.el.checked}
          onCheckedChange={(v) => {
            c.el.checked = v === true
            onChange()
          }}
        />
      )

    case 'select': {
      const bool = asBooleanSelect(c)
      if (bool) {
        const [onV, offV] = invert ? [bool.offValue, bool.onValue] : [bool.onValue, bool.offValue]
        return (
          <Switch
            aria-labelledby={labelledBy}
            defaultChecked={c.el.value === onV}
            onCheckedChange={(v) => {
              c.el.value = v ? onV : offV
              c.el.dispatchEvent(new Event('change', { bubbles: true }))
              onChange()
            }}
          />
        )
      }
      const groups = new Map<string | undefined, typeof c.options>()
      for (const o of c.options) {
        const g = groups.get(o.group) ?? []
        g.push(o)
        groups.set(o.group, g)
      }
      return (
        <Select
          defaultValue={c.el.value || undefined}
          onValueChange={(v) => {
            c.el.value = v
            c.el.dispatchEvent(new Event('change', { bubbles: true }))
            onChange()
          }}
        >
          <SelectTrigger aria-labelledby={labelledBy} size="sm" className="w-fit min-w-44 max-w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent className="max-h-72">
            {[...groups].map(([group, options]) => {
              const items = options
                .filter((o) => o.value !== '')
                .map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)
              return group ? (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {items}
                </SelectGroup>
              ) : items
            })}
          </SelectContent>
        </Select>
      )
    }

    case 'text':
      return (
        <Input
          aria-labelledby={labelledBy}
          type={c.inputType === 'text' ? 'text' : c.inputType}
          defaultValue={c.el.value}
          placeholder={c.placeholder ?? (wide || c.el.value ? undefined : 'site default')}
          onChange={(e) => {
            c.el.value = e.target.value
            onChange()
          }}
          className={wide ? 'h-10 w-full' : 'h-8 w-48 text-[13px]'}
        />
      )

    case 'textarea':
      return <MirrorComposer c={c} onChange={onChange} />

    case 'file':
      return (
        <Button type="button" variant="outline" size="sm" onClick={() => c.el.click()}>
          <Paperclip /> {c.el.files?.[0]?.name ?? 'Choose file…'}
        </Button>
      )
  }
}

function Explain({ noteHtml, text }: { noteHtml?: string | null; text?: string | null }) {
  if (!noteHtml && !text) return null
  return (
    <div className="grid gap-1 pt-1">
      {noteHtml && <RichHtml html={noteHtml} className="text-[12px] leading-normal text-muted-foreground [&_a]:text-brand" />}
      {text && <p className="text-[12px] leading-normal text-muted-foreground">{text}</p>}
    </div>
  )
}

/** Standard settings row: label + explanation left, control on the shared right
 * alignment line. Every compact row in every tab uses this exact geometry.
 * The label claims 8rem before the control drops to a line of its own, so a
 * wide control (a segmented group) never pushes the row past its card. */
function SettingRow({
  title, noteHtml, text, children, dense, flush,
}: { title?: string | null; noteHtml?: string | null; text?: string | null; children: ReactNode; dense?: boolean; flush?: boolean }) {
  const labelId = useId()
  const tall = (noteHtml?.length ?? 0) > 120
  return (
    <div
      className={cn(
        'flex w-full flex-wrap gap-x-8 gap-y-3',
        tall ? 'items-start' : 'items-center',
        flush ? 'px-0' : 'px-6',
        dense ? 'py-2.5' : 'py-4'
      )}
    >
      <div className="min-w-0 grow basis-32">
        {title && <div id={labelId} className="text-[13.5px] font-medium leading-snug">{title}</div>}
        <Explain noteHtml={noteHtml} text={text} />
      </div>
      <div className={cn('flex shrink-0 justify-end', tall && 'pt-0.5')}>
        <RowLabelId.Provider value={title ? labelId : undefined}>{children}</RowLabelId.Provider>
      </div>
    </div>
  )
}

/** Wide row: the control needs the full width (radio lists, composer, groups). */
function StackedRow({
  title, noteHtml, text, children,
}: { title?: string | null; noteHtml?: string | null; text?: string | null; children: ReactNode }) {
  const labelId = useId()
  return (
    <div className="grid gap-3 px-6 py-4">
      {(title || noteHtml || text) && (
        <div className="min-w-0">
          {title && <div id={labelId} className="text-[13.5px] font-medium leading-snug">{title}</div>}
          <Explain noteHtml={noteHtml} text={text} />
        </div>
      )}
      <div className="grid w-full justify-items-start gap-2.5">
        <RowLabelId.Provider value={title ? labelId : undefined}>{children}</RowLabelId.Provider>
      </div>
    </div>
  )
}

/** Controls inside a wide row: ones that carry their own label still get the
 * shared label-left / control-right geometry so nothing looks ragged. */
function StackedControls({ row, onChange }: { row: MirrorRow; onChange: () => void }) {
  return (
    <>
      {row.controls.map((c, i) => {
        const own = ownLabel(c)
        return own && isCompact(c) ? (
          <SettingRow key={i} title={own} dense flush>
            <Widget c={c} onChange={onChange} />
          </SettingRow>
        ) : (
          <Widget key={i} c={c} onChange={onChange} />
        )
      })}
    </>
  )
}

/** Two to four related controls under one label ("Receiving gifts"). The row is
 * the container: title on the left, every control on the shared right line with
 * its own short label. A heading would open a group the card never closes. */
function GroupRow({
  row, curated, onChange,
}: { row: MirrorRow; curated: string | null; onChange: () => void }) {
  const base = useId()
  const titleId = `${base}-title`
  return (
    <div role="group" aria-labelledby={titleId} className="flex w-full flex-wrap items-start gap-x-8 gap-y-3 px-6 py-4">
      <div className="min-w-0 grow basis-32">
        <div id={titleId} className="text-[13.5px] font-medium leading-snug">{row.label}</div>
        <Explain noteHtml={row.noteHtml} text={curated} />
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5">
        {row.controls.map((c, i) => {
          const id = `${base}-${i}`
          return (
            <Fragment key={i}>
              <span id={id} className="text-[12.5px] leading-snug text-muted-foreground">{ownLabel(c)}</span>
              <RowLabelId.Provider value={id}>
                <Widget c={c} onChange={onChange} />
              </RowLabelId.Provider>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function FieldRow({ row, onChange, layout }: { row: MirrorRow; onChange: () => void; layout: Layout }) {
  const anchor = useRef<HTMLDivElement>(null)
  const [invalid, setInvalid] = useState<string | null>(null)

  // Every original control this row mirrors points back here, so a rejected
  // validity check has a visible row to highlight.
  useEffect(() => {
    const els = row.controls.flatMap((c) => (c.kind === 'radio' ? c.options.map((o) => o.el) : [c.el]))
    const offs = els.map((el) => registerInvalidAnchor(el, { node: () => anchor.current, mark: setInvalid }))
    return () => offs.forEach((off) => off())
  }, [row])

  const change = () => {
    setInvalid(null)
    onChange()
  }

  if (row.kind === 'static') {
    return (
      <SettingRow title={STATIC_LABELS[row.label] ?? row.label}>
        <span className="text-[13px] text-muted-foreground">{row.noteHtml}</span>
      </SettingRow>
    )
  }

  const firstName = row.controls[0]?.name
  const rewrite = row.controls.length === 1 ? rewriteFor(firstName) : null
  const rowLabel = rewrite?.title ?? row.label
  const noteHtml = firstName && DROP_NOTES.has(firstName) ? null : row.noteHtml
  const curated = !noteHtml ? CURATED_NOTES[firstName ?? ''] ?? null : null

  const body = (() => {
    // Compose forms (new topic, PM, comment) are for writing, not for tweaking:
    // every field gets its label on top and the full width underneath.
    if (layout === 'compose') {
      return (
        <StackedRow title={rowLabel} noteHtml={noteHtml} text={curated}>
          {row.controls.map((c, i) => (
            <div key={i} className="w-full">
              {row.controls.length > 1 && ownLabel(c) && (
                <div className="pb-1 text-[12.5px] text-muted-foreground">{ownLabel(c)}</div>
              )}
              <Widget c={c} onChange={change} wide />
            </div>
          ))}
        </StackedRow>
      )
    }

    // A handful of labelled controls under one row label. Past four they outgrow
    // the right column, so those fall through to the full-width stacked row.
    if (
      row.label &&
      row.controls.length > 1 &&
      row.controls.length <= 4 &&
      row.controls.every(isCompact) &&
      row.controls.every((c) => ownLabel(c))
    ) {
      return <GroupRow row={row} curated={curated} onChange={change} />
    }

    const single = row.controls.length === 1 ? row.controls[0] : null

    if (single && isCompact(single)) {
      const own = ownLabel(single)
      // No row label? The control's own wording becomes the title. Otherwise it
      // reads as the explanation under the title - never next to the switch.
      const title = rowLabel || own
      const text = row.label && own && own !== title ? own : curated
      return (
        <SettingRow title={title} noteHtml={noteHtml} text={text}>
          <Widget c={single} onChange={change} />
        </SettingRow>
      )
    }

    return (
      <StackedRow title={rowLabel} noteHtml={noteHtml} text={curated}>
        <StackedControls row={row} onChange={change} />
      </StackedRow>
    )
  })()

  return (
    <div ref={anchor} className={invalid ? 'rounded-lg ring-2 ring-destructive/45' : undefined}>
      {body}
      {invalid && <p className="-mt-1 px-6 pb-3 text-[12px] leading-normal text-destructive">{invalid}</p>}
    </div>
  )
}

/** The section-grouped cards for a set of mirrored rows, without the save bar.
 * Bespoke views mix these leftovers in with their own cards. */
export function MirrorCards({ rows, layout = 'settings' }: { rows: MirrorRow[]; layout?: Layout }) {
  const [, bump] = useReducer((x: number) => x + 1, 0)

  const groups: { title: string | null; note: string | null; rows: MirrorRow[] }[] = []
  let cur: { title: string | null; note: string | null; rows: MirrorRow[] } = { title: null, note: null, rows: [] }
  for (const row of rows) {
    if (row.kind === 'section') {
      if (cur.rows.length) groups.push(cur)
      cur = { title: row.label, note: row.noteHtml, rows: [] }
    } else {
      cur.rows.push(row)
    }
  }
  if (cur.rows.length) groups.push(cur)

  return (
    <>
      {groups.map((g, gi) => (
        <Card key={gi} className="gap-0 py-0">
          {g.title && (
            <CardHeader className="!py-3.5">
              <CardTitle>{g.title}</CardTitle>
              {g.note && (
                <RichHtml html={g.note} className="pt-0.5 text-[12px] leading-normal text-muted-foreground [&_a]:text-brand" />
              )}
            </CardHeader>
          )}
          <CardContent className="grid px-0 py-1">
            {g.rows.map((row, i) => (
              <div key={i}>
                <FieldRow row={row} onChange={bump} layout={layout} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  )
}

export function FormMirrorView({
  form, submitLabel = 'Save changes', layout = 'settings', extraActions = [], tail,
}: {
  form: MirrorForm
  submitLabel?: string
  layout?: Layout
  /** Buttons the original page offers besides submit (Preview, Check All, ...). */
  extraActions?: { label: string; el: HTMLElement }[]
  /** Bespoke cards that belong to the same form, kept above the save bar. */
  tail?: ReactNode
}) {
  // Revert remounts the cards, so every uncontrolled widget re-reads the
  // freshly reset originals.
  const [rev, bumpRev] = useReducer((x: number) => x + 1, 0)

  return (
    <div className="grid gap-4">
      <MirrorCards key={rev} rows={form.rows} layout={layout} />
      {tail}
      <div className="sticky bottom-4 z-10 mt-1 flex items-center justify-end gap-2 rounded-xl bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            form.el.reset()
            bumpRev()
            toast.info('Changes reverted')
          }}
        >
          <RotateCcw /> Revert
        </Button>
        {extraActions.map((a) => (
          <Button key={a.label} variant="outline" size="sm" onClick={() => a.el.click()}>
            {a.label}
          </Button>
        ))}
        <Button size="sm" onClick={() => submitGuarded(form.el, form.submitter)}>
          <Save /> {submitLabel}
        </Button>
      </div>
    </div>
  )
}
