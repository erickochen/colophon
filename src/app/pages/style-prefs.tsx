import { useMemo, useReducer, useState } from 'react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { MirrorSelect, PrefCard, SaveBar, SettingRow } from '@/app/pages/prefs-bits'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// The Style form buries ~120 fields in a jQuery-UI tab widget of colour/order
// matrices. Rebuilt as five real Tabs with pickers and number inputs, all
// writing into the ORIGINAL inputs so the POST is unchanged.

type FieldKind = 'color' | 'number' | 'text'
interface Field { el: HTMLInputElement; label: string; format: string; dark: string; light: string; kind: FieldKind }
type Block =
  | { kind: 'matrix'; heading: string | null; fields: Field[] }
  | { kind: 'settings'; rows: { label: string; cell: HTMLElement }[] }
interface PanelData { id: string; label: string; blocks: Block[] }
interface StyleData {
  form: HTMLFormElement
  stylesheet: HTMLSelectElement | null
  jqueryTheme: HTMLSelectElement | null
  jqueryNote: { text: string; href: string | null } | null
  panels: PanelData[]
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''
const ORDER_PATTERNS = new Set(['^[1-9][0-9]*$', '^[0-9]+$'])

function fieldKind(el: HTMLInputElement, format: string): FieldKind {
  const p = el.pattern || ''
  if (/6 digits hex/i.test(format) || /a-fA-F0-9\]\{6\}/.test(p)) return 'color'
  if (/order number/i.test(format) || ORDER_PATTERNS.has(p)) return 'number'
  return 'text'
}

function isMatrix(table: Element): boolean {
  const firstRow = table.querySelector(':scope > tbody > tr, :scope > tr')
  if (!firstRow) return false
  const ths = [...firstRow.children].filter((c) => c.tagName === 'TH').map((c) => clean(c.textContent))
  return ths.includes('Value') && ths.includes('Format')
}

function parseMatrix(table: HTMLTableElement): Field[] {
  const fields: Field[] = []
  for (const tr of table.querySelectorAll(':scope > tbody > tr, :scope > tr')) {
    const el = tr.querySelector<HTMLInputElement>('input')
    if (!el) continue
    const cells = [...tr.children]
    const format = clean(cells[1]?.textContent)
    fields.push({
      el,
      label: clean(cells[0]?.textContent) || el.name,
      format,
      dark: clean(cells[3]?.textContent),
      light: clean(cells[4]?.textContent),
      kind: fieldKind(el, format),
    })
  }
  return fields
}

function parseSettings(table: HTMLTableElement): { label: string; cell: HTMLElement }[] {
  const rows: { label: string; cell: HTMLElement }[] = []
  for (const tr of table.querySelectorAll(':scope > tbody > tr, :scope > tr')) {
    const cells = [...tr.children].filter((c) => c.tagName === 'TD') as HTMLElement[]
    const ctrlCell = cells.find((c) => c.classList.contains('row1'))
    if (!ctrlCell) continue
    const labelCell = cells.find((c) => c.classList.contains('row2') || c.classList.contains('rowhead'))
    rows.push({ label: clean(labelCell?.textContent), cell: ctrlCell })
  }
  return rows
}

function parsePanel(panel: HTMLElement): Block[] {
  const blocks: Block[] = []
  let heading: string | null = null
  for (const child of [...panel.children]) {
    if (child.tagName === 'H3') { heading = clean(child.textContent); continue }
    if (child.tagName !== 'TABLE') continue
    if (isMatrix(child)) blocks.push({ kind: 'matrix', heading, fields: parseMatrix(child as HTMLTableElement) })
    else blocks.push({ kind: 'settings', rows: parseSettings(child as HTMLTableElement) })
    heading = null
  }
  return blocks
}

function extract(): StyleData | null {
  const form = document.querySelector<HTMLFormElement>('#prefForm')
  if (!form) return null
  const jqueryTheme = form.querySelector<HTMLSelectElement>('select[name="jqueryTheme"]')
  const jqA = jqueryTheme?.closest('td')?.querySelector('a')
  const tabsDiv = form.querySelector('div.tabs')
  const panels: PanelData[] = []
  if (tabsDiv) {
    const labelFor = new Map<string, string>()
    for (const a of tabsDiv.querySelectorAll(':scope > ul li > a')) {
      const href = a.getAttribute('href') ?? ''
      if (href.startsWith('#')) labelFor.set(href.slice(1), clean(a.textContent))
    }
    for (const panel of tabsDiv.querySelectorAll<HTMLElement>(':scope > div[id]')) {
      panels.push({ id: panel.id, label: labelFor.get(panel.id) ?? panel.id.replace(/_/g, ' '), blocks: parsePanel(panel) })
    }
  }
  return {
    form,
    stylesheet: form.querySelector<HTMLSelectElement>('select[name="stylesheet"]'),
    jqueryTheme,
    jqueryNote: jqA ? { text: clean(jqA.textContent), href: jqA.getAttribute('href') } : null,
    panels,
  }
}

