import { useMemo, useState } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { LegacyView } from '@/app/pages/legacy'
import type { PageProps } from '@/app/router'
import { PrefCard, SaveBar } from '@/app/pages/prefs-bits'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface ExistingLink {
  id: string
  linkText: string
  linkHref: string | null
  note: string
  del: HTMLInputElement | null
  delAnchor: HTMLAnchorElement | null
}
interface LinksData {
  form: HTMLFormElement
  existing: ExistingLink[]
  urlEl: HTMLInputElement | null
  noteEl: HTMLInputElement | null
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

function extract(): LinksData | null {
  const form = document.querySelector<HTMLFormElement>('#prefForm')
  if (!form) return null
  const table = [...form.querySelectorAll('table')].find((t) => /link\s*id/i.test(t.querySelector('thead')?.textContent ?? ''))
  const urlEl = form.querySelector<HTMLInputElement>('input[name="url"]')
  const noteEl = form.querySelector<HTMLInputElement>('input[name="note"]')

  const existing: ExistingLink[] = []
  for (const tr of table?.querySelectorAll(':scope > tbody > tr') ?? []) {
    // The add-new row is the one carrying the url/note inputs; skip it here.
    if (tr.querySelector('input[name="url"]')) continue
    const cells = [...tr.querySelectorAll(':scope > td')]
    if (cells.length < 2) continue
    existing.push({
      id: clean(cells[0]?.textContent),
      linkText: clean(cells[1]?.querySelector('a')?.textContent ?? cells[1]?.textContent),
      linkHref: cells[1]?.querySelector('a')?.getAttribute('href') ?? null,
      note: clean(cells[2]?.textContent),
      del: tr.querySelector<HTMLInputElement>('input[type="checkbox"]'),
      delAnchor: tr.querySelector<HTMLAnchorElement>('a[href*="del" i], a[onclick]'),
    })
  }
  return { form, existing, urlEl, noteEl }
}

function LinksForm({ d }: { d: LinksData }) {
  const [url, setUrl] = useState(d.urlEl?.value ?? '')
  const [note, setNote] = useState(d.noteEl?.value ?? '')

  return (
    <div className="grid gap-4">
      <PrefCard title="Your tiny URLs" contentClassName="gap-0 px-0 py-0">
        {d.existing.length > 0 ? (
          <div className="grid">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 border-b px-6 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>ID</span>
              <span>Link</span>
              <span>Delete</span>
            </div>
            {d.existing.map((l, i) => (
              <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-6 py-3">
                <span className="font-mono text-[12px] text-muted-foreground">{l.id || '-'}</span>
                <span className="min-w-0">
                  {l.linkHref ? (
                    <a href={l.linkHref} className="break-all text-[13px] text-brand hover:underline">{l.linkText || l.linkHref}</a>
                  ) : (
                    <span className="break-all text-[13px]">{l.linkText || '-'}</span>
                  )}
                  {l.note && <span className="block text-[12px] text-muted-foreground">{l.note}</span>}
                </span>
                {l.del ? (
                  <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Switch defaultChecked={l.del.checked} onCheckedChange={(v) => { l.del!.checked = v === true }} />
                  </label>
                ) : l.delAnchor ? (
                  <button type="button" onClick={() => l.delAnchor!.click()} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                ) : (
                  <span className="text-[12px] text-muted-foreground">-</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-6 py-8 text-center text-[13px] text-muted-foreground">You have no tiny URLs yet.</p>
        )}
      </PrefCard>

      {(d.urlEl || d.noteEl) && (
        <PrefCard title={<span className="flex items-center gap-2"><Plus className="size-4" /> Add a link</span>}>
          <div className="grid gap-1.5">
            <Label className="text-[13px]">URL</Label>
            <Input
              type="url"
              value={url}
              placeholder="https://example.com/some/long/path"
              onChange={(e) => { setUrl(e.target.value); if (d.urlEl) d.urlEl.value = e.target.value }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[13px]">Note <span className="font-normal text-muted-foreground">(optional, max 100)</span></Label>
            <Input
              type="text"
              maxLength={100}
              value={note}
              placeholder="note for link"
              onChange={(e) => { setNote(e.target.value); if (d.noteEl) d.noteEl.value = e.target.value }}
              className="max-w-md"
            />
          </div>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Link2 className="size-3.5" /> A tiny URL gives a long link a short, shareable alias.
          </p>
        </PrefCard>
      )}
    </div>
  )
}

export function LinksPrefsView(props: PageProps) {
  const data = useMemo(extract, [])
  const [rev, setRev] = useState(0)
  if (!data) return <LegacyView {...props} />
  return (
    <div className="grid gap-4">
      <LinksForm key={rev} d={data} />
      <SaveBar form={data.form} onAfterRevert={() => setRev((r) => r + 1)} />
    </div>
  )
}
