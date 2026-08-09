import { useMemo, useReducer, useState, type ReactElement } from 'react'
import {
  AlertTriangle, ChevronRight, Globe, KeyRound, Laptop, LogOut, MonitorSmartphone,
  Plane, Plus, Server, Settings2, Trash2,
} from 'lucide-react'
import { LegacyView } from '@/app/pages/legacy'
import type { PageProps } from '@/app/router'
import { relTime, utcTitle } from '@/lib/format'
import { allowNavigation } from '@/lib/form-dirty'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/** What the ms button carries in data-secdat. */
interface ManageData {
  api?: boolean
  note?: string
  asn: boolean | number[]
  asn_array?: number[]
  ip?: string
  dynSeed: boolean
}

interface Session {
  ssid: string
  created: string | null
  ip: string | null
  browser: string | null
  ua: string | null
  os: string | null
  lastAccess: string | null
  note: string | null
  info: string[]
  manage: ManageData | null
  canLogout: boolean
  canRemove: boolean
  canTravel: boolean
  canViewCookie: boolean
  isApi: boolean
}
interface SecData {
  warning: string | null
  form: HTMLFormElement
  secact: HTMLInputElement | null
  secdat: HTMLInputElement | null
  sessions: Session[]
  create: {
    ipEl: HTMLInputElement
    asnRadios: HTMLInputElement[]
    dynRadios: HTMLInputElement[]
    labelEl: HTMLTextAreaElement | null
    help: { ip: string | null; asn: string | null; dyn: string | null }
  } | null
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() || null

function extract(doc: Document): SecData | null {
  const main = doc.querySelector('#mainBody')
  const form = main?.querySelector<HTMLFormElement>('#prefForm')
  const table = main?.querySelector('table.sessions')
  if (!main || !form || !table) return null

  const sessions: Session[] = []
  for (const tr of table.querySelectorAll<HTMLElement>('tr[data-ssid]')) {
    const tds = [...tr.querySelectorAll(':scope > td')]
    if (tds.length < 7) continue
    const has = (act: string) => !!tr.querySelector(`input[data-secact="${act}"]`)
    const msBtn = tr.querySelector<HTMLInputElement>('input[data-secact="ms"]')
    let manage: ManageData | null = null
    if (msBtn?.dataset.secdat) {
      try {
        manage = JSON.parse(msBtn.dataset.secdat) as ManageData
      } catch {
        manage = null
      }
    }
    const actionCell = tds[6]
    const note = clean(actionCell?.querySelector('.note')?.textContent?.replace(/Label\/note:/i, ''))
    const info = [...(actionCell?.querySelectorAll(':scope > div') ?? [])]
      .filter((d) => !d.querySelector('input') && !d.classList.contains('note'))
      .map((d) => clean(d.textContent))
      .filter((t): t is string => !!t)
    const browserTd = tds[2]
    sessions.push({
      ssid: tr.dataset.ssid ?? '',
      created: clean(tds[0]?.textContent),
      ip: clean(tds[1]?.childNodes[0]?.textContent),
      browser: clean(browserTd?.textContent),
      ua: browserTd?.getAttribute('title') ?? null,
      os: clean(tds[3]?.textContent),
      lastAccess: clean(tds[4]?.textContent),
      note,
      info,
      manage,
      canLogout: has('logout'),
      canRemove: has('rs'),
      canTravel: has('ait'),
      canViewCookie: has('vsc'),
      isApi: info.some((t) => /API/i.test(t)),
    })
  }

  const ipEl = form.querySelector<HTMLInputElement>('input[name="ip"]')
  let create: SecData['create'] = null
  if (ipEl) {
    const radios = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)]
    const helpFor = (el: Element | null) => clean(el?.closest('tr')?.querySelector(':scope > td:last-child')?.textContent)
    const asnRadios = radios('asn')
    const dynRadios = radios('dynSeed')
    create = {
      ipEl,
      asnRadios,
      dynRadios,
      labelEl: form.querySelector<HTMLTextAreaElement>('textarea[name="label"]'),
      help: { ip: helpFor(ipEl), asn: helpFor(asnRadios[0] ?? null), dyn: helpFor(dynRadios[0] ?? null) },
    }
  }

  return {
    warning: clean(main.querySelector('.error_red')?.textContent),
    form,
    secact: form.querySelector<HTMLInputElement>('#secact'),
    secdat: form.querySelector<HTMLInputElement>('#secdat'),
    sessions,
    create,
  }
}