// --- helpers shared by the settings-cell renderers ------------------------

function cellNote(cell: HTMLElement): string {
  const c = cell.cloneNode(true) as HTMLElement
  c.querySelectorAll('input, select, textarea, label, table, h3, hr').forEach((n) => n.remove())
  return clean(c.textContent)
}

function labelOf(el: Element): string {
  const lab = el.closest('label')
  if (!lab) return ''
  const c = lab.cloneNode(true) as HTMLElement
  c.querySelectorAll('input, select, textarea').forEach((n) => n.remove())
  return clean(c.textContent).replace(/:$/, '')
}

/** Mirrors an original text/number/url input into a shadcn Input. */
function InputMirror({ el, className }: { el: HTMLInputElement; className?: string }) {
  const [v, setV] = useState(el.value)
  const type = el.type === 'number' ? 'number' : el.type === 'url' ? 'url' : 'text'
  return (
    <Input
      type={type}
      value={v}
      placeholder={el.getAttribute('placeholder') ?? undefined}
      spellCheck={false}
      onChange={(e) => { setV(e.target.value); el.value = e.target.value }}
      className={cn('h-8 text-[13px]', className)}
    />
  )
}

// --- matrix controls -------------------------------------------------------

/** Native colour picker + hex text field, kept in sync. Writes 6-hex WITHOUT a
 * leading '#' back to the original (empty means "use the theme default"). */
