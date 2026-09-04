import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, HandCoins, Sparkles } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberField } from '@/components/ui/number-field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'

interface Coin { name: string; address: string | null; qr: string | null }
interface Tab { id: string; label: string; html: string | null }
interface DonType { value: string; label: string }

/** MAM's own floor for a donation plus the step its reward table is built on. */
const DONATION_MIN = 5
const DONATION_STEP = 5

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

function extract(doc: Document) {
  const box = doc.querySelector('#donBox')
  if (!box) return null

  // All payment tabs (crypto rendered specially). jQuery-UI adds .ui-tabs-nav to
  // the strip at runtime; fall back to the static server markup (#donBox > ul)
  // when that class isn't wired up yet, so the tabs are never empty.
  const navLinks = box.querySelectorAll('.ui-tabs-nav a')
  const tabs: Tab[] = [...(navLinks.length ? navLinks : box.querySelectorAll(':scope > ul a'))]
    .map((a) => {
      const id = (a.getAttribute('href') ?? '').replace(/.*#/, '')
      const panel = id ? doc.getElementById(id) : null
      return { id, label: clean(a.textContent), html: panel && id !== 'don-crypto' ? cleanHtml(panel) : null }
    })
    .filter((t) => t.id && doc.getElementById(t.id))

  const coins: Coin[] = []
  for (const toggle of doc.querySelectorAll<HTMLElement>('#don-crypto [data-klappe]')) {
    const target = doc.getElementById('k' + (toggle.dataset.klappe ?? ''))
    const name = clean(toggle.textContent)
    if (name) coins.push({ name, address: clean(target?.textContent) || null, qr: target?.querySelector('img')?.getAttribute('src') ?? null })
  }

  const calc = doc.getElementById('userAmount')?.closest('.blockCon') ?? null
  const donTypes: DonType[] = [...(calc?.querySelectorAll<HTMLInputElement>('label.donSel input[name="item_name"]') ?? [])].map((inp) => ({
    value: inp.value,
    label: clean(inp.closest('label')?.querySelector('h4')?.textContent) || inp.value,
  }))
  const notes = [...(calc?.querySelectorAll('b.red, .blockBodyCon > span') ?? [])]
    .map((e) => clean(e.textContent))
    .filter((t) => /expire|running total/i.test(t))

  return {
    intro: cleanHtml(doc.querySelector('#mainBody > .blockCon')),
    multiplier: clean(calc?.querySelector('h2')?.textContent) || null,
    donTypes,
    notes,
    tabs,
    coins,
  }
}

interface DonOption { title: string; lines: { k: string; v: string }[] }

/** Every panel here is also an anchor MAM links to from posts plus from its own
 * menu, so the hash picks the tab the way jQuery-UI does on the classic page. */
function tabFromHash(ids: string[]): string | null {
  const raw = location.hash.replace(/^#/, '')
  let id = raw
  try {
    id = decodeURIComponent(raw)
  } catch {
    // A stray percent is not an escape, so the hash counts as written.
  }
  return ids.includes(id) ? id : null
}

export function DonateView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  const [amount, setAmount] = useState('5')
  const [options, setOptions] = useState<DonOption[]>([])
  const timer = useRef<number>(0)
  const tabIds = useMemo(() => data?.tabs.map((t) => t.id) ?? [], [data])
  const [tab, setTab] = useState(() => tabFromHash(tabIds) ?? tabIds[0])

  // A link to another panel on this page only moves the hash, so the tabs
  // follow it instead of waiting for a reload that never comes.
  useEffect(() => {
    const onHash = () => {
      const hit = tabFromHash(tabIds)
      if (hit) setTab(hit)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [tabIds])

  // Each donation type (Normal / Request Only) has its own reward block that
  // MAM's JS recomputes as the amount changes; mirror both blocks live.
  useEffect(() => {
    const read = () => {
      const calc = document.getElementById('userAmount')?.closest('.blockCon')
      const opts: DonOption[] = [...(calc?.querySelectorAll('label.donSel') ?? [])].map((lab) => {
        const clone = lab.cloneNode(true) as HTMLElement
        const title = clone.querySelector('h4')?.textContent?.replace(/\s+/g, ' ').trim() || 'Donation'
        clone.querySelectorAll('h4, input').forEach((e) => e.remove())
        clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
        clone.querySelectorAll('img').forEach((im) => im.replaceWith('★'))
        const lines = (clone.textContent ?? '')
          .split('\n')
          .map((s) => s.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .map((line) => {
            const i = line.indexOf(':')
            return i > 0 ? { k: line.slice(0, i).trim(), v: line.slice(i + 1).trim() } : { k: line, v: '' }
          })
        return { title, lines }
      })
      setOptions(opts)
    }
    read()
    const obs = new MutationObserver(read)
    const container = document.getElementById('userAmount')?.closest('.blockCon')
    if (container) obs.observe(container, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
  }, [])

  if (!data) return <LegacyView {...props} />

  function syncAmount(v: string) {
    setAmount(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const orig = document.getElementById('userAmount') as HTMLInputElement | null
      if (orig) {
        orig.value = v
        for (const ev of ['input', 'change', 'keyup']) orig.dispatchEvent(new Event(ev, { bubbles: true }))
      }
    }, 250)
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="Donate" sub="Keep the library's lights on" />

      {data.intro && (
        <Card><CardContent><RichHtml html={data.intro} className="[&_.blockHead]:hidden [&_.blockFoot]:hidden text-13" /></CardContent></Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2"><HandCoins className="size-4" /> What a donation gets you</CardTitle>
          {data.multiplier && (
            <Badge className="gap-1 bg-warn/15 text-warn" variant="secondary"><Sparkles className="size-3" /> {data.multiplier.replace(/^Currently, there is a?/i, '').trim()}</Badge>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-2">
            <span className="text-13 text-muted-foreground">Amount €</span>
            <NumberField
              label="Donation amount"
              value={amount === '' ? null : Number(amount)}
              min={DONATION_MIN}
              step={DONATION_STEP}
              onValueChange={(v) => syncAmount(v == null ? '' : String(v))}
            />
            <span className="text-12 text-muted-foreground">minimum {DONATION_MIN}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((o, i) => (
              <div key={o.title + i} className="rounded-xl bg-muted/50 p-4">
                <div className="pb-2 font-display text-14 font-semibold">{o.title}</div>
                <dl className="grid gap-1">
                  {o.lines.map((ln, j) => (
                    <div key={j} className="flex items-baseline justify-between gap-3 text-12-5">
                      <dt className="text-muted-foreground">{ln.k}</dt>
                      {ln.v && <dd className="font-medium tabular-nums">{ln.v}</dd>}
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {data.notes.length > 0 && (
            <p className="text-11-5 leading-relaxed text-muted-foreground">{data.notes.join(' · ')}</p>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {data.tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
        {data.tabs.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            {t.id === 'don-crypto' ? (
              <div className="grid items-start gap-3 md:grid-cols-2">
                {data.coins.map((c) => (
                  <Card key={c.name} className="gap-0 py-0">
                    <CardHeader className="!py-3"><CardTitle>{c.name}</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 px-6 py-4">
                      {c.qr && <img src={c.qr} alt={`${c.name} QR`} className="size-36 rounded-md bg-white p-1.5" />}
                      {c.address && (
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-11-5">{c.address}</code>
                          <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={() => { navigator.clipboard.writeText(c.address ?? ''); toast.success(`${c.name} address copied`) }}>
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {data.coins.length === 0 && <Card className="md:col-span-2"><CardContent className="py-8 text-center text-sm text-muted-foreground">No crypto options found.</CardContent></Card>}
              </div>
            ) : (
              <Card><CardContent>{t.html ? <RichHtml html={t.html} className="text-13-5" /> : <p className="text-sm text-muted-foreground">See the intro above.</p>}</CardContent></Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
