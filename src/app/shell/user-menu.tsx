import { useState } from 'react'
import { ChevronsUpDown, Crown, History, LogOut, Radio, Settings2, TrendingUp, UserRound } from 'lucide-react'
import type { ShellData } from '@/lib/extract/shell'
import { protocolNote } from '@/app/shell/bits'
import { fmtRatio } from '@/lib/format'
import { useLiveBonus, useLiveWedges } from '@/lib/bonus'
import { useVipUntil } from '@/lib/vip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

function StatusDot({ page, className }: { page: ShellData; className?: string }) {
  const connectable = page.client.ipv4.connectable === true || page.client.ipv6.connectable === true
  if (page.client.ipv4.connectable == null) return null
  return (
    <span
      title={`IPv4: ${protocolNote(page.client.ipv4)}\nIPv6: ${protocolNote(page.client.ipv6)}`}
      className={
        'size-2 shrink-0 rounded-full ' + (connectable ? 'bg-ok-fill ring-1 ring-foreground/20' : 'bg-transparent ring-1 ring-muted-foreground/60') + (className ? ' ' + className : '')
      }
    />
  )
}

export function UserMenu({ page }: { page: ShellData }) {
  const profile = page.user.uid ? `/u/${page.user.uid}` : '/preferences/index.php'
  const bonus = useLiveBonus(page.stats.bonus)
  const wedges = useLiveWedges(page.stats.wedges)
  const [opened, setOpened] = useState(false)
  const vipUntil = useVipUntil(page.user.uid, opened)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => open && setOpened(true)}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={page.user.name}
              className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
            >
              {/* Collapsed rail: just the status dot as the affordance. */}
              <StatusDot page={page} className="hidden group-data-[collapsible=icon]:block" />
              <span className="grid flex-1 gap-0.5 leading-tight group-data-[collapsible=icon]:hidden">
                <span className="flex items-center gap-1.5">
                  <StatusDot page={page} />
                  <span className="truncate text-[13px] font-semibold">{page.user.name}</span>
                  {page.user.klass && (
                    <span className="shrink-0 rounded bg-brand-soft px-1.5 py-px text-[10px] font-medium text-accent-foreground">
                      {page.user.klass}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <TrendingUp className="size-3 text-ok" />
                  <span className="tabular-nums">{fmtRatio(page.stats.ratio)}</span>
                  <span className="text-muted-foreground">ratio</span>
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64">
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="grid gap-0.5 px-2 py-2 leading-tight">
                <span className="flex items-center gap-1.5">
                  <StatusDot page={page} />
                  <span className="truncate text-[13px] font-semibold">{page.user.name}</span>
                  {page.user.klass && <span className="text-[11px] font-normal text-muted-foreground">{page.user.klass}</span>}
                </span>
                <span className="truncate text-[11.5px] text-muted-foreground">
                  ↑ {page.stats.uploaded ?? '–'} · ↓ {page.stats.downloaded ?? '–'}
                </span>
                {vipUntil && (
                  <span className="flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
                    <Crown className="size-3 text-brand" />
                    VIP until {vipUntil}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="grid grid-cols-3 gap-1 px-2 py-1.5 text-center">
              {[
                ['Bonus', bonus],
                ['Wedges', wedges],
                ['Ratio', fmtRatio(page.stats.ratio)],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md bg-muted/60 py-1.5">
                  <div className="text-[12.5px] font-semibold tabular-nums">{value ?? '–'}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href={profile}><UserRound /> My profile</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/preferences/index.php"><Settings2 /> Preferences</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/userClientDetails.php"><Radio /> Client status</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/stats/userBonusPointHistory.php"><History /> Points history</a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild variant="destructive">
              <a href="/logout.php"><LogOut /> Log out</a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
