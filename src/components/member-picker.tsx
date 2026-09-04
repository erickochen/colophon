// Pick a member by name. MAM has no member autocomplete, so this searches the
// member list page and hands back whoever is clicked.
import { useEffect, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { searchMembers, type UserRow } from '@/lib/extract/users'
import { FilterSearch } from '@/components/filters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

/** Shortest term MAM's member search accepts without returning the world. */
const MIN_TERM = 2

export function MemberPicker({
  open,
  onOpenChange,
  onPick,
  title = 'New message',
  description = 'Search a member to write to.',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (member: UserRow) => void
  title?: string
  description?: string
}) {
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [tooShort, setTooShort] = useState(false)
  const reqId = useRef(0)

  // Reopening starts clean, so an old result set never reads as a fresh one.
  useEffect(() => {
    if (open) return
    setTerm('')
    setRows(null)
    setLoading(false)
    setTooShort(false)
  }, [open])

  async function run() {
    if (term.trim().length < MIN_TERM) {
      setTooShort(true)
      return
    }
    setTooShort(false)
    const id = ++reqId.current
    setLoading(true)
    try {
      const found = await searchMembers(term)
      if (id === reqId.current) setRows(found)
    } catch {
      if (id === reqId.current) setRows([])
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <FilterSearch value={term} onChange={setTerm} onSubmit={run} placeholder="Member name…" autoFocus />

        {tooShort && (
          <p className="text-12 text-muted-foreground">Type at least {MIN_TERM} letters.</p>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-13 text-muted-foreground">
            <Spinner className="size-4" /> Searching
          </div>
        )}

        {!loading && rows && (
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-13 text-muted-foreground">No members match that name.</p>
            ) : (
              rows.map((u, i) => (
                <Button
                  key={u.href + i}
                  variant="ghost"
                  onClick={() => onPick(u)}
                  disabled={!u.uid}
                  className="h-auto w-full justify-start gap-2.5 rounded-none border-b px-4 py-2.5 text-left text-13 font-normal last:border-b-0"
                >
                  <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                  {u.className && <Badge variant="secondary" className="shrink-0 text-10">{u.className}</Badge>}
                </Button>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
