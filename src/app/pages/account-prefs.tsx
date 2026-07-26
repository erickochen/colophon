import { useMemo, useState, type ReactNode } from 'react'
import { Check, Copy, KeyRound, Lock, Mail, Radio, ShieldCheck, X } from 'lucide-react'
import { LegacyView } from '@/app/pages/legacy'
import type { PageProps } from '@/app/router'
import { PrefCard, SaveBar } from '@/app/pages/prefs-bits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface AccountData {
  form: HTMLFormElement
  username: string
  curpass: HTMLInputElement | null
  email: HTMLInputElement | null
  emailPlaceholder: string | null
  pass: HTMLInputElement | null
  pass2: HTMLInputElement | null
  irc: HTMLInputElement | null
  irc2: HTMLInputElement | null
  passkey: string | null
  ircNames: string | null
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() || null

/** Text of the row1 cell whose row2 label matches `re`. */
function rowValue(form: HTMLElement, re: RegExp): string | null {
  for (const tr of form.querySelectorAll('tr')) {
    const cells = [...tr.querySelectorAll(':scope > td')]
    const label = cells.find((c) => c.classList.contains('row2'))
    if (label && re.test(label.textContent ?? '')) {
      const value = cells.find((c) => c !== label && c.classList.contains('row1'))
      const t = clean(value?.textContent)
      if (t) return t
    }
  }
  return null
}

function extract(): AccountData | null {
  const form = document.querySelector<HTMLFormElement>('#prefForm')
  if (!form) return null
  const q = <T extends HTMLElement>(s: string) => form.querySelector<T>(s)
  const email = q<HTMLInputElement>('input[name="email"]')
  return {
    form,
    username: q<HTMLInputElement>('input[name="username"]')?.value ?? '',
    curpass: q<HTMLInputElement>('input[name="curpass"]'),
    email,
    emailPlaceholder: email?.getAttribute('placeholder') ?? null,
    pass: q<HTMLInputElement>('#pass') ?? q<HTMLInputElement>('input[name="password"]'),
    pass2: q<HTMLInputElement>('#pass2') ?? q<HTMLInputElement>('input[name="password2"]'),
    irc: q<HTMLInputElement>('#irc') ?? q<HTMLInputElement>('input[name="IRCpassword"]'),
    irc2: q<HTMLInputElement>('#irc2') ?? q<HTMLInputElement>('input[name="IRCpassword2"]'),
    passkey: rowValue(form, /passkey/i),
    ircNames: rowValue(form, /irc names/i),
  }
}

// MAM rule: a valid password is >= 10 chars, must not contain the username and
// must include at least 2 of upper / lower / number / symbol.
function analyze(pw: string, username: string) {
  const upper = /[A-Z]/.test(pw)
  const lower = /[a-z]/.test(pw)
  const number = /[0-9]/.test(pw)
  const symbol = /[^A-Za-z0-9]/.test(pw)
  const classes = [upper, lower, number, symbol].filter(Boolean).length
  const longEnough = pw.length >= 10
  const noUsername = !username || !pw.toLowerCase().includes(username.toLowerCase())
  return { upper, lower, number, symbol, classes, longEnough, noUsername, meets: longEnough && noUsername && classes >= 2 }
}

function Req({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5 text-[12px] leading-snug', ok ? 'text-ok' : 'text-muted-foreground')}>
      {ok ? <Check className="size-3.5 shrink-0" /> : <X className="size-3.5 shrink-0" />}
      <span>{children}</span>
    </li>
  )
}

function ClassBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px]', ok ? 'bg-ok/15 text-ok' : 'bg-muted text-muted-foreground')}>
      {label}
    </span>
  )
}

/** Live strength readout for a password + its confirmation. */
function Meter({
  pw, confirm, username, forbid,
}: { pw: string; confirm: string; username: string; forbid?: { value: string; label: string } }): ReactNode {
  if (!pw) return null
  const a = analyze(pw, username)
  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 px-3.5 py-3">
      <ul className="grid gap-1">
        <Req ok={a.longEnough}>At least 10 characters</Req>
        {username && <Req ok={a.noUsername}>Does not contain your username</Req>}
        <Req ok={a.classes >= 2}>Mixes at least 2 character types</Req>
        {forbid && <Req ok={pw !== forbid.value}>{forbid.label}</Req>}
        <Req ok={pw === confirm}>Matches the confirmation</Req>
      </ul>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <ClassBadge ok={a.upper} label="upper" />
        <ClassBadge ok={a.lower} label="lower" />
        <ClassBadge ok={a.number} label="number" />
        <ClassBadge ok={a.symbol} label="symbol" />
      </div>
    </div>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[13px]">{label}</Label>
      {children}
      {hint && <p className="text-[11.5px] leading-normal text-muted-foreground">{hint}</p>}
    </div>
  )
}

