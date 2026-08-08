import { createContext, useContext, useId, useReducer, useState, type ReactNode } from 'react'
import { Paperclip, RotateCcw, Save } from 'lucide-react'
import { asBooleanRadio, asBooleanSelect, cleanLabel, type MirrorControl, type MirrorForm, type MirrorRow } from '@/lib/form-mirror'
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
  acceptpms: 'Who is allowed to send you private messages.',
  country: 'Shown as a flag next to your name on your profile.',
}

const SHORT_OPTION = 20

type Layout = 'settings' | 'compose'

/** Id of the row title a widget sits in. Widgets borrow it through
 * `aria-labelledby`, so a switch is announced with the setting it belongs to. */
const RowLabelId = createContext<string | undefined>(undefined)

/** The label a control carries itself: checkbox text or the allow/deny wording
 * of a boolean select. Rows lift this to the left column so every widget can sit
 * on one shared right-hand alignment line. */
function ownLabel(c: MirrorControl): string | null {
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

function BoolSwitch({ on, off, onChange, labelledBy }: { on: { el: HTMLInputElement }; off: { el: HTMLInputElement }; onChange: () => void; labelledBy?: string }) {
  return (
    <Switch
      aria-labelledby={labelledBy}
      defaultChecked={on.el.checked}
      onCheckedChange={(v) => {
        on.el.checked = v
        off.el.checked = !v
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
  switch (c.kind) {
    case 'radio': {
      const bool = asBooleanRadio(c)
      if (bool) return <BoolSwitch on={bool.on} off={bool.off} onChange={onChange} labelledBy={labelledBy} />
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
        return (
          <Switch
            aria-labelledby={labelledBy}
            defaultChecked={c.el.value === bool.onValue}
            onCheckedChange={(v) => {
              c.el.value = v ? bool.onValue : bool.offValue
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

function FieldRow({ row, onChange, layout }: { row: MirrorRow; onChange: () => void; layout: Layout }) {
  const groupId = useId()
  const curated = !row.noteHtml ? CURATED_NOTES[row.controls[0]?.name ?? ''] ?? null : null

  // Compose forms (new topic, PM, comment) are for writing, not for tweaking:
  // every field gets its label on top and the full width underneath.
  if (layout === 'compose') {
    return (
      <StackedRow title={row.label} noteHtml={row.noteHtml} text={curated}>
        {row.controls.map((c, i) => (
          <div key={i} className="w-full">
            {row.controls.length > 1 && ownLabel(c) && (
              <div className="pb-1 text-[12.5px] text-muted-foreground">{ownLabel(c)}</div>
            )}
            <Widget c={c} onChange={onChange} wide />
          </div>
        ))}
      </StackedRow>
    )
  }

  // Group of compact controls (e.g. "Receiving gifts"): a caption over one
  // sub-row per control. Every switch lands on the shared right edge, while the
  // caption stays visibly a heading rather than a setting of its own.
  if (row.controls.length > 1 && row.controls.every(isCompact) && row.controls.every((c) => ownLabel(c))) {
    return (
      <div className="py-1" role="group" aria-labelledby={row.label ? groupId : undefined}>
        {(row.label || row.noteHtml || curated) && (
          <div className="px-6 pb-1 pt-3.5">
            {row.label && (
              <div id={groupId} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.label}
              </div>
            )}
            <Explain noteHtml={row.noteHtml} text={curated} />
          </div>
        )}
        {row.controls.map((c, i) => (
          <SettingRow key={i} title={ownLabel(c)} dense>
            <Widget c={c} onChange={onChange} />
          </SettingRow>
        ))}
      </div>
    )
  }

  const single = row.controls.length === 1 ? row.controls[0] : null

  if (single && isCompact(single)) {
    const own = ownLabel(single)
    // No row label? The control's own wording becomes the title. Otherwise it
    // reads as the explanation under the title - never next to the switch.
    const title = row.label || own
    const text = row.label && own && own !== row.label ? own : curated
    return (
      <SettingRow title={title} noteHtml={row.noteHtml} text={text}>
        <Widget c={single} onChange={onChange} />
      </SettingRow>
    )
  }

  return (
    <StackedRow title={row.label} noteHtml={row.noteHtml} text={curated}>
      <StackedControls row={row} onChange={onChange} />
    </StackedRow>
  )
}

export function FormMirrorView({
  form, submitLabel = 'Save changes', layout = 'settings', extraActions = [],
}: {
  form: MirrorForm
  submitLabel?: string
  layout?: Layout
  /** Buttons the original page offers besides submit (Preview, Check All, ...). */
  extraActions?: { label: string; el: HTMLElement }[]
}) {
  const [, bump] = useReducer((x: number) => x + 1, 0)

  // Group settings into one card per section for clear, contained grouping.
  const groups: { title: string | null; rows: MirrorRow[] }[] = []
  let cur: { title: string | null; rows: MirrorRow[] } = { title: null, rows: [] }
  for (const row of form.rows) {
    if (row.kind === 'section') {
      if (cur.rows.length) groups.push(cur)
      cur = { title: row.label, rows: [] }
    } else {
      cur.rows.push(row)
    }
  }
  if (cur.rows.length) groups.push(cur)

  return (
    <div className="grid gap-4">
      {groups.map((g, gi) => (
        <Card key={gi} className="gap-0 py-0">
          {g.title && (
            <CardHeader className="!py-3.5">
              <CardTitle>{g.title}</CardTitle>
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
      <div className="sticky bottom-4 z-10 mt-1 flex items-center justify-end gap-2 rounded-xl bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            form.el.reset()
            bump()
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
        <Button size="sm" onClick={() => form.el.requestSubmit(form.submitter)}>
          <Save /> {submitLabel}
        </Button>
      </div>
    </div>
  )
}
