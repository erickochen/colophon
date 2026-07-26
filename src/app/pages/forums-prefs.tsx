import { useMemo, useReducer } from 'react'
import { parseForm } from '@/lib/form-mirror'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { MirrorSelect, PrefCard, SettingRow } from '@/app/pages/prefs-bits'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Fields the generic FormMirror mangles: the two image-resize selects collapse
// to identical "Resize" switches and the five alert-word textareas become
// unlabeled BBCode editors. We render those bespoke and hand the rest to
// FormMirror (which owns the Save bar, so it submits the whole #prefForm).
const ALERT_FIELDS = ['me', 'staff', 'siren', 'beep', 'silent'] as const
const REMOVE = new Set([
  'imageResize',
  'sbImageResize',
  'shoutbox[alerts][color]',
  ...ALERT_FIELDS.map((k) => `shoutbox[alerts][${k}]`),
])

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

/** Descriptive label MAM prints on the line above an alert textarea. */
function alertLabel(ta: HTMLElement): string {
  let n: Node | null = ta.previousSibling
  while (n && n.nodeType === Node.TEXT_NODE && !n.textContent?.trim()) n = n.previousSibling
  if (n && (n as Element).tagName === 'BR') n = n.previousSibling
  let s = ''
  while (n && !(n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'BR')) {
    s = (n.textContent ?? '') + s
    n = n.previousSibling
  }
  return clean(s).replace(/:$/, '')
}

interface ForumsData {
  imageResize: HTMLSelectElement | null
  sbImageResize: HTMLSelectElement | null
  alerts: { key: string; label: string; el: HTMLTextAreaElement }[]
  alertColor: HTMLSelectElement | null
  alertHelp: string
}

function extract(form: HTMLElement): ForumsData {
  const alerts = ALERT_FIELDS.map((k) => {
    const el = form.querySelector<HTMLTextAreaElement>(`textarea[name="shoutbox[alerts][${k}]"]`)
    return el ? { key: k, label: alertLabel(el), el } : null
  }).filter((a): a is NonNullable<typeof a> => !!a)

  // General help = the cell text before the first alert textarea, minus that
  // first field's own label line.
  let alertHelp = ''
  const firstCell = alerts[0]?.el.closest('td')
  if (firstCell) {
    let raw = ''
    for (const n of firstCell.childNodes) {
      if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'TEXTAREA') break
      raw += (n.textContent ?? '') + ' '
    }
    raw = clean(raw)
    const firstLabel = alerts[0].label
    const cut = raw.toLowerCase().lastIndexOf(firstLabel.toLowerCase())
    alertHelp = cut > 0 ? clean(raw.slice(0, cut)) : raw
  }

  return {
    imageResize: form.querySelector<HTMLSelectElement>('select[name="imageResize"]'),
    sbImageResize: form.querySelector<HTMLSelectElement>('select[name="sbImageResize"]'),
    alerts,
    alertColor: form.querySelector<HTMLSelectElement>('select[name="shoutbox[alerts][color]"]'),
    alertHelp,
  }
}

export function ForumsPrefsView(props: PageProps) {
  const form = useMemo(
    () =>
      document.querySelector<HTMLFormElement>('#prefForm') ??
      document.querySelector<HTMLFormElement>('#mainBody form[method="post" i]'),
    []
  )
  const [, bump] = useReducer((x: number) => x + 1, 0)

  const bespoke = useMemo(() => (form ? extract(form) : null), [form])
  const other = useMemo(() => {
    if (!form) return null
    const m = parseForm(form, document.querySelector('#mainBody h1'))
    return {
      ...m,
      rows: m.rows
        .map((r) => ({ ...r, controls: r.controls.filter((c) => !REMOVE.has(c.name)) }))
        .filter((r) => r.kind === 'section' || r.controls.length > 0),
    }
  }, [form])

  if (!form || !bespoke || !other) return <LegacyView {...props} />

  const hasImageResize = bespoke.imageResize || bespoke.sbImageResize
  const hasAlerts = bespoke.alerts.length > 0

  return (
    <div className="grid gap-4">
      {hasImageResize && (
        <PrefCard title="Image resizing on mouseover" note="Shrink oversized images to fit or leave them at full size.">
          {bespoke.imageResize && (
            <SettingRow title="Forum images" dense>
              <MirrorSelect el={bespoke.imageResize} onChange={bump} className="min-w-52" />
            </SettingRow>
          )}
          {bespoke.sbImageResize && (
            <SettingRow title="Shoutbox images" dense>
              <MirrorSelect el={bespoke.sbImageResize} onChange={bump} className="min-w-52" />
            </SettingRow>
          )}
        </PrefCard>
      )}

      {hasAlerts && (
        <PrefCard
          title="Shoutbox alert words"
          note="One term per line, matched case-insensitively (as /term/gi). Reload a shoutbox page for changes to take effect. Prefix or suffix a term with \b to anchor it to the start or end of a word; use both for a whole-word match."
        >
          {bespoke.alerts.map((a) => (
            <div key={a.key} className="grid gap-1.5">
              <Label className="text-[13px]">{a.label}</Label>
              <Textarea
                defaultValue={a.el.value}
                spellCheck={false}
                rows={3}
                placeholder="one word or term per line"
                className="min-h-20 font-mono text-[12.5px]"
                onChange={(e) => { a.el.value = e.target.value }}
              />
            </div>
          ))}
          {bespoke.alertColor && (
            <SettingRow title="Highlight color" dense>
              <MirrorSelect el={bespoke.alertColor} onChange={bump} className="min-w-44" />
            </SettingRow>
          )}
        </PrefCard>
      )}

      {other.rows.length > 0 && <FormMirrorView form={other} />}
    </div>
  )
}
