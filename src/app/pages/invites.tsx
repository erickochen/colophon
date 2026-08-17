import { useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { AtSign, CircleCheck, Inbox, MessageSquare, Send, TriangleAlert, UserPlus } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { extractInvites, extractSendForm, type SendForm } from '@/lib/extract/invites'
import { localDate, plural, utcTitle } from '@/lib/format'
import { cleanHtml } from '@/lib/sanitize'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { releaseFields } from '@/lib/wysiwyg'

const SEND_URL = '/invite/send.php'
/** Where invites come from, for the empty stash. */
const DONATE_URL = '/don/index.php'
const EDGE = '[&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6'

/** Enough to catch a typo before an invite is spent. The server decides whether
 * the address is really acceptable. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Module-scope so it is not recreated each render, which would remount the
 * input and drop focus on every keystroke. */
function Field({
  icon: Icon, label, hint, htmlFor, children,
}: { icon: ComponentType<{ className?: string }>; label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[13px] font-medium">
        <Icon className="size-3.5 text-muted-foreground" /> {label}
      </Label>
      {hint && <p className="-mt-0.5 text-[12px] leading-snug text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

function stashLine(count: number | null): string {
  if (count == null) return 'Invitations you have sent that are not yet accepted'
  if (count === 0) return 'No invites in stock right now'
  return `${plural(count, 'invite')} ready to send`
}

/** Overview of the stash plus whatever went out and has not been accepted. */
export function InvitesView(props: PageProps) {
  const data = useMemo(() => extractInvites(props.page.mainContent ?? document), [props.page.mainContent])
  if (!data) return <LegacyView {...props} />

  const count = data.unstarted.length
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Invites"
        sub={stashLine(count)}
        action={
          count > 0 ? (
            <Button size="sm" asChild>
              <a href={SEND_URL}><UserPlus /> Send invite</a>
            </Button>
          ) : null
        }
      />

      {data.sentNote && (
        <Card className="border-ok/40 bg-ok/5">
          <CardContent className="flex gap-3">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" />
            <p className="text-[13px] leading-snug">{data.sentNote}</p>
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b !py-3.5"><CardTitle>Ready to send</CardTitle></CardHeader>
        {count > 0 ? (
          <Table className={EDGE}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {/* A width on the first column keeps the two dates together
                    instead of pushing them to opposite edges. */}
                <TableHead className="w-[200px]">Added</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.unstarted.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[13px] tabular-nums" title={utcTitle(r.added)}>{localDate(r.added)}</TableCell>
                  <TableCell className="text-[13px] tabular-nums" title={utcTitle(r.expires)}>{localDate(r.expires)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing to send. Invites arrive with <a href={DONATE_URL} className="text-brand underline">donations</a>.
          </CardContent>
        )}
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b !py-3.5"><CardTitle>Sent, not joined yet</CardTitle></CardHeader>
        {data.unconfirmed && data.unconfirmed.rows.length > 0 ? (
          <Table className={EDGE}>
            {data.unconfirmed.headers.some(Boolean) && (
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {data.unconfirmed.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}
                </TableRow>
              </TableHeader>
            )}
            <TableBody>
              {data.unconfirmed.rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    // Only the first column wraps. The rest hold short values
                    // like dates, which would otherwise break at their hyphens.
                    <TableCell
                      key={j}
                      className={j === 0 ? 'w-full whitespace-normal align-top text-[13px]' : 'align-top text-[13px] tabular-nums'}
                    >
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Invites you send stay here until the person signs up.
          </CardContent>
        )}
      </Card>
    </div>
  )
}

function SendConfirm({
  email, hasMessage, stock, onSend, onClose,
}: { email: string; hasMessage: boolean; stock: number | null; onSend: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  // The button goes disabled a render later, so a held Enter can fire twice.
  const inFlight = useRef(false)

  function send() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    onSend()
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent size="sm" className="gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Send this invite?</AlertDialogTitle>
          <AlertDialogDescription>
            The invitation goes out by email straight away. It uses one invite and there is no way to take it back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* min-w-0 gives the nowrap address a floor to truncate against; a grid
            item otherwise sizes to its min-content. */}
        <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2 text-left">
          <p className="truncate text-[13.5px] font-semibold" title={email}>{email}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {hasMessage ? 'With your message' : 'No message'}
            {stock != null && <>{' · '}{plural(stock, 'invite')}, {stock - 1} after this</>}
          </p>
        </div>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy}>
            {busy ? <Spinner /> : <Send />}
            {busy ? 'Sending' : 'Send invite'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** MAM's message for the case its form is absent, for instance an empty stash. */
function NoForm(props: PageProps) {
  const html = useMemo(() => cleanHtml(props.page.mainContent), [props.page.mainContent])
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader title="Send an invite" sub="No invites in stock right now" />
      <Card>
        <CardContent>
          {html ? (
            <RichHtml html={html} className="text-[13px]" />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                <EmptyTitle>No invites in stock</EmptyTitle>
                <EmptyDescription>Invites arrive with donations.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** The invite form (/invite/send.php). React holds the values and mirrors them
 * onto MAM's own inputs, so the POST always carries what is on screen. */
export function SendInviteView(props: PageProps) {
  const model = useMemo<SendForm | null>(
    () => (props.page.mainContent ? extractSendForm(props.page.mainContent) : null),
    [props.page.mainContent],
  )
  const [email, setEmail] = useState(() => model?.email.value ?? '')
  const [message, setMessage] = useState(() => model?.message.value ?? '')
  const [confirming, setConfirming] = useState(false)

  if (!props.page.mainContent) return <LegacyView {...props} />
  if (!model) return <NoForm {...props} />

  const stock = props.page.stats.invites
  const valid = EMAIL_SHAPE.test(email.trim())

  function setEmailSynced(v: string) {
    setEmail(v)
    model!.email.value = v
  }
  function setMessageSynced(v: string) {
    setMessage(v)
    model!.message.value = v
  }

  // Submitting through the button keeps its name in the payload. MAM reads that
  // name, so a bare requestSubmit() would post a form it quietly ignores.
  function send() {
    releaseFields(model!.form)
    model!.form.requestSubmit(model!.submitter as HTMLInputElement | null)
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader
        title="Send an invite"
        sub={[model.source, stock != null ? `${plural(stock, 'invite')} in stock` : null].filter(Boolean).join(' · ')}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) setConfirming(true)
        }}
        className="grid gap-4"
      >
        <Card>
          <CardContent className="grid gap-4">
            <Field icon={AtSign} label="Email address" hint={model.emailHint || undefined} htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmailSynced(e.target.value)}
                placeholder="friend@example.com"
                className="h-10"
                autoComplete="off"
                aria-invalid={email.trim() !== '' && !valid}
                autoFocus
              />
            </Field>
            <Field icon={MessageSquare} label="Message" hint="Optional, goes along in the invitation email" htmlFor="invite-message">
              <Textarea
                id="invite-message"
                value={message}
                onChange={(e) => setMessageSynced(e.target.value)}
                placeholder="Tell them who you are and what to expect."
                className="min-h-28"
              />
            </Field>
          </CardContent>
        </Card>

        {model.ipWarning && (
          <Card className="border-warn/40 bg-warn/5">
            <CardContent className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" />
              <p className="text-[13px] leading-snug text-muted-foreground">{model.ipWarning}</p>
            </CardContent>
          </Card>
        )}

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
          <span className="text-[12px] text-muted-foreground">You confirm before anything is sent</span>
          <Button type="submit" size="sm" disabled={!valid}><Send /> Send invite</Button>
        </div>
      </form>

      {confirming && (
        <SendConfirm
          email={email.trim()}
          hasMessage={message.trim() !== ''}
          stock={stock}
          onSend={send}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
