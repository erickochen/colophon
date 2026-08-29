import { useMemo } from 'react'
import type { PageProps } from '@/app/router'
import { parseForm } from '@/lib/form-mirror'
import { cleanHtml } from '@/lib/sanitize'
import { DocView } from '@/app/pages/doc'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { releaseFields } from '@/lib/wysiwyg'

/** Pages that are one explanatory text plus one form (upload slot, vault
 * donation, lotto): intro as reader content, form mirrored into our controls. */
export function SimpleFormView(props: PageProps) {
  const { intro, mirror, submitLabel, extraActions, subtitle } = useMemo(() => {
    const main = props.page.mainContent
    const form = main?.querySelector<HTMLFormElement>('form:not(#mainSearch)')
    if (!main || !form) return { intro: null, mirror: null, submitLabel: "Submit", extraActions: [], subtitle: null }
    const clone = main.cloneNode(true) as HTMLElement
    clone.querySelectorAll('form').forEach((f) => f.remove())
    // The page's own h1 often carries context the title misses ("Message to
    // <user>", "Add a comment to <torrent>"): lift it to the header subtitle,
    // then drop it from the body so it isn't shown twice.
    const subtitle = clone.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? null
    clone.querySelectorAll('h1').forEach((h) => h.remove())
    const submit = form.querySelector<HTMLInputElement>('input[type="submit"], button[type="submit"], input[name="PlayLotto"]')
    // Buttons the page offers next to submit (Preview on compose forms, etc.);
    // they drive real behavior, so keep them.
    const extraActions = [...form.querySelectorAll<HTMLInputElement>('input[type="button"], button[type="button"]')]
      .map((el) => ({ label: (el.value || el.textContent || '').replace(/\s+/g, ' ').trim(), el: el as HTMLElement }))
      .filter((a) => a.label)
    // Only keep the intro card when it carries real text; the leftover
    // blockHead/blockFoot scaffolding is non-empty HTML but shows as a blank card.
    const introText = clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    return {
      intro: introText.length > 2 ? cleanHtml(clone) : null,
      mirror: parseForm(form),
      submitLabel: submit?.value || submit?.textContent?.trim() || 'Submit',
      extraActions,
      subtitle,
    }
  }, [props.page.mainContent])

  // No form (e.g. MAM gates uploads for accounts under 30 days) -> show the
  // notice as a clean reader page, not the raw legacy frame.
  if (!mirror) return <DocView {...props} />

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader title={props.page.title || 'MyAnonaMouse'} sub={subtitle && subtitle !== props.page.title ? subtitle : undefined} />
      {intro && (
        <Card>
          <CardContent>
            <RichHtml html={intro} className="[&_.blockHead]:hidden [&_.blockFoot]:hidden [&_h1]:font-display [&_h1]:my-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:my-1.5 [&_h3]:font-semibold" />
          </CardContent>
        </Card>
      )}
      {mirror.rows.length > 0 ? (
        <FormMirrorView form={mirror} submitLabel={submitLabel} layout="compose" extraActions={extraActions} />
      ) : (
        <Card>
          <CardContent className="flex justify-end py-4">
            <Button onClick={() => { releaseFields(mirror.el); mirror.el.requestSubmit(mirror.submitter) }}>{submitLabel}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