function AccountForm({ d }: { d: AccountData }) {
  const [curpass, setCurpass] = useState(d.curpass?.value ?? '')
  const [email, setEmail] = useState(d.email?.value ?? '')
  const [pw, setPw] = useState(d.pass?.value ?? '')
  const [pw2, setPw2] = useState(d.pass2?.value ?? '')
  const [irc, setIrc] = useState(d.irc?.value ?? '')
  const [irc2, setIrc2] = useState(d.irc2?.value ?? '')

  const write = (el: HTMLInputElement | null, v: string, set: (v: string) => void) => {
    set(v)
    if (el) el.value = v
  }

  const copyPasskey = async () => {
    if (!d.passkey) return
    try {
      await navigator.clipboard.writeText(d.passkey)
      toast.success('Passkey copied')
    } catch {
      toast.error('Could not copy - select it manually')
    }
  }

  return (
    <div className="grid gap-4">
      <PrefCard title={<span className="flex items-center gap-2"><ShieldCheck className="size-4" /> Confirm it is you</span>}>
        <Field
          label="Current password"
          hint="Required to change anything on this page. Leave the rest blank to keep it unchanged."
        >
          <Input
            type="password"
            autoComplete="current-password"
            value={curpass}
            onChange={(e) => write(d.curpass, e.target.value, setCurpass)}
            className="max-w-sm"
          />
        </Field>
      </PrefCard>

      <PrefCard title={<span className="flex items-center gap-2"><Mail className="size-4" /> Email</span>}>
        <Field
          label="Email address"
          hint={`Changing this sends a confirmation email to the new address.${d.emailPlaceholder ? ` Current: ${d.emailPlaceholder}` : ''}`}
        >
          <Input
            type="email"
            value={email}
            placeholder={d.emailPlaceholder ?? undefined}
            onChange={(e) => write(d.email, e.target.value, setEmail)}
            className="max-w-sm"
          />
        </Field>
      </PrefCard>

      {(d.pass || d.pass2) && (
        <PrefCard title={<span className="flex items-center gap-2"><Lock className="size-4" /> Password</span>}>
          <Field label="New password">
            <Input type="password" autoComplete="new-password" minLength={10} value={pw} onChange={(e) => write(d.pass, e.target.value, setPw)} className="max-w-sm" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" minLength={10} value={pw2} onChange={(e) => write(d.pass2, e.target.value, setPw2)} className="max-w-sm" />
          </Field>
          <Meter pw={pw} confirm={pw2} username={d.username} />
        </PrefCard>
      )}

      {(d.irc || d.irc2) && (
        <PrefCard
          title={<span className="flex items-center gap-2"><Radio className="size-4" /> IRC / services password</span>}
          note="Used for IRC services. It must not match your site password."
        >
          <Field label="New IRC password">
            <Input type="password" autoComplete="off" minLength={10} value={irc} onChange={(e) => write(d.irc, e.target.value, setIrc)} className="max-w-sm" />
          </Field>
          <Field label="Confirm IRC password">
            <Input type="password" autoComplete="off" minLength={10} value={irc2} onChange={(e) => write(d.irc2, e.target.value, setIrc2)} className="max-w-sm" />
          </Field>
          <Meter pw={irc} confirm={irc2} username={d.username} forbid={{ value: pw, label: 'Different from your site password' }} />
          {d.ircNames && <p className="text-[12px] leading-normal text-muted-foreground">IRC names: {d.ircNames}</p>}
        </PrefCard>
      )}

      {d.passkey && (
        <PrefCard title={<span className="flex items-center gap-2"><KeyRound className="size-4" /> Passkey</span>} note="Your private torrent passkey. Keep it secret.">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted/70 px-3 py-2 font-mono text-[13px]" title={d.passkey}>
              {d.passkey}
            </code>
            <Button variant="outline" size="sm" onClick={copyPasskey}>
              <Copy /> Copy
            </Button>
          </div>
        </PrefCard>
      )}
    </div>
  )
}

export function AccountPrefsView(props: PageProps) {
  const data = useMemo(extract, [])
  const [rev, setRev] = useState(0)
  if (!data) return <LegacyView {...props} />
  return (
    <div className="grid gap-4">
      <AccountForm key={rev} d={data} />
      <SaveBar form={data.form} onAfterRevert={() => setRev((r) => r + 1)} />
    </div>
  )
}
