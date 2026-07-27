import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  BookOpen,
  Bookmark,
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
  Store,
  Ticket,
  TrendingUp,
  Upload,
  Vault,
} from 'lucide-react'
import type { ShellData } from '@/lib/extract/shell'
import { isActive } from '@/app/router'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
  icon?: typeof Search
  badge?: string | number | null
  /** Global demotion order: lower folds into the flyout first on short screens. */
  fold?: number
}
interface NavGroup {
  label: string
  items: NavItem[]
  more: NavItem[]
}

/* Every MAM destination lives here: basics visible, the rest one hover away
 * in the group flyout. Source of truth: dom/home-fresh-2026-07-26.html. */
function groups(page: ShellData): { dashboard: NavItem; groups: NavGroup[] } {
  return {
    dashboard: { title: 'Dashboard', href: '/', icon: LayoutDashboard },
    groups: [
      {
        label: 'Discover',
        items: [
          { title: 'Browse', href: '/tor/browse.php', icon: Search },
          { title: 'Freeleech picks', href: '/freeleech.php', icon: Sparkles },
          { title: 'Top 10', href: '/stats/top10Tor.php', icon: TrendingUp },
          { title: 'Requests', href: '/tor/requests2.php', icon: Gift, fold: 1 },
          { title: 'Book clubs', href: '/tor/bookclubs.php', icon: BookOpen, fold: 3 },
        ],
        more: [
          { title: 'Reseed requests', href: '/tor/search.php?s=%7B%22tor%22%3A%7B%22rr%22%3A%22reseed%22%7D%2C%22searchType%22%3A%22Torrents%22%7D' },
          { title: 'Recently deleted', href: '/tor/recentlyDeleted.php' },
          { title: 'RSS feeds', href: '/getrss.php' },
          { title: 'New search', href: '/tor/search.php', badge: 'beta' },
        ],
      },
      {
        label: 'My library',
        items: [
          { title: 'Snatched', href: '/snatch_summary.php', icon: Download, badge: page.stats.unsats || null },
          { title: 'Bookmarks', href: '/tor/browse.php?tor[searchIn]=bookmarks&tor[sortType]=bmkaDesc&action=search', icon: Bookmark, fold: 4 },
          { title: 'My uploads', href: '/tor/browse.php?tor[searchIn]=mine&tor[sortType]=dateDesc&action=search', icon: Upload, fold: 2 },
        ],
        more: [
          { title: 'Upload torrent', href: '/tor/requestUpload.php' },
          { title: 'Unsats', href: '/snatch_summary.php#unsat', badge: page.stats.unsats || null },
          { title: 'History graph', href: '/stats/userBonusPointHistory.php' },
          { title: 'Client status', href: '/userClientDetails.php' },
          { title: 'Invites', href: '/invite/unconfirmed.php', badge: page.stats.invites || null },
        ],
      },
      {
        label: 'Community',
        items: [
          { title: 'Forum', href: '/f', icon: MessagesSquare },
          { title: 'Messages', href: '/messages.php?action=viewmailbox', icon: Mail, badge: page.pmCount || null },
          { title: 'Shoutbox', href: '/shoutbox/index.php', icon: LifeBuoy },
        ],
        more: [
          { title: 'Friends & blocked', href: '/friends.php' },
          { title: 'Forum subscriptions', href: '/forums/subscriptions.php' },
          { title: 'New members', href: '/newUsers.php' },
          { title: 'IRC chat', href: '/chat.php' },
          { title: 'IRC client help', href: '/chathelp.php' },
        ],
      },
      {
        label: 'Games',
        items: [
          { title: 'Lotto', href: '/play_lotto.php', icon: Ticket },
        ],
        more: [
          { title: 'Hunts', href: '/games/hunts.php' },
          { title: 'Daily challenge', href: '/f/t/11186/p/1' },
          { title: 'Banner competition', href: '/banner/index.php' },
          { title: 'Previous banners', href: '/banner/winners.php' },
          { title: 'Lotto winners', href: '/lotto/winners.php' },
          { title: 'More games', href: '/f/b/9' },
        ],
      },
      {
        label: 'Rewards',
        items: [
          { title: 'Store', href: '/store.php', icon: Store },
          { title: "Millionaire's vault", href: '/millionaires/pot.php', icon: Vault },
          { title: 'Donate', href: '/don/index.php', icon: HandCoins, badge: page.donationPct },
        ],
        more: [
          { title: 'Seedbox donation', href: '/don/index.php?seedbox' },
        ],
      },
      {
        label: 'Support',
        items: [
          { title: 'FAQ & guides', href: '/faq.php', icon: HelpCircle },
        ],
        more: [
          { title: 'Rules', href: '/rules.php' },
          { title: 'Guides', href: '/guides/' },
          { title: 'Allowed clients', href: '/tor/allowed_clients.php' },
          { title: 'Contact staff', href: '/ticket.php/myTickets' },
          { title: 'Bug reports', href: '/f/b/78' },
          { title: 'Feature requests', href: '/f/b/18' },
          { title: 'Staff', href: '/staff.php' },
          { title: 'Site update notes', href: '/updateNotes.php' },
          { title: 'Server status', href: 'https://status.myanonamouse.net' },
          { title: 'API', href: '/api/list.php' },
        ],
      },
    ],
  }
}

