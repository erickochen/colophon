import { useMemo } from 'react'
import { AlertTriangle, Check, CircleCheck, MessageSquarePlus } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Version { label: string; recommended: boolean; notes: string[] }
interface Client { name: string; suffix: string | null; versions: Version[] }
interface ClientsData {
  reminder: string | null
  allowed: Client[]
  discouraged: Client[]
  notesHtml: string | null
  requestHref: string | null
}

function parseClients(container: Element | null): Client[] {
  if (!container) return []
  const clients: Client[] = []
  for (const li of container.querySelectorAll(':scope > ul > li')) {
    const nameEl = li.querySelector(':scope > span.green, :scope > span.userRedsLink')
    const name = nameEl?.textContent?.replace(/\s+/g, ' ').trim()
    if (!name) continue
    // text on the client li itself, after the name (e.g. "- with matching libtorrent version")
    const nameClone = li.cloneNode(true) as HTMLElement
    nameClone.querySelector(':scope > ul')?.remove()
    nameClone.querySelector(':scope > span.green, :scope > span.userRedsLink')?.remove()
    const suffix = nameClone.textContent?.replace(/\s+/g, ' ').replace(/^[\s-]+/, '').trim() || null
    const versions: Version[] = []
    for (const vli of li.querySelectorAll(':scope > ul > li')) {
      const subUl = vli.querySelector(':scope > ul')
      const notes = subUl ? [...subUl.querySelectorAll(':scope > li')].map((x) => x.textContent?.replace(/\s+/g, ' ').trim() ?? '') : []
      const clone = vli.cloneNode(true) as HTMLElement
      clone.querySelector(':scope > ul')?.remove()
      const label = clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (label) versions.push({ label, recommended: vli.classList.contains('listCheck'), notes })
    }
    clients.push({ name, suffix, versions })
  }
  return clients
}

function extract(doc: Document): ClientsData | null {
  const main = doc.querySelector('#mainBody')
  if (!main || !main.querySelector('#allowed_clients, #torClientsHolder')) return null
  return {
    reminder: main.querySelector(':scope > h3')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    allowed: parseClients(main.querySelector('#allowed_clients')),
    discouraged: parseClients(main.querySelector('#permitted_clients')),
    notesHtml: cleanHtml(main.querySelector('#client_notes')),
    requestHref: main.querySelector<HTMLAnchorElement>('#client_version_requests a, a[href="/f/b/121"]')?.getAttribute('href') ?? '/f/b/121',
  }
}

function ClientCard({ c, discouraged }: { c: Client; discouraged?: boolean }) {
  return (
    <Card className={cn('py-0', discouraged && 'bg-warn/5')}>
      <CardContent className="grid gap-2 py-4">
        <div className="flex items-baseline gap-2">
          <span className={cn('font-display text-15 font-semibold', discouraged ? 'text-warn' : 'text-brand')}>{c.name}</span>
          {c.suffix && <span className="text-11-5 text-muted-foreground">{c.suffix}</span>}
        </div>
        <div className="grid gap-1.5">
          {c.versions.map((v, i) => (
            <div key={i} className="grid gap-0.5">
              <div className="flex items-start gap-1.5 text-12-5">
                {v.recommended
                  ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-ok" />
                  : <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', discouraged ? 'bg-warn/60' : 'bg-muted-foreground/40')} />}
                <span className={v.recommended ? 'font-medium' : undefined}>{v.label}</span>
                {v.recommended && <Badge variant="secondary" className="ml-1 h-4 gap-1 bg-ok/15 px-1.5 text-9-5 text-ok"><Check className="size-2.5" /> recommended</Badge>}
              </div>
              {v.notes.map((nt, j) => (
                <p key={j} className="ml-5 text-11-5 leading-normal text-muted-foreground">{nt}</p>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function AllowedClientsView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Allowed clients"
        sub="The BitTorrent clients and versions the tracker accepts."
        action={
          <Button asChild size="sm" variant="outline" className="h-8">
            <a href={data.requestHref ?? '/f/b/121'}><MessageSquarePlus /> Request a version</a>
          </Button>
        }
      />

      {data.reminder && (
        <div className="flex items-start gap-2.5 rounded-lg bg-warn/15 px-4 py-3 text-13">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>{data.reminder}</span>
        </div>
      )}

      {data.allowed.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-15 font-semibold">Allowed</h2>
          <div className="grid items-start gap-3 md:grid-cols-2">
            {data.allowed.map((c) => <ClientCard key={c.name} c={c} />)}
          </div>
        </section>
      )}

      {data.discouraged.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display flex items-center gap-2 text-15 font-semibold">
            <AlertTriangle className="size-4 text-warn" /> Permitted but discouraged
          </h2>
          <div className="grid items-start gap-3 md:grid-cols-2">
            {data.discouraged.map((c) => <ClientCard key={c.name} c={c} discouraged />)}
          </div>
        </section>
      )}

      {data.notesHtml && (
        <section className="grid gap-3">
          <h2 className="font-display text-15 font-semibold">Good to know</h2>
          <Card>
            <CardContent>
              <RichHtml
                html={data.notesHtml}
                className="text-13 [&_a]:text-brand [&_a]:underline [&_li]:ml-4 [&_li]:mb-1.5 [&_ul]:list-disc [&_ul_ul]:mt-1 [&_.error_red]:font-medium [&_.error_red]:text-warn"
              />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
