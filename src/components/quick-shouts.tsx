// Saved shout snippets behind one composer button, the MAM+ quick shout idea.
import { useState } from 'react'
import { Check, MoreHorizontal, Pencil, Trash2, Zap } from 'lucide-react'
import { QUICK_SHOUT_CAP, useFeature, useQuickShouts } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'
import { NO_AUTOFILL } from '@/lib/autofill'

export function QuickShouts({ draft, onInsert }: { draft: string; onInsert: (text: string) => void }) {
  const [on] = useFeature('quickShout')
  const { list, save, remove, rename } = useQuickShouts()
  const [open, setOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null)
  if (!on) return null

  function saveCurrent() {
    const name = saveName.trim()
    if (!name || !draft.trim()) return
    if (!save(name, draft)) {
      toast.warning(`You already have ${QUICK_SHOUT_CAP} saved shouts. Delete one first.`)
      return
    }
    setSaveName('')
    toast.success(`Saved "${name}"`)
  }

  function commitRename() {
    if (!renaming) return
    const to = renaming.to.trim()
    if (to && to !== renaming.from && !rename(renaming.from, to)) {
      toast.warning('That name is taken.')
      return
    }
    setRenaming(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Saved shouts"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Zap className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Saved shouts</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[19rem] p-0">
        <div className="border-b px-3 py-2 text-12 font-medium">Saved shouts</div>
        <div className="max-h-64 overflow-y-auto">
          <div className="grid p-1">
            {list.map((s) =>
              renaming?.from === s.name ? (
                <div key={s.name} className="flex items-center gap-1 px-1 py-0.5">
                  <Input
                    {...NO_AUTOFILL}
                    autoFocus
                    value={renaming.to}
                    onChange={(e) => setRenaming({ from: s.name, to: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    aria-label={`New name for ${s.name}`}
                    className="h-8 flex-1 text-12-5"
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="Keep this name" className="size-8" onClick={commitRename}>
                    <Check className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <div key={s.name} className="group flex items-center gap-1 rounded-md px-1 hover:bg-muted">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      onInsert(s.text)
                      setOpen(false)
                    }}
                    className="h-auto min-w-0 flex-1 flex-col items-start gap-0 px-1.5 py-1.5 text-left font-normal hover:bg-transparent"
                  >
                    <span className="block w-full truncate text-12-5 font-medium">{s.name}</span>
                    <span className="block w-full truncate text-11-5 text-muted-foreground">{s.text}</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${s.name}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <MoreHorizontal className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRenaming({ from: s.name, to: s.name })}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => remove(s.name)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            )}
            {list.length === 0 && (
              <p className="px-2.5 py-6 text-center text-12 text-muted-foreground">
                No saved shouts yet. Type a shout, then save it here. Saved shouts stay in this
                browser; the settings export backs them up.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 border-t p-2">
          <Input
            {...NO_AUTOFILL}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCurrent()}
            placeholder="Save current text as…"
            aria-label="Name for the current text"
            disabled={!draft.trim()}
            className="h-8 flex-1 text-12-5"
          />
          <Button type="button" size="sm" className="h-8 text-12-5" disabled={!draft.trim() || !saveName.trim()} onClick={saveCurrent}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
