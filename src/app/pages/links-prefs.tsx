import { useMemo, useState } from 'react'
import { Copy, Link2, Plus, Trash2 } from 'lucide-react'
import { LegacyView } from '@/app/pages/legacy'
import type { PageProps } from '@/app/router'
import { PrefCard } from '@/app/pages/prefs-bits'
import { submitGuarded } from '@/lib/form-submit'
import { findSubmitter } from '@/lib/form-mirror'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'

interface TinyLink {
  code: string
  shortHref: string
  target: string
  note: string
  del: HTMLInputElement | null
}
interface LinksData {
  form: HTMLFormElement
  links: TinyLink[]
  urlEl: HTMLInputElement | null
  noteEl: HTMLInputElement | null
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

function extract(): LinksData | null {
  const form = document.querySelector<HTMLFormElement>('#prefForm')
  if (!form) return null
  // Only the inner list table has a direct thead; the outer layout table
  // matches the same text through a descendant lookup and must lose.
  const table = [...form.querySelectorAll('table')].find((t) => /link\s*id/i.test(t.querySelector(':scope > thead')?.textContent ?? ''))
  const urlEl = form.querySelector<HTMLInputElement>('input[name="url"]')
  const noteEl = form.querySelector<HTMLInputElement>('input[name="note"]')

  // Row shape: the id cell links to the short URL, the second cell holds the
  // target as plain text, then the note and a delete[] checkbox.
  const links: TinyLink[] = []
  for (const tr of table?.querySelectorAll(':scope > tbody > tr') ?? []) {
    if (tr.querySelector('input[name="url"]')) continue
    const cells = [...tr.querySelectorAll(':scope > td')]
    if (cells.length < 2) continue
    const anchor = cells[0]?.querySelector('a')
    links.push({
      code: clean(anchor?.textContent ?? cells[0]?.textContent),
      shortHref: anchor?.getAttribute('href') ?? '',
      target: clean(cells[1]?.textContent),
      note: clean(cells[2]?.textContent),
      del: tr.querySelector<HTMLInputElement>('input[name="delete[]"], input[type="checkbox"]'),
    })
  }
  return { form, links, urlEl, noteEl }
}

function copyLink(href: string) {
  navigator.clipboard.writeText(href).then(
    () => toast.success('Link copied'),
    () => toast.error('Could not copy - select it manually')
  )
}

function LinkRow({ link, onDelete }: { link: TinyLink; onDelete: (link: TinyLink) => void }) {
  const shown = link.shortHref.replace(/^https?:\/\//, '')
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-6 py-3.5">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <a href={link.shortHref} className="truncate font-mono text-[13px] text-brand hover:underline" title={link.shortHref}>
            {shown || link.code}
          </a>
          <button
            type="button"
            onClick={() => copyLink(link.shortHref)}
            aria-label={`Copy ${shown}`}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <div className="truncate pt-0.5 text-[12px] text-muted-foreground" title={link.target}>
          {link.target}
          {link.note && <span> · {link.note}</span>}
        </div>
      </div>
      {link.del && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${shown}`} className="text-muted-foreground hover:text-destructive">
                <Trash2 />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this tiny URL?</AlertDialogTitle>
              <AlertDialogDescription className="break-all">
                {shown} stops working right away. It points to {link.target}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => onDelete(link)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function LinksForm({ d }: { d: LinksData }) {
  const [url, setUrl] = useState(d.urlEl?.value ?? '')
  const [note, setNote] = useState(d.noteEl?.value ?? '')

  // Deleting rides on the same POST as adding, so the add fields are cleared
  // first: a delete should never quietly create the link still sitting there.
  const remove = (link: TinyLink) => {
    if (!link.del) return
    link.del.checked = true
    if (d.urlEl) d.urlEl.value = ''
    if (d.noteEl) d.noteEl.value = ''
    submitGuarded(d.form, findSubmitter(d.form))
  }

  const add = () => {
    if (!url.trim()) {
      toast.warning('Paste the long link first.')
      return
    }
    submitGuarded(d.form, findSubmitter(d.form))
  }

  return (
    <div className="grid gap-4">
      <PrefCard title="Your tiny URLs" contentClassName="gap-0 px-0 py-1">
        {d.links.length > 0 ? (
          d.links.map((l, i) => <LinkRow key={i} link={l} onDelete={remove} />)
        ) : (
          <div className="grid justify-items-center gap-1.5 px-6 py-10 text-center">
            <Link2 className="size-5 text-muted-foreground/60" />
            <p className="text-[13.5px] font-medium">No tiny URLs yet</p>
            <p className="max-w-sm text-[12.5px] leading-normal text-muted-foreground">
              Turn a long link, like a saved search, into a short one you can paste anywhere.
            </p>
          </div>
        )}
      </PrefCard>

      {(d.urlEl || d.noteEl) && (
        <PrefCard title={<span className="flex items-center gap-2"><Plus className="size-4" /> Add a link</span>}>
          <div className="grid gap-1.5">
            <Label className="text-[13px]">Long link</Label>
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
              placeholder="What is this link for?"
              onChange={(e) => { setNote(e.target.value); if (d.noteEl) d.noteEl.value = e.target.value }}
              className="max-w-md"
            />
          </div>
          <div>
            <Button size="sm" onClick={add}>
              <Plus /> Create tiny URL
            </Button>
          </div>
        </PrefCard>
      )}
    </div>
  )
}

export function LinksPrefsView(props: PageProps) {
  const data = useMemo(extract, [])
  if (!data) return <LegacyView {...props} />
  return <LinksForm d={data} />
}
