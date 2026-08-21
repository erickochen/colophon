import { useEffect, useMemo, useState } from 'react'
import { CornerUpLeft, Mail, Send } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { SimpleFormView } from '@/app/pages/simple-form'
import { bottomDockRef } from '@/lib/bottom-dock'
import { BBComposer } from '@/components/bb-composer'
import { PageHeader, UserLink } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { releaseFields } from '@/lib/wysiwyg'
import { toast } from '@/components/ui/toast'

/** Compose or reply to a private message (/sendmessage.php). On a reply MAM
 * prefills the subject and stacks the quoted history into the body, so both are
 * taken over as they are and submitted through MAM's own form. */
export function ComposeMessageView(props: PageProps) {
  const model = useMemo(() => {
    const main = props.page.mainContent
    const form = main?.querySelector<HTMLFormElement>('form[action*="takemessage" i], form[method="post" i]')
    if (!form) return null
    const subjectEl = form.querySelector<HTMLInputElement>('input[name="subject"]')
    const msgEl = form.querySelector<HTMLTextAreaElement>('textarea[name="msg"], textarea[name="message"], textarea')
    if (!subjectEl || !msgEl) return null
    const saveEl = form.querySelector<HTMLInputElement>('input[name="save"]')
    const recipientA = main?.querySelector<HTMLAnchorElement>('h1 a[href^="/u/"], h1 a')
    return {
      form,
      subjectEl,
      msgEl,
      saveEl,
      isReply: new URLSearchParams(location.search).has('replyto'),
      recipientName: recipientA?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      recipientHref: recipientA?.getAttribute('href') ?? null,
    }
  }, [props.page.mainContent])

  const [subject, setSubject] = useState(() => model?.subjectEl.value ?? '')
  const [body, setBody] = useState(() => model?.msgEl.value ?? '')

  // A conversation only reads back in full while the sentbox keeps our side of
  // it, so the copy is forced on rather than left to the form's default.
  useEffect(() => {
    if (!model) return
    if (model.saveEl) {
      model.saveEl.checked = true
      return
    }
    const el = document.createElement('input')
    el.type = 'hidden'
    el.name = 'save'
    el.value = 'yes'
    model.form.appendChild(el)
  }, [model])

  if (!model) return <SimpleFormView {...props} />

  const recipientName = model.recipientName ?? 'member'

  function setSubjectSynced(v: string) {
    setSubject(v)
    model!.subjectEl.value = v
  }
  function setBodySynced(v: string) {
    setBody(v)
    model!.msgEl.value = v
  }

  function submit() {
    if (!subject.trim()) {
      toast.warning('Add a subject before sending.')
      return
    }
    if (!body.trim()) {
      toast.warning('Your message is empty.')
      return
    }
    releaseFields(model!.form)
    model!.form.requestSubmit()
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader
        title={model.isReply ? 'Reply' : 'New message'}
        sub={
          <span className="inline-flex items-center gap-1.5">
            {model.isReply ? <CornerUpLeft className="size-3.5 text-brand" /> : null}
            {model.isReply ? 'Replying to' : 'To'}{' '}
            <UserLink name={recipientName} href={model.recipientHref} className="text-foreground" />
          </span>
        }
      />

      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pm-subject" className="text-[12.5px] text-muted-foreground">Subject</Label>
            <Input
              id="pm-subject"
              value={subject}
              onChange={(e) => setSubjectSynced(e.target.value)}
              placeholder="What is this about?"
              className="h-10"
              autoFocus={!model.isReply}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px] text-muted-foreground">Message</Label>
            <BBComposer value={body} onChange={setBodySynced} placeholder={`Write to ${recipientName}…`} minHeightClass="min-h-48" />
          </div>
        </CardContent>
      </Card>

      <div
        ref={bottomDockRef}
        className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur"
      >
        <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Mail className="size-3.5" /> A copy stays in your Sentbox
        </span>
        <Button size="sm" onClick={submit}><Send /> Send message</Button>
      </div>
    </div>
  )
}
