import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Bug, Link2, ListChecks, Monitor, ShieldCheck, Target, TriangleAlert } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { bottomDockRef } from '@/lib/bottom-dock'
import { PageHeader } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ShineBorder } from '@/components/ui/shine-border'
import { toast } from '@/components/ui/toast'
import { releaseFields } from '@/lib/wysiwyg'

/** Module-scope so it is not recreated each render (which would remount the
 * inputs and drop focus on every keystroke). */
function Field({
  icon: Icon, label, hint, children,
}: { icon: ComponentType<{ className?: string }>; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1.5 text-13 font-medium">
        <Icon className="size-3.5 text-muted-foreground" /> {label}
      </Label>
      {hint && <p className="-mt-0.5 text-12 text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

interface Fields {
  browser: HTMLInputElement
  os: HTMLInputElement
  subject: HTMLInputElement
  url: HTMLInputElement
  reproduce: HTMLTextAreaElement
  expected: HTMLTextAreaElement
  extra: HTMLTextAreaElement
  userScriptFree: HTMLInputElement
}

/** Guided bug report (/forums/bugReport.php). Keeps MAM's form and adds intent,
 * examples and a prominent "no userscripts" gate, which matters because this
 * remaster is itself a userscript. */
export function BugReportView(props: PageProps) {
  const model = useMemo(() => {
    const main = props.page.mainContent
    const form = main?.querySelector<HTMLFormElement>('form[action*="bugReport" i]')
    if (!form) return null
    const q = <T extends Element>(sel: string) => form.querySelector<T>(sel)
    const f: Partial<Fields> = {
      browser: q<HTMLInputElement>('input[name="browser"]') ?? undefined,
      os: q<HTMLInputElement>('input[name="os"]') ?? undefined,
      subject: q<HTMLInputElement>('input[name="subject"]') ?? undefined,
      url: q<HTMLInputElement>('input[name="url"]') ?? undefined,
      reproduce: q<HTMLTextAreaElement>('textarea[name="reproduce"]') ?? undefined,
      expected: q<HTMLTextAreaElement>('textarea[name="expected"]') ?? undefined,
      extra: q<HTMLTextAreaElement>('textarea[name="extra"]') ?? undefined,
      userScriptFree: q<HTMLInputElement>('input[name="userScriptFree"]') ?? undefined,
    }
    if (!f.subject || !f.reproduce || !f.expected) return null
    return { form, f: f as Fields }
  }, [props.page.mainContent])

  const [state, setState] = useState(() => ({
    browser: model?.f.browser?.value ?? '',
    os: model?.f.os?.value ?? '',
    subject: model?.f.subject.value ?? '',
    url: model?.f.url?.value ?? '',
    reproduce: model?.f.reproduce.value ?? '',
    expected: model?.f.expected.value ?? '',
    extra: model?.f.extra?.value ?? '',
    certified: model?.f.userScriptFree?.checked ?? false,
  }))

  if (!model) return <LegacyView {...props} />
  const { f } = model

  function setText(key: 'browser' | 'os' | 'subject' | 'url' | 'reproduce' | 'expected' | 'extra', value: string, el?: HTMLInputElement | HTMLTextAreaElement) {
    setState((s) => ({ ...s, [key]: value }))
    if (el) el.value = value
  }
  function setCertified(v: boolean) {
    setState((s) => ({ ...s, certified: v }))
    if (f.userScriptFree) f.userScriptFree.checked = v
  }

  function submit() {
    if (state.subject.trim().length < 10) return toast.warning('The subject needs at least 10 characters.')
    if (!state.url.trim()) return toast.warning('Add the URL where the bug happens.')
    if (state.reproduce.trim().length < 10) return toast.warning('Describe how to reproduce it (at least 10 characters).')
    if (state.expected.trim().length < 10) return toast.warning('Describe what you expected (at least 10 characters).')
    if (f.userScriptFree && !state.certified) return toast.warning('Please confirm you reproduced this without userscripts or extensions.')
    releaseFields(model!.form)
    model!.form.requestSubmit()
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader title="Report a bug" sub="The more precisely staff can reproduce it, the faster it gets fixed" />

      {f.userScriptFree && (
        <Card className="relative overflow-hidden border-warn/40 bg-warn/5">
          <ShineBorder shineColor={['var(--warn)', 'var(--brand)']} borderWidth={1} duration={12} />
          <CardContent className="flex gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" />
            <div className="grid gap-1 text-13">
              <p className="font-medium">Reproduce it with the remaster turned off first</p>
              <p className="text-muted-foreground">
                Staff only accept bug reports made without userscripts, custom styles or extensions. This remaster is a userscript,
                so disable it (and any other extensions), reproduce the bug on stock MyAnonaMouse and only then certify below.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="!py-3.5"><CardTitle>Your environment</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field icon={Monitor} label="Browser" hint="Name and version">
            <Input value={state.browser} onChange={(e) => setText('browser', e.target.value, f.browser)} placeholder="Chrome 150.0.0" className="h-10" />
          </Field>
          <Field icon={Monitor} label="Operating system" hint="Name and version">
            <Input value={state.os} onChange={(e) => setText('os', e.target.value, f.os)} placeholder="Mac OS X 10.15.7" className="h-10" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="!py-3.5"><CardTitle>What went wrong</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Field icon={Bug} label="Report subject" hint="One specific line, like a headline">
            <Input value={state.subject} onChange={(e) => setText('subject', e.target.value, f.subject)} maxLength={150} placeholder="Search returns 'Manticore connection error'" className="h-10" />
          </Field>
          <Field icon={Link2} label="URL of the fault" hint="The exact page where it happens">
            <Input type="url" value={state.url} onChange={(e) => setText('url', e.target.value, f.url)} placeholder="https://www.myanonamouse.net/tor/browse.php" className="h-10" />
          </Field>
          <Field icon={ListChecks} label="How to reproduce it" hint="Number the steps you took, in order">
            <Textarea value={state.reproduce} onChange={(e) => setText('reproduce', e.target.value, f.reproduce)} placeholder="1. Click the Browse link at the top&#10;2. Wait a few seconds&#10;3. The 'Manticore connection error' appears" className="min-h-28" />
          </Field>
          <Field icon={Target} label="What you expected instead">
            <Textarea value={state.expected} onChange={(e) => setText('expected', e.target.value, f.expected)} placeholder="A list of the most recent torrents should appear" className="min-h-24" />
          </Field>
          {f.extra && (
            <Field icon={Bug} label="Extra information" hint="Optional, anything else that helps">
              <Textarea value={state.extra} onChange={(e) => setText('extra', e.target.value, f.extra)} placeholder="Also reproduces in Firefox and Safari" className="min-h-20" />
            </Field>
          )}
        </CardContent>
      </Card>

      {f.userScriptFree && (
        <Label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-13 leading-snug has-data-checked:border-ok/50 has-data-checked:bg-ok/5">
          <Checkbox checked={state.certified} onCheckedChange={(v) => setCertified(v === true)} className="mt-0.5" />
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 shrink-0 text-ok" />
            I certify I reproduced this without any userscripts, custom styles or browser extensions.
          </span>
        </Label>
      )}

      <div
        ref={bottomDockRef}
        className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur"
      >
        <Button size="sm" onClick={submit}><Bug /> Submit bug report</Button>
      </div>
    </div>
  )
}
