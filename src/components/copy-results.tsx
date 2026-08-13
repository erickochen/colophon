// Copies the fetched page as plain text, the MAM+ plaintext feature. On purpose
// this takes the raw page, not the visually filtered subset.
import { Copy } from 'lucide-react'
import { plaintextResults, type PlaintextRow } from '@/lib/plaintext'
import { useFeature } from '@/lib/settings'
import { fmtInt } from '@/lib/format'
import { TRIGGER } from '@/components/filters'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'

export function CopyResultsButton({ rows, decode, asMenuItem }: { rows: PlaintextRow[]; decode?: boolean; asMenuItem?: boolean }) {
  const [on] = useFeature('plainCopy')
  if (!on) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintextResults(rows, { decode }))
      toast.success(`Copied ${rows.length} result${rows.length === 1 ? '' : 's'}`)
    } catch {
      toast.error('The clipboard did not take it. Try again.')
    }
  }

  if (asMenuItem) {
    return (
      <DropdownMenuItem disabled={rows.length === 0} onClick={() => void copy()}>
        <Copy />
        Copy {rows.length > 0 ? fmtInt(rows.length) : ''} as text
      </DropdownMenuItem>
    )
  }

  return (
    <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => void copy()} className={TRIGGER}>
      <Copy className="size-3.5 text-muted-foreground" />
      Copy as text
    </Button>
  )
}
