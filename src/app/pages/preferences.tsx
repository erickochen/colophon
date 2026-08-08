import { useMemo } from 'react'
import type { PageProps } from '@/app/router'
import { parseForm } from '@/lib/form-mirror'
import { LegacyView } from '@/app/pages/legacy'
import { SecuritySessions } from '@/app/pages/security-sessions'
import { SearchPrefsView } from '@/app/pages/search-prefs'
import { AccountPrefsView } from '@/app/pages/account-prefs'
import { StylePrefsView } from '@/app/pages/style-prefs'
import { ForumsPrefsView } from '@/app/pages/forums-prefs'
import { LinksPrefsView } from '@/app/pages/links-prefs'
import { PageHeader } from '@/app/shell/bits'
import { FormMirrorView } from '@/app/shell/form-mirror-view'
import { cn } from '@/lib/utils'

const TABS = [
  { view: 'general', label: 'General' },
  { view: 'privacy', label: 'Privacy' },
  { view: 'account', label: 'Account' },
  { view: 'forums', label: 'Forum & shoutbox' },
  { view: 'uploading', label: 'Uploading' },
  { view: 'search', label: 'Torrent search' },
  { view: 'security', label: 'Security' },
  { view: 'style', label: 'Style' },
  { view: 'links', label: 'Tiny URL' },
]

export function PreferencesView(props: PageProps) {
  const current = new URLSearchParams(location.search).get('view') ?? 'general'
  const active = TABS.some((t) => t.view === current) ? current : 'general'
  const mirror = useMemo(() => {
    const form =
      document.querySelector<HTMLFormElement>('#prefForm') ??
      document.querySelector<HTMLFormElement>('#mainBody form[method="post" i]')
    if (!form) return null
    return parseForm(form, document.querySelector('#mainBody h1'))
  }, [])

  const nav = (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 xl:sticky xl:top-20 xl:mx-0 xl:flex-col xl:gap-0.5 xl:self-start xl:overflow-visible xl:px-0 xl:pb-0">
      {TABS.map((t) => {
        const isActive = active === t.view
        return (
          <a
            key={t.view}
            href={`/preferences/index.php?view=${t.view}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition-colors',
              'xl:py-2',
              isActive
                ? 'bg-brand-soft font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground xl:hover:text-foreground'
            )}
          >
            {t.label}
          </a>
        )
      })}
    </nav>
  )

  return (
    <div className="grid gap-5">
      <PageHeader title="Preferences" sub={`${TABS.find((t) => t.view === active)?.label ?? 'General'} settings`} />
      <div className="grid gap-6 xl:grid-cols-[180px_minmax(0,1fr)]">
        {nav}
        <div className="min-w-0 max-w-3xl">
          {/* Bespoke views own the tabs whose forms the generic FormMirror
              mangles (matrix tables, nested widgets, live meters). The rest
              stay plain FormMirror. */}
          {active === 'security' ? (
            <SecuritySessions {...props} />
          ) : active === 'search' ? (
            <SearchPrefsView {...props} />
          ) : active === 'account' ? (
            <AccountPrefsView {...props} />
          ) : active === 'style' ? (
            <StylePrefsView {...props} />
          ) : active === 'forums' ? (
            <ForumsPrefsView {...props} />
          ) : active === 'links' ? (
            <LinksPrefsView {...props} />
          ) : mirror && mirror.rows.length > 0 ? (
            <FormMirrorView form={mirror} />
          ) : (
            <LegacyView {...props} />
          )}
        </div>
      </div>
    </div>
  )
}