function deviceIcon(s: Session) {
  if (s.isApi || /prowlarr|sonarr|radarr|curl|api/i.test(s.ua ?? '')) return Server
  if (/mobile|iphone|android/i.test(s.ua ?? '')) return MonitorSmartphone
  return Laptop
}

/** One line that names the session in every confirmation. */
function describe(s: Session): string {
  const parts = [s.browser ?? 'Unknown client']
  if (s.os && s.os !== 'unknown') parts[0] += ` on ${s.os}`
  if (s.ip) parts.push(s.ip)
  if (s.note) parts.push(`“${s.note}”`)
  return parts.join(' · ')
}

/** Replays prefSecHandleCallback: the hidden secact/secdat pair plus a native
 * submit. requestSubmit would trip over the empty required IP of the create
 * form, so the guard is told this navigation is deliberate. */
function postAction(d: SecData, action: string, ssid: string) {
  if (!d.secact || !d.secdat) return
  d.secact.value = action
  d.secdat.value = ssid
  allowNavigation(d.form)
  d.form.submit()
}

/** POSTs a session update the way MAM's own dialog form does. */
function postUpdate(ssid: string, fields: Record<string, string>) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = window.location.href
  form.enctype = 'application/x-www-form-urlencoded'
  const add = (name: string, value: string) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  for (const [name, value] of Object.entries(fields)) add(name, value)
  add('secact', 'update')
  add('data', ssid)
  document.body.appendChild(form)
  form.submit()
}

