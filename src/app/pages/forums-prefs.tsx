import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { parseForm, type MirrorControl, type MirrorRow } from '@/lib/form-mirror'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { MirrorSelect, PrefCard, SettingRow } from '@/app/pages/prefs-bits'
import { Badge } from '@/components/ui/badge'

// Three cards for what MAM serves as one flat list: forums, shoutbox and alert
// words. The two image-resize selects share a MAM row, so that row is split and
// each select joins the surface it affects. Alert words render as chips.
const ALERT_FIELDS = [
  { key: 'me', label: 'Spoken “me”' },
  { key: 'staff', label: 'Spoken “staff”' },
  { key: 'siren', label: 'Air-raid siren (very loud)' },
  { key: 'beep', label: 'Generic beep' },
  { key: 'silent', label: 'Highlight only, no sound' },
] as const

const ALERT_NAMES = new Set([
  'shoutbox[alerts][color]',
  ...ALERT_FIELDS.map((f) => `shoutbox[alerts][${f.key}]`),
])

/** MAM's own row order inside each card, keyed by control name. */
const CARDS: { title: string; names: string[] }[] = [
  {
    title: 'Forums',
    names: [
      'topicsperpage', 'forums[topicsFP]', 'postsperpage', 'avatars', 'autoSubscribe',
      'imageResize', 'signature', 'newPostLoc',
    ],
  },
  {
    title: 'Shoutbox',
    names: [
      'shoutbox[show]', 'sbImageResize', 'shoutbox[autocomplete]', 'shoutbox[complete_username]',
      'shoutbox[complete_smiley]', 'shoutbox[order]', 'shoutbox[showCountry]', 'shoutbox[entryLoc]',
      'shoutbox[icons]', 'shoutbox[noMenuHover]',
    ],
  },
]

function selectControl(el: HTMLSelectElement): MirrorControl {
  return {
    kind: 'select',
    name: el.name,
    el,
    options: [...el.options].map((o) => ({ value: o.value, label: o.textContent?.trim() ?? o.value })),
    value: el.value,
  }
}

/** Buckets parsed rows into the three cards, splitting the shared image-resize
 * row. Anything MAM adds later falls through to its own card at the end. */
function bucketRows(rows: MirrorRow[]): MirrorRow[] {
  const singles: MirrorRow[] = []
  for (const row of rows) {
    if (row.kind !== 'field') continue
    if (row.controls.length > 1 && row.controls.some((c) => c.name === 'imageResize')) {
      for (const c of row.controls) {
        if (c.kind !== 'select') continue
        singles.push({ kind: 'field', label: '', noteHtml: null, controls: [selectControl(c.el)] })
      }
      continue
    }
    if (row.controls.some((c) => ALERT_NAMES.has(c.name))) continue
    singles.push(row)
  }

  const used = new Set<MirrorRow>()
  const out: MirrorRow[] = []
  for (const card of CARDS) {
    const members: MirrorRow[] = []
    for (const name of card.names) {
      const row = singles.find((r) => !used.has(r) && r.controls.some((c) => c.name === name))
      if (!row) continue
      used.add(row)
      members.push(row)
    }
    if (!members.length) continue
    out.push({ kind: 'section', label: card.title, noteHtml: null, controls: [] }, ...members)
  }
  const rest = singles.filter((r) => !used.has(r))
  if (rest.length) {
    out.push({ kind: 'section', label: 'Other settings', noteHtml: null, controls: [] }, ...rest)
  }
  return out
}

/** One alert list as removable chips; the original textarea keeps one term per
 * line, exactly what MAM's matcher expects. */
function TermChips({ el, label }: { el: HTMLTextAreaElement; label: string }) {
  const [terms, setTerms] = useState(() => el.value.split(/\r?\n/).map((t) => t.trim()).filter(Boolean))
  const [draft, setDraft] = useState('')

  const write = (next: string[]) => {
    setTerms(next)
    el.value = next.join('\n')
  }
  const commit = () => {
    const term = draft.trim()
    if (term && !terms.includes(term)) write([...terms, term])
    setDraft('')
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium leading-snug">{label}</span>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg bg-muted/70 px-2.5 py-2 shadow-xs transition-[box-shadow] focus-within:ring-[3px] focus-within:ring-ring">
        {terms.map((term) => (
          <Badge key={term} variant="secondary" className="gap-1 pr-1 font-mono text-[11.5px]">
            {term}
            <button
              type="button"
              aria-label={`Remove ${term}`}
              onClick={() => write(terms.filter((t) => t !== term))}
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          spellCheck={false}
          placeholder={terms.length ? undefined : 'Add a word or term…'}
          aria-label={`${label}: add a term`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && draft === '' && terms.length) {
              write(terms.slice(0, -1))
            }
          }}
          className="min-w-28 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  )
}

export function ForumsPrefsView(props: PageProps) {
  const form = useMemo(
    () =>
      document.querySelector<HTMLFormElement>('#prefForm') ??
      document.querySelector<HTMLFormElement>('#mainBody form[method="post" i]'),
    []
  )

  const mirror = useMemo(() => {
    if (!form) return null
    const parsed = parseForm(form, document.querySelector('#mainBody h1'))
    return { ...parsed, rows: bucketRows(parsed.rows) }
  }, [form])

  const alerts = useMemo(() => {
    if (!form) return []
    return ALERT_FIELDS.map((f) => {
      const el = form.querySelector<HTMLTextAreaElement>(`textarea[name="shoutbox[alerts][${f.key}]"]`)
      return el ? { ...f, el } : null
    }).filter((a): a is NonNullable<typeof a> => !!a)
  }, [form])
  const alertColor = useMemo(
    () => form?.querySelector<HTMLSelectElement>('select[name="shoutbox[alerts][color]"]') ?? null,
    [form]
  )

  if (!form || !mirror) return <LegacyView {...props} />

  const alertCard = alerts.length > 0 && (
    <PrefCard
      title="Shoutbox alert words"
      note={
        'Matching shouts get highlighted; every list except the last also plays its sound. Terms match ' +
        'case-insensitively anywhere in a word. Anchor one to a word boundary with \\b at its start or end. ' +
        'Reload a shoutbox page for changes to take effect.'
      }
    >
      {alerts.map((a) => (
        <TermChips key={a.key} el={a.el} label={a.label} />
      ))}
      {alertColor && (
        <SettingRow title="Highlight color" dense>
          <MirrorSelect el={alertColor} className="min-w-44" />
        </SettingRow>
      )}
    </PrefCard>
  )

  return <FormMirrorView form={mirror} tail={alertCard} />
}