function ColorControl({ el, dark }: { el: HTMLInputElement; dark: string }) {
  const [hex, setHex] = useState((el.value || '').replace(/^#/, ''))
  const valid = /^[0-9a-fA-F]{6}$/.test(hex)
  const shown = valid ? `#${hex}` : /^[0-9a-fA-F]{6}$/.test(dark) ? `#${dark}` : '#888888'
  const write = (raw: string) => {
    const c = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
    setHex(c)
    el.value = c
  }
  return (
    <div className="flex items-center gap-2">
      <span className="relative size-7 shrink-0 overflow-hidden rounded-md shadow-xs" style={{ backgroundColor: shown }}>
        <input type="color" value={shown} onChange={(e) => write(e.target.value)} aria-label="Pick color" className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </span>
      <div className="flex items-center rounded-md bg-muted/70 shadow-xs">
        <span className="pl-2.5 font-mono text-[13px] text-muted-foreground">#</span>
        <input
          value={hex}
          onChange={(e) => write(e.target.value)}
          placeholder={dark}
          spellCheck={false}
          maxLength={6}
          className="w-[7ch] bg-transparent py-1.5 pr-2.5 pl-0.5 font-mono text-[13px] uppercase outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  )
}

function fieldHint(f: Field): string {
  if (f.kind === 'color') {
    const parts: string[] = []
    if (f.dark) parts.push(`Dark ${f.dark}`)
    if (f.light && f.light !== f.dark) parts.push(`Light ${f.light}`)
    return parts.join(' · ') || '6-digit hex'
  }
  const def = f.dark && f.dark === f.light && f.dark !== '0' ? ` · default ${f.dark}` : ''
  return f.format + def
}

function MatrixCard({ heading, fields }: { heading: string | null; fields: Field[] }) {
  return (
    <PrefCard title={heading ?? undefined} contentClassName="gap-0 px-0 py-1">
      {fields.map((f, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 px-6 py-2.5">
          <div className="min-w-0">
            <div className="text-[13px] font-medium leading-snug">{f.label}</div>
            <div className="text-[11.5px] leading-normal text-muted-foreground">{fieldHint(f)}</div>
          </div>
          <div className="flex shrink-0 justify-end">
            {f.kind === 'color'
              ? <ColorControl el={f.el} dark={f.dark} />
              : <InputMirror el={f.el} className={f.kind === 'number' ? 'w-20 text-center font-mono' : 'w-56 font-mono text-[12.5px]'} />}
          </div>
        </div>
      ))}
    </PrefCard>
  )
}

// --- settings cell renderers ----------------------------------------------

function CodeEditor({ el, note }: { el: HTMLTextAreaElement; note: string }) {
  const [v, setV] = useState(el.value)
  return (
    <div className="grid gap-2">
      {note && <p className="text-[12px] leading-normal text-muted-foreground">{note}</p>}
      <textarea
        value={v}
        spellCheck={false}
        maxLength={65000}
        placeholder="/* your custom CSS */"
        onChange={(e) => { setV(e.target.value); el.value = e.target.value }}
        className="min-h-64 w-full resize-y rounded-lg bg-muted/70 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>
  )
}

function TopMenuBlock({ cell, onChange }: { cell: HTMLElement; onChange: () => void }) {
  const parsed = useMemo(() => {
    let note = ''
    for (const n of cell.childNodes) {
      if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'TABLE') break
      note += (n.textContent ?? '') + ' '
    }
    const menuTable = cell.querySelector('table')
    const items: { cb: HTMLInputElement; order: HTMLInputElement | null; label: string }[] = []
    for (const tr of menuTable?.querySelectorAll(':scope > tbody > tr') ?? []) {
      const cb = tr.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (!cb) continue
      items.push({ cb, order: tr.querySelector<HTMLInputElement>('input[type="number"]'), label: clean(cb.closest('td')?.textContent) })
    }
    return {
      note: clean(note),
      items,
      url: cell.querySelector<HTMLInputElement>('input[name="newUrl"]'),
      display: cell.querySelector<HTMLInputElement>('input[name="newDisplay"]'),
      newOrder: cell.querySelector<HTMLInputElement>('input[name="newDisplayOrder"]'),
      empty: /no custom links added/i.test(cell.textContent ?? ''),
    }
  }, [cell])

  return (
    <div className="grid gap-4">
      {parsed.note && <p className="text-[12px] leading-normal text-muted-foreground">{parsed.note}</p>}
      <div className="grid">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Item</span>
          <span className="w-16 text-center">Order</span>
          <span>Show</span>
        </div>
        {parsed.items.map((it, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 py-1.5">
            <span className="text-[13px]">{it.label}</span>
            {it.order ? <InputMirror el={it.order} className="w-16 text-center" /> : <span className="w-16" />}
            <Switch defaultChecked={it.cb.checked} onCheckedChange={(v) => { it.cb.checked = v === true; onChange() }} />
          </div>
        ))}
      </div>
      {(parsed.url || parsed.display) && (
        <div className="grid gap-3">
          <div className="h-px bg-border" />
          <div className="text-[13px] font-medium">Custom link above the menu bar</div>
          {parsed.empty && <p className="text-[12px] text-muted-foreground">No custom links added yet.</p>}
          {parsed.url && (
            <div className="grid gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">Site URL</span>
              <InputMirror el={parsed.url} className="h-9" />
            </div>
          )}
          {parsed.display && (
            <div className="grid gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">Display text (replaces the URL)</span>
              <InputMirror el={parsed.display} className="h-9 max-w-xs" />
            </div>
          )}
          {parsed.newOrder && (
            <SettingRow title="Order" dense>
              <InputMirror el={parsed.newOrder} className="w-16 text-center" />
            </SettingRow>
          )}
        </div>
      )}
    </div>
  )
}

type Ctl =
  | { kind: 'radio'; options: { el: HTMLInputElement; label: string }[] }
  | { kind: 'checkbox'; el: HTMLInputElement; label: string }
  | { kind: 'select'; el: HTMLSelectElement; label: string }
  | { kind: 'text'; el: HTMLInputElement; label: string }

function parseControls(cell: HTMLElement): Ctl[] {
  const out: Ctl[] = []
  const seenRadio = new Set<string>()
  for (const el of cell.querySelectorAll<HTMLElement>('input, select')) {
    if (el instanceof HTMLInputElement) {
      const t = el.type
      if (['hidden', 'submit', 'reset', 'button', 'image'].includes(t)) continue
      if (t === 'radio') {
        if (seenRadio.has(el.name)) continue
        seenRadio.add(el.name)
        const options = [...cell.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`)]
          .map((r) => ({ el: r, label: labelOf(r) || r.value }))
        out.push({ kind: 'radio', options })
        continue
      }
      if (t === 'checkbox') { out.push({ kind: 'checkbox', el, label: labelOf(el) }); continue }
      out.push({ kind: 'text', el, label: labelOf(el) })
    } else if (el instanceof HTMLSelectElement) {
      out.push({ kind: 'select', el, label: labelOf(el) })
    }
  }
  return out
}

function GenericControl({ item, onChange }: { item: Ctl; onChange: () => void }) {
  switch (item.kind) {
    case 'radio': {
      const value = item.options.find((o) => o.el.checked)?.el.value
      return (
        <ToggleGroup
          type="single"
          variant="outline"
          value={value}
          className="justify-start"
          onValueChange={(v) => {
            if (!v) return
            for (const o of item.options) o.el.checked = o.el.value === v
            onChange()
          }}
        >
          {item.options.map((o) => (
            <ToggleGroupItem key={o.el.value} value={o.el.value} className="px-3 text-[12.5px]">{o.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      )
    }
    case 'checkbox': {
      const sw = <Switch defaultChecked={item.el.checked} onCheckedChange={(v) => { item.el.checked = v === true; onChange() }} />
      return item.label ? <SettingRow title={item.label} dense>{sw}</SettingRow> : sw
    }
    case 'select':
      return item.label
        ? <SettingRow title={item.label} dense><MirrorSelect el={item.el} onChange={onChange} className="min-w-44" /></SettingRow>
        : <div className="flex"><MirrorSelect el={item.el} onChange={onChange} className="min-w-52" /></div>
    case 'text':
      return item.label
        ? <SettingRow title={item.label} dense><InputMirror el={item.el} className="w-40" /></SettingRow>
        : <div className="flex"><InputMirror el={item.el} className="w-40" /></div>
  }
}

function GenericCell({ cell, note, onChange }: { cell: HTMLElement; note: string; onChange: () => void }) {
  const items = useMemo(() => parseControls(cell), [cell])
  return (
    <div className="grid gap-3">
      {note && <p className="text-[12px] leading-normal text-muted-foreground">{note}</p>}
      {items.map((it, i) => <GenericControl key={i} item={it} onChange={onChange} />)}
    </div>
  )
}

function SettingsCell({ cell, onChange }: { cell: HTMLElement; onChange: () => void }) {
  const userStyle = cell.querySelector<HTMLTextAreaElement>('textarea[name="userStyle"]')
  if (userStyle) return <CodeEditor el={userStyle} note={cellNote(cell)} />
  if (cell.querySelector('input[name="topMenu[]"]')) return <TopMenuBlock cell={cell} onChange={onChange} />
  return <GenericCell cell={cell} note={cellNote(cell)} onChange={onChange} />
}

function PanelView({ panel }: { panel: PanelData }) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  return (
    <div className="grid gap-4">
      {panel.blocks.map((b, i) =>
        b.kind === 'matrix' ? (
          <MatrixCard key={i} heading={b.heading} fields={b.fields} />
        ) : (
          b.rows.map((r, j) => (
            <PrefCard key={`${i}-${j}`} title={r.label || undefined}>
              <SettingsCell cell={r.cell} onChange={bump} />
            </PrefCard>
          ))
        )
      )}
    </div>
  )
}

export function StylePrefsView(props: PageProps) {
  const data = useMemo(extract, [])
  const [rev, setRev] = useState(0)
  if (!data) return <LegacyView {...props} />

  return (
    <div className="grid gap-4">
      <div key={rev} className="grid gap-4">
        {(data.stylesheet || data.jqueryTheme) && (
          <PrefCard title="Theme">
            {data.stylesheet && (
              <SettingRow title="Site style" dense>
                <MirrorSelect el={data.stylesheet} className="min-w-52" />
              </SettingRow>
            )}
            {data.jqueryTheme && (
              <SettingRow
                title="jQuery UI theme"
                note={
                  data.jqueryNote && (
                    <>
                      Preview at{' '}
                      <a href={data.jqueryNote.href ?? '#'} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        the jQuery UI theme roller
                      </a>
                      .
                    </>
                  )
                }
                dense
              >
                <MirrorSelect el={data.jqueryTheme} className="min-w-52" />
              </SettingRow>
            )}
          </PrefCard>
        )}

        {data.panels.length > 0 && (
          <Tabs defaultValue={data.panels[0].id}>
            <TabsList className="flex-wrap">
              {data.panels.map((p) => (
                <TabsTrigger key={p.id} value={p.id}>{p.label}</TabsTrigger>
              ))}
            </TabsList>
            {data.panels.map((p) => (
              <TabsContent key={p.id} value={p.id} className="grid gap-4 pt-1">
                <PanelView panel={p} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
      <SaveBar form={data.form} onAfterRevert={() => setRev((r) => r + 1)} />
    </div>
  )
}
