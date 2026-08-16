// The author, narrator and series boxes on MAM's upload and request forms look
// up names while you type. Typing your own stays fine; picking from the list is
// what ties the name to the one MAM already knows.
import { useEffect, useRef, useState } from 'react'
import { MIN_NAME_TERM, searchNames, type NameHit, type NameKind } from '@/lib/mam-names'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Autocomplete, AutocompleteContent, AutocompleteInput, AutocompleteItem, AutocompleteList, AutocompleteStatus,
} from '@/components/ui/autocomplete'

/** Keystrokes settle before a lookup goes out, matching MAM's own delay. */
const TYPING_PAUSE_MS = 300

const KIND_NOUN: Record<NameKind, string> = { author: 'author', narrator: 'narrator', series: 'series' }

export function NameSuggest({
  kind,
  defaultValue,
  onChange,
  onPick,
  placeholder,
  className,
  labelledBy,
}: {
  kind: NameKind
  defaultValue: string
  onChange: (value: string) => void
  /** Fired only when a name comes out of MAM's list. */
  onPick?: (hit: NameHit) => void
  placeholder?: string
  className?: string
  labelledBy?: string
}) {
  const [text, setText] = useState(defaultValue)
  const [hits, setHits] = useState<NameHit[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const live = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A value set from outside (a metadata lookup, a row removed above this one)
  // wins over what the box holds. Typing hands the same string back, so it
  // never fights the caret.
  const fromCaller = useRef(defaultValue)
  if (fromCaller.current !== defaultValue) {
    fromCaller.current = defaultValue
    setText(defaultValue)
    // A lookup still on its way belongs to the text that just left.
    clearTimeout(timer.current)
    live.current?.abort()
    setHits([])
    setBusy(false)
    setFailed(false)
  }

  useEffect(() => () => {
    clearTimeout(timer.current)
    live.current?.abort()
  }, [])

  function look(term: string) {
    clearTimeout(timer.current)
    live.current?.abort()
    if (term.trim().length < MIN_NAME_TERM) {
      setHits([])
      setBusy(false)
      setFailed(false)
      return
    }
    // The old names belong to the old term, so they leave with it: a list that
    // lags behind is a list you can pick the wrong name from.
    setHits([])
    setBusy(true)
    setFailed(false)
    timer.current = setTimeout(() => {
      const run = new AbortController()
      live.current = run
      searchNames(kind, term.trim(), run.signal)
        .then((found) => {
          if (run.signal.aborted) return
          setHits(found)
          setBusy(false)
        })
        .catch(() => {
          if (run.signal.aborted) return
          setHits([])
          setBusy(false)
          setFailed(true)
        })
    }, TYPING_PAUSE_MS)
  }

  const typed = text.trim().length
  const status =
    busy ? 'searching'
    : failed ? 'failed'
    : typed > 0 && typed < MIN_NAME_TERM ? 'short'
    : typed >= MIN_NAME_TERM && hits.length === 0 ? 'none'
    : hits.length > 0 ? 'hits'
    : null

  return (
    <Autocomplete
      items={hits}
      value={text}
      filter={null}
      itemToStringValue={(hit: NameHit) => hit.name}
      onValueChange={(next, details) => {
        setText(next)
        onChange(next)
        // A name taken from the list is already the answer, so it starts no
        // fresh lookup of itself.
        if (details.reason === 'input-change') look(next)
      }}
    >
      <AutocompleteInput
        render={<Input className={className} aria-labelledby={labelledBy} />}
        placeholder={placeholder}
      />
      <AutocompleteContent hidden={!status}>
        <AutocompleteStatus>
          {status && status !== 'hits' && (
            <p className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-muted-foreground">
              {busy && <Spinner className="size-3.5" />}
              {status === 'searching' && 'Searching'}
              {status === 'short' && `Type ${MIN_NAME_TERM} letters to see known ${KIND_NOUN[kind]} names.`}
              {status === 'none' && 'No match. Your own spelling stands.'}
              {status === 'failed' && 'The name list did not answer. Typing the name yourself still works.'}
            </p>
          )}
        </AutocompleteStatus>
        <AutocompleteList className="max-h-[min(18rem,var(--available-height))]">
          {(hit: NameHit) => (
            <AutocompleteItem
              key={hit.id}
              value={hit}
              onClick={() => onPick?.(hit)}
            >
              <span className="min-w-0 flex-1 truncate">{hit.name}</span>
              {hit.id > 0 && <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{hit.id}</span>}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}
