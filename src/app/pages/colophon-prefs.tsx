// Colophon's own preferences tab. Everything here is client-side: switches
// write the settings store directly and apply immediately, so there is no form
// and no save bar.
import { useRef, useState } from 'react'
import { BookMarked, Download, Upload } from 'lucide-react'
import type { PageProps } from '@/app/router'
import {
  exportSettings, importSettings, useFeature, useIgnoredTorrents, useRatioFloor, useUserList,
  useUserNotes, type FeatureKey, type UserListKind,
} from '@/lib/settings'
import { HARD_FLOOR } from '@/lib/ratio-protect'
import { PrefCard, SettingRow } from '@/app/pages/prefs-bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'

const EXPORT_FILENAME = 'colophon-settings.json'

function FeatureRow({ feature, title, note }: { feature: FeatureKey; title: string; note: string }) {
  const [on, setOn] = useFeature(feature)
  return (
    <SettingRow title={title} note={note}>
      <Switch checked={on} onCheckedChange={setOn} aria-label={title} />
    </SettingRow>
  )
}

function RatioFloorRow() {
  const [enabled] = useFeature('ratioProtect')
  const [floor, setFloor] = useRatioFloor()
  const [text, setText] = useState(floor != null ? String(floor) : '')
  return (
    <SettingRow
      title="Minimum ratio"
      note="Also lock when a download would push your ratio below this number."
    >
      <Input
        type="number"
        min={0}
        step="0.1"
        placeholder="off"
        aria-label="Minimum ratio"
        disabled={!enabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          setFloor(e.target.value !== '' && Number.isFinite(v) && v > 0 ? v : null)
        }}
        className="h-8 w-24 text-[12.5px]"
      />
    </SettingRow>
  )
}

