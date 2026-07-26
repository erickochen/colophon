import { useEffect, useState } from 'react'
import {
  BookOpen,
  Bookmark,
  CircleDollarSign,
  Clock3,
  Compass,
  Download,
  Gift,
  HandCoins,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  MessagesSquare,
  Search,
  Sparkles,
  Star,
  Store,
  Ticket,
  TrendingUp,
  Upload,
  UsersRound,
  Vault,
} from 'lucide-react'
import type { ShellData } from '@/lib/extract/shell'
import { isActive } from '@/app/router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { UserMenu } from '@/app/shell/user-menu'

interface NavItem {
  title: string
  href: string
  icon: typeof Search
  badge?: string | number | null
  pin?: boolean // always visible, even on short screens
}
interface NavGroup {
  label: string | null
  items: NavItem[]
}

function groups(page: ShellData): NavGroup[] {
  return [
    { label: null, items: [{ title: 'Dashboard', href: '/', icon: LayoutDashboard, pin: true }] },
    {
      label: 'Discover',
      items: [
        { title: 'Browse', href: '/tor/browse.php', icon: Search, pin: true },
        { title: 'Freeleech picks', href: '/freeleech.php', icon: Sparkles, pin: true },
        { title: 'Top 10', href: '/stats/top10Tor.php', icon: TrendingUp, pin: true },
        { title: 'Book clubs', href: '/tor/bookclubs.php', icon: BookOpen },
        { title: 'Requests', href: '/tor/requests2.php', icon: Gift },
        { title: 'New members', href: '/newUsers.php', icon: UsersRound },
      ],
    },
    {
      label: 'My library',
      items: [
        { title: 'Snatched', href: '/snatch_summary.php', icon: Download, badge: page.stats.unsats || null, pin: true },
        { title: 'Bookmarks', href: '/tor/browse.php?tor[searchIn]=bookmarks&tor[sortType]=bmkaDesc&action=search', icon: Bookmark, pin: true },
        { title: 'My uploads', href: '/tor/browse.php?tor[searchIn]=mine&tor[sortType]=dateDesc&action=search', icon: Upload },
        { title: 'Upload torrent', href: '/tor/requestUpload.php', icon: Compass },
        { title: 'RSS feeds', href: '/getrss.php', icon: Clock3 },
      ],
    },
    {
      label: 'Community',
      items: [
        { title: 'Forum', href: '/f', icon: MessagesSquare, pin: true },
        { title: 'Messages', href: '/messages.php?action=viewmailbox', icon: Mail, badge: page.pmCount || null, pin: true },
        { title: 'Shoutbox', href: '/shoutbox/index.php', icon: LifeBuoy, pin: true },
        { title: 'Friends', href: '/friends.php', icon: Star },
      ],
    },
    {
      label: 'Rewards',
      items: [
        { title: 'Store', href: '/store.php', icon: Store, pin: true },
        { title: "Millionaire's vault", href: '/millionaires/pot.php', icon: Vault },
        { title: 'Lotto', href: '/play_lotto.php', icon: Ticket },
        { title: 'Donate', href: '/don/index.php', icon: HandCoins, badge: page.donationPct, pin: true },
      ],
    },
    {
      label: 'Support',
      items: [
        { title: 'Rules', href: '/rules.php', icon: CircleDollarSign, pin: true },
        { title: 'FAQ & guides', href: '/faq.php', icon: HelpCircle, pin: true },
      ],
    },
  ]
}

// Active row: fill + a short terracotta accent bar (no border, per Reading Room).
const ITEM_ACTIVE =
  'relative transition-colors duration-150 data-[active=true]:bg-brand-soft data-[active=true]:font-medium data-[active=true]:text-brand data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-1/2 data-[active=true]:before:h-4 data-[active=true]:before:w-[3px] data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:rounded-full data-[active=true]:before:bg-brand'

function Badge({ value }: { value: NavItem['badge'] }) {
  if (value == null || value === 0) return null
  return <SidebarMenuBadge className="bg-brand-soft text-accent-foreground">{value}</SidebarMenuBadge>
}

function ItemRow({ item }: { item: NavItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title} className={ITEM_ACTIVE}>
        <a href={item.href}>
          <item.icon />
          <span>{item.title}</span>
        </a>
      </SidebarMenuButton>
      <Badge value={item.badge} />
    </SidebarMenuItem>
  )
}

