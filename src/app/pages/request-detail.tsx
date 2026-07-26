import { useMemo, useState } from 'react'
import { CheckCheck, Copy, Plus, Search, ThumbsUp } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { RichHtml } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'

interface Row { label: string; html: string; text: string }
interface Action { label: string; index: number }

function extract(doc: Document) {
  const con = doc.querySelector('#torDetMainCon')
  if (!con) return null
  const rows: Row[] = []
  for (const r of con.querySelectorAll(':scope .torDetRow')) {
    // innerText is unreliable on hidden nodes - turn <br> into spaces by hand
    // ("Report<br>issue" -> "Report issue").
    const left = r.querySelector<HTMLElement>('.torDetLeft')
    let label = ''
    if (left) {
      const lc = left.cloneNode(true) as HTMLElement
      lc.querySelectorAll('br').forEach((br) => br.replaceWith(' '))
      label = (lc.textContent ?? '').replace(/\s+/g, ' ').replace(/:$/, '').replace(/\s*:\s*/g, ' ').trim()
    }
    const right = r.querySelector('.torDetRight')
    let html = ''
    if (right) {
      const clone = right.cloneNode(true) as HTMLElement
      // action buttons/fields render as bespoke controls, not inside rows
      clone.querySelectorAll('button, input').forEach((b) => b.remove())
      html = cleanHtml(clone) ?? ''
    }
    const text = right?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (label || html) rows.push({ label, html, text })
  }
  const actions: Action[] = [...doc.querySelectorAll<HTMLElement>('#mainBody input[type="button"], #mainBody button')]
    .map((b, index) => ({ label: (b as HTMLInputElement).value || b.textContent?.trim() || '', index }))
    .filter((a) => a.label)
  const votes = con.textContent?.match(/Vote\(s\):?\s*([\d,]+)/)?.[1] ?? null
  // Fill-flow controls live in the "Filled:" and "Torrent search" rows; their
  // text is empty so the generic row list drops them - surface them here.
  const hasFill = !!con.querySelector('input[name="fillTorrent"]')
  const copyHref = con.querySelector<HTMLAnchorElement>('#votesRight a[href*="clone"]')?.getAttribute('href') ?? null
  const hasSearch = !!con.querySelector('form[action*="browse.php"] input[type="submit"]')
  return { rows, actions, votes, hasFill, copyHref, hasSearch }
}

export function RequestDetailView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  const [fillValue, setFillValue] = useState('')
  if (!data) return <LegacyView {...props} />

  const title = data.rows.find((r) => /^title/i.test(r.label))
  const author = data.rows.find((r) => /^author/i.test(r.label))
  const desc = data.rows.find((r) => /description/i.test(r.label))
  const category = data.rows.find((r) => /^category/i.test(r.label))
  const language = data.rows.find((r) => /^language/i.test(r.label))
  // category/language show as header badges - drop them (and title/author/desc)
  // from the detail list so nothing is duplicated. Vote(s) and the empty
  // fill/search rows are handled by bespoke controls below.
  const rest = data.rows.filter(
    (r) => ![title, author, desc, category, language].includes(r) && !/^vote/i.test(r.label) && r.text.trim().length > 0
  )
  // Category cell = "Audiobooks - Self-Help  Self-Help" (cat name + loose genre
  // link); keep the first segment only for the badge.
  const catLabel = category?.text.split(/\s{2,}/)[0].trim()

  const voteAction = data.actions.find((a) => /vote/i.test(a.label))
  const addAction = data.actions.find((a) => /add torrent/i.test(a.label))
  const doneAction = data.actions.find((a) => /filled/i.test(a.label))

  function act(index: number, label: string) {
    const btn = [...document.querySelectorAll<HTMLElement>('#mainBody input[type="button"], #mainBody button')][index]
    if (!btn) {
      toast.error('Action is not available.')
      return
    }
    btn.click()
    toast.success(label)
    window.setTimeout(() => location.reload(), 1500)
  }

  // Push our value into the original (hidden) fillTorrent input, then click the
  // real "Add torrent to request" button so submitRequestFill() reads it.
  function submitFill() {
    const input = document.querySelector<HTMLInputElement>('#mainBody input[name="fillTorrent"]')
    if (!input || !addAction) {
      toast.error('Fill control is not available.')
      return
    }
    input.value = fillValue.trim()
    input.dispatchEvent(new Event('input', { bubbles: true }))
    act(addAction.index, 'Torrent submitted to the request.')
  }

  // Submit the original search form (target=_blank) so it opens browse results
  // in a new tab with MAM's own pre-filled query params.
  function searchTorrents() {
    const btn = document.querySelector<HTMLInputElement>('#torDetMainCon form[action*="browse.php"] input[type="submit"]')
    if (!btn) {
      toast.error('Torrent search is not available.')
      return
    }
    btn.click()
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Request</Badge>
          {catLabel && <Badge variant="outline">{catLabel}</Badge>}
          {language && <Badge variant="outline">{language.text}</Badge>}
          {data.votes != null && <Badge className="bg-brand-soft text-accent-foreground" variant="secondary">{data.votes} votes</Badge>}
        </div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">
          {title?.text || props.page.title}
        </h1>
        {author && <p className="text-[14.5px] text-muted-foreground">by {author.text}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {voteAction && (
            <Button size="sm" onClick={() => act(voteAction.index, 'Vote registered.')}>
              <ThumbsUp /> Vote for this request
            </Button>
          )}
          {data.copyHref && (
            <Button asChild variant="outline" size="sm">
              <a href={data.copyHref}>
                <Copy /> Copy to Upload Form
              </a>
            </Button>
          )}
        </div>
      </div>

      {desc && (
        <Card>
          <CardContent>
            <h2 className="font-display pb-2 text-[15px] font-semibold">Description</h2>
            <RichHtml html={desc.html} />
          </CardContent>
        </Card>
      )}

      {data.hasFill && (
        <Card>
          <CardContent className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="font-display text-[15px] font-semibold">Fill this request</h2>
              <p className="text-[13px] text-muted-foreground">
                Add a torrent that satisfies this request or mark it filled if one already exists.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={fillValue}
                onChange={(e) => setFillValue(e.target.value)}
                placeholder="Torrent ID"
                aria-label="Torrent to fill this request"
                className="max-w-md"
              />
              {addAction && (
                <Button size="sm" disabled={!fillValue.trim()} onClick={submitFill}>
                  <Plus /> Add torrent to request
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.hasSearch && (
                <Button variant="outline" size="sm" onClick={searchTorrents}>
                  <Search /> Search torrents
                </Button>
              )}
              {doneAction && (
                <Button variant="outline" size="sm" onClick={() => act(doneAction.index, 'Request marked as filled.')}>
                  <CheckCheck /> Mark request filled
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <CardContent className="px-6 py-1">
          {rest.map((r, i) => (
            <div key={i} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-2.5 text-[13.5px]">
              <span className="text-muted-foreground">{r.label || '–'}</span>
              <RichHtml html={r.html} className="text-[13.5px]" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
