import { useMemo, useState } from 'react'
import { CornerDownLeft, MessagesSquare, Send, Smile, Tag } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { parseForm } from '@/lib/form-mirror'
import { SimpleFormView } from '@/app/pages/simple-form'
import { bottomDockRef } from '@/lib/bottom-dock'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { BBComposer } from '@/components/bb-composer'
import { Crumbs, PageHeader } from '@/app/shell/bits'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { releaseFields } from '@/lib/wysiwyg'

interface JumpOption { value: string; label: string; group?: string }

/** New-topic composer (/forums.php?action=newtopic). Keeps MAM's bare
 * subject+body form and submits it unchanged, with a BBCode composer on top. */
export function ForumComposeView(props: PageProps) {
  const model = useMemo(() => {
    const main = props.page.mainContent
    const form = main?.querySelector<HTMLFormElement>('form[name="compose"], form[action="/forums.php"]')
    const subjectEl = form?.querySelector<HTMLInputElement>('input[name="subject"]')
    const bodyEl = form?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')
    if (!form || !subjectEl || !bodyEl) return null
    const forumLink = main?.querySelector<HTMLAnchorElement>('h3 a[href]')
    const jump = main?.querySelector<HTMLSelectElement>('form[name="jump"] select[name="forumid"], form[action*="viewForum" i] select')
    const jumpOptions: JumpOption[] = jump
      ? [...jump.options].map((o) => ({
          value: o.value,
          label: o.textContent?.replace(/ /g, ' ').replace(/\s+/g, ' ').trim() ?? o.value,
          group: o.closest('optgroup')?.getAttribute('label') ?? undefined,
        }))
      : []
    return {
      form,
      subjectEl,
      bodyEl,
      forumName: forumLink?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      forumHref: forumLink?.getAttribute('href') ?? null,
      jumpOptions,
    }
  }, [props.page.mainContent])

  const [subject, setSubject] = useState(() => model?.subjectEl.value ?? '')
  const [body, setBody] = useState(() => model?.bodyEl.value ?? '')
  if (!model) return <SimpleFormView {...props} />

  function setSubjectSynced(v: string) {
    setSubject(v)
    model!.subjectEl.value = v
  }
  function setBodySynced(v: string) {
    setBody(v)
    model!.bodyEl.value = v
  }
  function submit() {
    if (subject.trim().length < 2) {
      toast.warning('Give your topic a subject.')
      return
    }
    if (!body.trim()) {
      toast.warning('Your post is empty.')
      return
    }
    releaseFields(model!.form)
    model!.form.requestSubmit()
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="grid gap-2">
        <Crumbs
          items={[
            { name: 'Forums', href: '/f' },
            ...(model.forumName ? [{ name: model.forumName, href: model.forumHref }] : []),
            { name: 'New topic', href: null },
          ]}
        />
        <PageHeader
          title="New topic"
          sub={
            model.forumName ? (
              <span className="inline-flex items-center gap-1.5">
                <MessagesSquare className="size-3.5" /> Posting in {model.forumName}
              </span>
            ) : undefined
          }
        />
      </div>

      <BlurFade inView>
        <Card>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="topic-subject" className="text-[12.5px] text-muted-foreground">Subject</Label>
              <Input
                id="topic-subject"
                value={subject}
                onChange={(e) => setSubjectSynced(e.target.value)}
                placeholder="A clear, specific title"
                maxLength={150}
                className="h-10"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[12.5px] text-muted-foreground">Post</Label>
              <BBComposer value={body} onChange={setBodySynced} placeholder="Write your first post…" minHeightClass="min-h-56" />
              <div className="flex items-center gap-3 pt-0.5 text-[11.5px] text-muted-foreground">
                <a href="/tags.php" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground"><Tag className="size-3" /> BBCode tags</a>
                <a href="/smilies.php" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground"><Smile className="size-3" /> Smilies</a>
              </div>
            </div>
          </CardContent>
        </Card>
      </BlurFade>

      <div
        ref={bottomDockRef}
        className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur"
      >
        {model.jumpOptions.length > 0 ? (
          <Select onValueChange={(v) => { if (v) location.href = `/f/b/${v}` }}>
            <SelectTrigger size="sm" className="w-fit min-w-52 max-w-full text-[12.5px]">
              <SelectValue placeholder="Jump to another forum…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {Object.entries(
                model.jumpOptions.reduce<Record<string, JumpOption[]>>((acc, o) => {
                  const g = o.group ?? ''
                  ;(acc[g] ??= []).push(o)
                  return acc
                }, {})
              ).map(([group, opts]) =>
                group ? (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectGroup>
                ) : (
                  opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)
                )
              )}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={submit}>
          <Send /> Post topic <CornerDownLeft className="opacity-60" />
        </Button>
      </div>
    </div>
  )
}

/** Edit an existing post (action=editpost&postid=N). Mirrors the whole form so
 * every field it carries is preserved. MAM's own preview button renders into a
 * hidden light-DOM node, so we drop it for the composer's live preview. */
export function ForumPostEditView(props: PageProps) {
  const model = useMemo(() => {
    const main = props.page.mainContent
    const form = main?.querySelector<HTMLFormElement>('form[name="edit"], form[action*="editpost" i]')
    if (!main || !form) return null
    const submit = form.querySelector<HTMLInputElement>('input[type="submit"], button[type="submit"]')
    return { mirror: parseForm(form), submitLabel: submit?.value || 'Update post' }
  }, [props.page.mainContent])

  if (!model) return <SimpleFormView {...props} />

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="grid gap-2">
        <Crumbs items={[{ name: 'Forums', href: '/f' }, { name: 'Edit post', href: null }]} />
        <PageHeader title="Edit post" sub="Revise your post and save the changes" />
      </div>
      <FormMirrorView form={model.mirror} submitLabel={model.submitLabel} layout="compose" />
    </div>
  )
}