/** How many NON-pinned items each labelled group reveals, from viewport height.
 * Pinned items always show; on tall screens everything shows (returns null); on
 * short screens only pins remain and the rest fold behind hover. */
function useReveal(groups: { pinned: number; nonPinned: number }[]): number[] | null {
  const [reveal, setReveal] = useState<number[] | null>(null)
  const key = groups.map((g) => `${g.pinned}/${g.nonPinned}`).join(',')
  useEffect(() => {
    const compute = () => {
      const ROW = 34, LABEL = 36, DASHBOARD = 40, CHROME = 196 // header + footer + paddings
      const avail = window.innerHeight - CHROME - DASHBOARD
      const totalItems = groups.reduce((a, g) => a + g.pinned + g.nonPinned, 0)
      if (groups.length * LABEL + totalItems * ROW <= avail) { setReveal(null); return } // all fit
      const totalPins = groups.reduce((a, g) => a + g.pinned, 0)
      let extra = Math.max(0, Math.floor((avail - groups.length * LABEL) / ROW) - totalPins)
      const r = groups.map(() => 0)
      for (let i = 0, guard = 0; extra > 0 && guard < 999; i++, guard++) {
        const k = i % groups.length
        if (r[k] < groups[k].nonPinned) { r[k]++; extra-- }
        if (r.every((v, j) => v === groups[j].nonPinned)) break
      }
      setReveal(r)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [key])
  return reveal
}

/** Pinned items always render; non-pinned render up to `reveal` (Infinity = all);
 * the active item is always kept visible. The rest fold behind a hover overlay. */
function AdaptiveGroup({ group, reveal }: { group: NavGroup; reveal: number }) {
  let np = -1
  const visible = group.items.filter((it) => {
    if (it.pin) return true
    np += 1
    return np < reveal || isActive(it.href)
  })
  const hidden = group.items.length - visible.length

  return (
    <SidebarGroup className="group/sec relative py-1">
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>{group.label}</span>
        {hidden > 0 && <span className="tabular-nums text-sidebar-foreground/45 transition-opacity group-hover/sec:opacity-0">+{hidden}</span>}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => <ItemRow key={item.href} item={item} />)}
        </SidebarMenu>
      </SidebarGroupContent>

      {/* Reveal the section on hover as an overlay, so nothing shifts. Uses the
       * popover surface plus ring-border: bg-sidebar was invisible in dark mode
       * and shadows alone vanish against a near-black panel. */}
      {hidden > 0 && (
        <div className="invisible absolute inset-x-1 top-0 z-40 rounded-xl bg-popover p-1 text-popover-foreground opacity-0 shadow-xl ring-1 ring-border transition-opacity duration-150 group-hover/sec:visible group-hover/sec:opacity-100">
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => <ItemRow key={item.href} item={item} />)}
          </SidebarMenu>
        </div>
      )}
    </SidebarGroup>
  )
}

/** Icon-rail fallback when the sidebar is collapsed to icons. */
function IconRail({ all }: { all: NavGroup[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {all.flatMap((g) => g.items).map((item) => <ItemRow key={item.href} item={item} />)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar({ page }: { page: ShellData }) {
  const { state } = useSidebar()
  const all = groups(page)
  const [dashboard, ...labelled] = all
  const reveal = useReveal(
    labelled.map((g) => ({ pinned: g.items.filter((it) => it.pin).length, nonPinned: g.items.filter((it) => !it.pin).length }))
  )
  const iconMode = state === 'collapsed'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <a
          href="/"
          aria-label="Dashboard"
          className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent/60 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          {/* 16px slot keeps the wordmark on the nav label rail; the 24px mark overhangs it, centred on the icon axis. */}
          <span className="flex size-4 shrink-0 items-center justify-center">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary font-display text-[13px] font-bold text-primary-foreground">M</span>
          </span>
          <span className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-[15px] font-semibold">MyAnonaMouse</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Colophon
              <span className="rounded bg-brand-soft px-1 py-px text-[8.5px] font-semibold uppercase leading-none tracking-wide text-accent-foreground">beta</span>
            </span>
          </span>
        </a>
      </SidebarHeader>

      <SidebarContent>
        {iconMode ? (
          <IconRail all={all} />
        ) : (
          <>
            <SidebarGroup className="py-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  <ItemRow item={dashboard.items[0]} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {labelled.map((g, i) => (
              <AdaptiveGroup key={g.label} group={g} reveal={reveal ? reveal[i] : Number.POSITIVE_INFINITY} />
            ))}
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu page={page} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