/** Shared shell for the review lists under the switches. */
function ReviewList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="rounded-lg bg-muted/40 px-4 py-3">
      <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
      {children.length > 0 ? (
        <div className="mt-1 divide-y divide-border/70">{children}</div>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}

const REVIEW_ROW = 'flex items-center justify-between gap-3 py-1.5'
const REVIEW_LINK = 'min-w-0 truncate text-[13px] hover:text-brand'
const REVIEW_BTN = 'h-7 px-2 text-[12px] text-muted-foreground hover:text-foreground'

function IgnoredTorrentRows() {
  const ignored = useIgnoredTorrents()
  return (
    <ReviewList title="Ignored torrents" empty="Nothing ignored.">
      {ignored.list.map((t) => (
        <div key={t.id} className={REVIEW_ROW}>
          <a href={`/t/${t.id}`} className={REVIEW_LINK}>{t.title ?? `#${t.id}`}</a>
          <Button variant="ghost" size="sm" className={REVIEW_BTN} onClick={() => ignored.remove(t.id)}>
            Unignore
          </Button>
        </div>
      ))}
    </ReviewList>
  )
}

function UserListRows({ kind, title, empty }: { kind: UserListKind; title: string; empty: string }) {
  const list = useUserList(kind)
  return (
    <ReviewList title={title} empty={empty}>
      {list.users.map((u) => (
        <div key={u.uid} className={REVIEW_ROW}>
          <a href={`/u/${u.uid}`} className={REVIEW_LINK}>{u.name}</a>
          <Button variant="ghost" size="sm" className={REVIEW_BTN} onClick={() => list.remove(u.uid)}>
            Remove
          </Button>
        </div>
      ))}
    </ReviewList>
  )
}

function NoteRows() {
  const { notes, removeNote } = useUserNotes()
  const entries = Object.entries(notes)
  return (
    <ReviewList title="Your notes" empty="No notes yet.">
      {entries.map(([uid, note]) => (
        <div key={uid} className={REVIEW_ROW}>
          <a href={`/u/${uid}`} className={REVIEW_LINK} title={note.text}>
            <span className="text-muted-foreground">#{uid}</span> {note.text.split('\n')[0]}
          </a>
          <Button variant="ghost" size="sm" className={REVIEW_BTN} onClick={() => removeNote(uid)}>
            Delete
          </Button>
        </div>
      ))}
    </ReviewList>
  )
}

function IntroCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const version = (window as { __colophon?: string }).__colophon ?? null

  function exportFile() {
    const blob = new Blob([exportSettings()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = EXPORT_FILENAME
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Settings exported')
  }

  async function importFile(file: File) {
    try {
      const { applied, skipped } = importSettings(await file.text())
      toast.success(`Applied ${applied} setting${applied === 1 ? '' : 's'}`, {
        description:
          skipped > 0
            ? `${skipped} ${skipped === 1 ? 'entry was' : 'entries were'} not recognised and stayed untouched.`
            : undefined,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  return (
    <Card className="border-brand/20 bg-brand-soft/20 py-0">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <BookMarked className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-display text-[15px] font-semibold">
            Colophon{version && <span className="ml-2 text-[12px] font-normal text-muted-foreground">v{version}</span>}
          </div>
          <p className="text-[12.5px] leading-normal text-muted-foreground">
            These settings apply immediately and live in this browser only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={exportFile}>
            <Download /> Export
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={() => fileRef.current?.click()}>
            <Upload /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function ColophonPrefsView(_props: PageProps) {
  return (
    <div className="grid gap-4">
      <IntroCard />

      <PrefCard title="Downloads">
        <FeatureRow
          feature="ratioProtect"
          title="Ratio protection"
          note={`Locks the plain download on a heavy ratio drop or when it would cross ratio ${HARD_FLOOR}. Switched off, the impact still shows but nothing locks.`}
        />
        <RatioFloorRow />
      </PrefCard>

      <PrefCard title="Browse">
        <FeatureRow
          feature="hideSnatched"
          title="Hide snatched torrents"
          note="Hides results you already snatched. The same toggle lives in the browse filters."
        />
        <FeatureRow
          feature="ignoreAction"
          title="Ignore button on rows"
          note="Adds an ignore action to browse rows. Ignored torrents stay out of every result list."
        />
        <IgnoredTorrentRows />
      </PrefCard>

      <PrefCard title="Torrent pages">
        <FeatureRow
          feature="otherEditions"
          title="Other editions"
          note="Shows other torrents of the same book on the detail page."
        />
        <FeatureRow
          feature="externalLinks"
          title="External search links"
          note="Adds Goodreads, Audible and StoryGraph searches to the detail page."
        />
        <FeatureRow
          feature="forumSnippet"
          title="Forum snippet"
          note="Adds a button that copies a currently-reading snippet for forum posts."
        />
      </PrefCard>

      <PrefCard title="Shoutbox">
        <FeatureRow feature="sbMentions" title="Mention highlight" note="Tints shouts that mention your name." />
        <FeatureRow
          feature="sbColors"
          title="Stable name colours"
          note="Gives users without a colour of their own a steady one, so busy hours stay scannable."
        />
        <FeatureRow feature="sbMutes" title="Mute action" note="Muted users collapse to a single quiet line." />
        <FeatureRow feature="sbEmphasis" title="Emphasis action" note="Marks users you never want to miss." />
        <UserListRows kind="sb-muted" title="Muted users" empty="Nobody muted." />
        <UserListRows kind="sb-emphasized" title="Emphasized users" empty="Nobody emphasized." />
      </PrefCard>

      <PrefCard title="Time and counters">
        <FeatureRow
          feature="localTime"
          title="Local timezone"
          note="Shows times in your own timezone. The exact UTC stamp stays in the tooltip."
        />
        <FeatureRow
          feature="bonusDelta"
          title="Bonus delta"
          note="Shows how many bonus points arrived since your last page."
        />
      </PrefCard>

      <PrefCard title="Profiles">
        <FeatureRow
          feature="profileNotes"
          title="Private notes"
          note="A notes box on profiles. Only you can see it."
        />
        <FeatureRow
          feature="giftHistory"
          title="Gift history"
          note="Shows gifts between you and the profile you are viewing."
        />
        <NoteRows />
      </PrefCard>
    </div>
  )
}