/* Fold marked items into their flyout when the viewport cannot hold the
 * full list; the sidebar itself should never need a scrollbar. Steps one
 * item per render against measured overflow, with hysteresis on unfold. */
function useFoldCount(ref: RefObject<HTMLDivElement | null>, max: number): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const step = () => {
      const short = el.scrollHeight - el.clientHeight
      const last = el.lastElementChild?.getBoundingClientRect().bottom ?? 0
      const slack = el.getBoundingClientRect().bottom - last
      setCount((c) => (short > 0 && c < max ? c + 1 : short <= 0 && slack > 72 && c > 0 ? c - 1 : c))
    }
    step()
    const ro = new ResizeObserver(step)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, max, count])
  return count
}

// Active row: soft fill plus accent text only.
const ITEM_ACTIVE =
  'transition-colors duration-150 data-[active=true]:bg-brand-soft data-[active=true]:font-medium data-[active=true]:text-brand'

function Badge({ value }: { value: NavItem['badge'] }) {
  if (value == null || value === 0) return null
  return (
    <SidebarMenuBadge className="bg-transparent font-mono text-[11px] font-normal text-sidebar-foreground/60">
      {value}
    </SidebarMenuBadge>
  )
}

function ItemRow({ item }: { item: NavItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title} className={ITEM_ACTIVE}>
        <a href={item.href}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
        </a>
      </SidebarMenuButton>
      <Badge value={item.badge} />
    </SidebarMenuItem>
  )
}

/* Group header opens a flyout with the rest of the section: everything stays
 * one hover or click away without accordion state or a hub page. */
function GroupFlyout({ group }: { group: NavGroup }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={120}
        className="group/head flex w-full items-center justify-between rounded-md px-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <SidebarGroupLabel className="px-0 group-hover/head:text-sidebar-foreground">
          {group.label}
        </SidebarGroupLabel>
        <ChevronRight className="size-3 text-sidebar-foreground/35 transition-[opacity,translate,color] duration-200 group-hover/head:translate-x-0.5 group-hover/head:text-brand" />
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={10} className="w-52 p-1.5">
        <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          More in {group.label}
        </div>
        {group.more.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/60"
          >
            {item.title}
            {item.badge != null && item.badge !== 0 && (
              <span className="font-mono text-[11px] text-muted-foreground">{item.badge}</span>
            )}
          </a>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function NavSection({ group }: { group: NavGroup }) {
  return (
    <SidebarGroup className="py-1">
      <GroupFlyout group={group} />
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => <ItemRow key={item.href} item={item} />)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/** Icon-rail fallback when the sidebar is collapsed to icons. */
function IconRail({ dashboard, sections }: { dashboard: NavItem; sections: NavGroup[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <ItemRow item={dashboard} />
          {sections.flatMap((g) => g.items).map((item) => <ItemRow key={item.href} item={item} />)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar({ page }: { page: ShellData }) {
  const { state } = useSidebar()
  const nav = groups(page)
  const iconMode = state === 'collapsed'

  const contentRef = useRef<HTMLDivElement>(null)
  const maxFold = nav.groups.reduce((n, g) => n + g.items.filter((it) => it.fold != null).length, 0)
  const foldCount = useFoldCount(contentRef, maxFold)
  const folded = nav.groups
    .flatMap((g) => g.items.filter((it) => it.fold != null).map((it) => ({ group: g.label, it })))
    .sort((a, b) => (a.it.fold ?? 0) - (b.it.fold ?? 0))
    .slice(0, foldCount)
  const foldedSet = new Set(folded.map((f) => f.it.href))
  const shown = nav.groups.map((g) => ({
    ...g,
    items: g.items.filter((it) => !foldedSet.has(it.href)),
    more: [...folded.filter((f) => f.group === g.label).map((f) => f.it), ...g.more],
  }))

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

      <SidebarContent ref={contentRef}>
        {iconMode ? (
          <IconRail dashboard={nav.dashboard} sections={nav.groups} />
        ) : (
          <>
            <SidebarGroup className="py-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  <ItemRow item={nav.dashboard} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {shown.map((g) => <NavSection key={g.label} group={g} />)}
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