function ConfirmAction({
  trigger, title, description, session, actionLabel, destructive, onConfirm,
}: {
  trigger: ReactElement
  title: string
  description: string
  session: Session
  actionLabel: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block font-medium text-foreground">{describe(session)}</span>
            <span className="block pt-1.5">{description}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The manage panel MAM hides behind the "Hi" dialog, inline in the card. */
function ManagePanel({ s, m }: { s: Session; m: ManageData }) {
  const asnLocked = m.asn === true || Array.isArray(m.asn)
  const asnList: number[] = Array.isArray(m.asn_array) ? m.asn_array : Array.isArray(m.asn) ? m.asn : []
  const [toAsn, setToAsn] = useState(false)
  const [addIp, setAddIp] = useState('')
  const [dynSeed, setDynSeed] = useState(m.dynSeed === true)

  const changed = toAsn || addIp.trim() !== '' || dynSeed !== (m.dynSeed === true)

  const update = () => {
    if (asnLocked && addIp.trim() && !IPV4.test(addIp.trim())) {
      toast.warning('Enter a valid IPv4 address first (like 10.2.3.4).')
      return
    }
    const fields: Record<string, string> = { dynSeed: dynSeed ? 'true' : 'false' }
    if (asnLocked) fields.ip = addIp.trim()
    else if (toAsn) fields.ip2asn = 'true'
    postUpdate(s.ssid, fields)
  }

  return (
    <div className="grid gap-4 rounded-lg bg-muted/40 px-4 py-3.5">
      {asnLocked ? (
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-medium">Locked to these providers</span>
          <div className="flex flex-wrap gap-1.5">
            {asnList.length > 0 ? (
              asnList.map((asn) => (
                <Badge key={asn} variant="secondary" className="font-mono text-[11px]">AS{asn}</Badge>
              ))
            ) : (
              <span className="text-[12px] text-muted-foreground">Provider list unavailable</span>
            )}
          </div>
          <Label className="pt-2 text-[12.5px]">Add another provider via an IP address</Label>
          <Input
            value={addIp}
            onChange={(e) => setAddIp(e.target.value)}
            placeholder="10.2.3.4"
            className="h-8 max-w-48 font-mono text-[13px]"
          />
          <p className="text-[11.5px] leading-normal text-muted-foreground">
            The provider that owns this address is added to the session.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium">Switch to ASN lock</div>
            <p className="pt-0.5 text-[11.5px] leading-normal text-muted-foreground">
              Now locked to {m.ip ?? s.ip ?? 'one address'}. An ASN lock follows the whole provider instead.
            </p>
          </div>
          <Switch checked={toAsn} onCheckedChange={(v) => setToAsn(v === true)} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium">May set the dynamic seedbox IP</div>
          <p className="pt-0.5 text-[11.5px] leading-normal text-muted-foreground">
            Lets this session move your seedbox to a new address through the API.
          </p>
        </div>
        <Switch checked={dynSeed} onCheckedChange={(v) => setDynSeed(v === true)} />
      </div>

      <div>
        <Button size="sm" disabled={!changed} onClick={update}>
          Update session
        </Button>
      </div>
    </div>
  )
}

function SessionCard({ s, d }: { s: Session; d: SecData }) {
  const Icon = deviceIcon(s)
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-start gap-3.5 px-6 py-4">
      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[14px] font-semibold" title={s.ua ?? undefined}>{s.browser}</span>
          {s.os && s.os !== 'unknown' && <span className="text-[12.5px] text-muted-foreground">on {s.os}</span>}
          {s.canLogout && <Badge className="bg-ok/15 text-[10.5px] text-ok" variant="secondary">This session</Badge>}
          {s.isApi && <Badge variant="secondary" className="text-[10.5px]">API</Badge>}
          {s.info.filter((t) => !/^API/i.test(t)).map((t) => (
            <Badge key={t} variant="outline" className="text-[10.5px] text-muted-foreground">{t}</Badge>
          ))}
          {s.note && <Badge className="bg-brand-soft text-[10.5px] text-accent-foreground" variant="secondary">{s.note}</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1 text-[12px] text-muted-foreground">
          {s.ip && <span className="flex items-center gap-1"><Globe className="size-3" /> {s.ip}</span>}
          {s.created && <span title={utcTitle(s.created)}>Signed in {relTime(s.created)}</span>}
          {s.lastAccess && <span title={utcTitle(s.lastAccess)}>Active {relTime(s.lastAccess)}</span>}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {s.canLogout && (
            <ConfirmAction
              trigger={<Button size="sm" variant="outline" className="h-7 text-[12px] text-destructive hover:text-destructive"><LogOut /> Log out</Button>}
              title="Log out of this session?"
              description="This is the session you are using right now, so you land back on the sign-in page."
              session={s}
              actionLabel="Log out"
              destructive
              onConfirm={() => postAction(d, 'logout', s.ssid)}
            />
          )}
          {s.canRemove && (
            <ConfirmAction
              trigger={<Button size="sm" variant="outline" className="h-7 text-[12px] text-destructive hover:text-destructive"><Trash2 /> Remove</Button>}
              title="Remove this session?"
              description="That system or browser is signed out right away and has to sign in again."
              session={s}
              actionLabel="Remove session"
              destructive
              onConfirm={() => postAction(d, 'rs', s.ssid)}
            />
          )}
          {s.canTravel && (
            <ConfirmAction
              trigger={<Button size="sm" variant="outline" className="h-7 text-[12px]"><Plane /> Allow ISP travel</Button>}
              title="Let this session travel across ISPs?"
              description="The session then survives provider changes, like a VPN going on or off. That makes it less locked down."
              session={s}
              actionLabel="Allow travel"
              onConfirm={() => postAction(d, 'ait', s.ssid)}
            />
          )}
          {s.canViewCookie && (
            <ConfirmAction
              trigger={<Button size="sm" variant="outline" className="h-7 text-[12px]"><KeyRound /> View cookie</Button>}
              title="Show the session cookie?"
              description="The page reloads and prints the cookie this session uses."
              session={s}
              actionLabel="Show cookie"
              onConfirm={() => postAction(d, 'vsc', s.ssid)}
            />
          )}
        </div>

        {s.manage && (
          <Collapsible open={open} onOpenChange={setOpen} className="mt-2.5">
            <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none">
              <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
              <Settings2 className="size-3.5" /> Manage session
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ManagePanel s={s} m={s.manage} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  )
}

function CreateSession({ c, form }: { c: NonNullable<SecData['create']>; form: HTMLFormElement }) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [ip, setIp] = useState('')
  const asnLocked = c.asnRadios.find((r) => r.value === 'yes')?.checked ?? false
  const dynOn = c.dynRadios.find((r) => r.value === 'yes')?.checked ?? false

  function submit() {
    if (!IPV4.test(ip.trim())) {
      toast.warning('Enter a valid IPv4 address first (like 10.2.3.4).')
      return
    }
    c.ipEl.value = ip.trim()
    form.requestSubmit()
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3.5">
        <CardTitle className="flex items-center gap-2"><Plus className="size-4" /> Create a session</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 px-6 py-5">
        <p className="text-[12.5px] leading-normal text-muted-foreground">
          Sessions let scripts and seedboxes download .torrent files or call API endpoints without your password.
          Seeing “Unrecognized Host/passkey”? Create a session here, then call the dynamic seedbox API with it to authorize the new IP.
        </p>

        <div className="grid gap-1.5">
          <Label className="text-[13px]">Initial IP address</Label>
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.2.3.4" className="max-w-56 font-mono" />
          {c.help.ip && <p className="max-w-xl text-[11.5px] leading-normal text-muted-foreground">{c.help.ip}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label className="text-[13px]">Lock the session to</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={asnLocked ? 'yes' : 'no'}
            onValueChange={(v) => {
              if (!v) return
              for (const r of c.asnRadios) r.checked = r.value === v
              bump()
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="no" className="px-3 text-[12.5px]">This IP only</ToggleGroupItem>
            <ToggleGroupItem value="yes" className="px-3 text-[12.5px]">The whole provider (ASN)</ToggleGroupItem>
          </ToggleGroup>
          {c.help.asn && <p className="max-w-xl text-[11.5px] leading-normal text-muted-foreground">{c.help.asn}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label className="flex items-center justify-between gap-3 text-[13px]">
            Allow this session to set the dynamic seedbox IP
            <Switch
              checked={dynOn}
              onCheckedChange={(v) => {
                for (const r of c.dynRadios) r.checked = (r.value === 'yes') === (v === true)
                bump()
              }}
            />
          </Label>
          {c.help.dyn && <p className="max-w-xl text-[11.5px] leading-normal text-muted-foreground">{c.help.dyn}</p>}
        </div>

        {c.labelEl && (
          <div className="grid gap-1.5">
            <Label className="text-[13px]">Label / note <span className="font-normal text-muted-foreground">(optional, max 150)</span></Label>
            <Textarea
              defaultValue={c.labelEl.value}
              maxLength={150}
              placeholder="What is this session for? e.g. Seedbox at Hetzner"
              className="min-h-16 max-w-xl"
              onChange={(e) => { c.labelEl!.value = e.target.value }}
            />
          </div>
        )}

        <div>
          <Button onClick={submit}><Plus /> Create session</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SecuritySessions(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  return (
    <div className="grid gap-4">
      {data.warning && (
        <div className="flex items-start gap-2.5 rounded-lg bg-warn/15 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>{data.warning}</span>
        </div>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle>
            Active sessions <span className="text-[12px] font-normal text-muted-foreground">{data.sessions.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {data.sessions.length > 0 ? (
            data.sessions.map((s, i) => <SessionCard key={i} s={s} d={data} />)
          ) : (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No sessions found.</p>
          )}
        </CardContent>
      </Card>

      {data.create && <CreateSession c={data.create} form={data.form} />}
    </div>
  )
}
