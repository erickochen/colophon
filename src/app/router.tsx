import type { ComponentType } from 'react'
import type { ShellData } from '@/lib/extract/shell'
import { HomeView } from '@/app/pages/home'
import { BrowseView } from '@/app/pages/browse'
import { TorrentView } from '@/app/pages/torrent'
import { MediaInfoPageView } from '@/app/pages/media-info'
import { LegacyView } from '@/app/pages/legacy'
import { ForumIndexView } from '@/app/pages/forum-index'
import { ForumBoardView } from '@/app/pages/forum-board'
import { ForumTopicView } from '@/app/pages/forum-topic'
import { MessagesView } from '@/app/pages/messages'
import { ComposeMessageView } from '@/app/pages/compose-message'
import { ProfileView } from '@/app/pages/profile'
import { ShoutboxView } from '@/app/pages/shoutbox'
import { DocView, GuideView } from '@/app/pages/doc'
import { PreferencesView } from '@/app/pages/preferences'
import { StoreView } from '@/app/pages/store'
import { RequestsView } from '@/app/pages/requests'
import { Top10View } from '@/app/pages/top10'
import { FreeleechView } from '@/app/pages/freeleech'
import { SnatchedView } from '@/app/pages/snatched'
import { SimpleFormView } from '@/app/pages/simple-form'
import { RequestDetailView } from '@/app/pages/request-detail'
import { ClientStatusView } from '@/app/pages/client-status'
import { BonusHistoryView } from '@/app/pages/bonus-history'
import { SubscriptionCleanView, SubscriptionNewPostsView, SubscriptionsView } from '@/app/pages/subscriptions'
import { GuidesView } from '@/app/pages/guides'
import { DonateView } from '@/app/pages/donate'
import { RssView } from '@/app/pages/rss'
import { ChatView } from '@/app/pages/chat'
import { RulesView, FaqView } from '@/app/pages/knowledge'
import { MillionaireVaultView } from '@/app/pages/millionaire-vault'
import { BookClubsView } from '@/app/pages/bookclubs'
import { LottoView } from '@/app/pages/lotto'
import { NewMembersView } from '@/app/pages/newmembers'
import { FriendsView } from '@/app/pages/friends'
import { StaffView } from '@/app/pages/staff'
import { LottoWinnersView } from '@/app/pages/lotto-winners'
import { HuntsView } from '@/app/pages/hunts'
import { BannerWinnersView } from '@/app/pages/banner-winners'
import { RecentlyDeletedView, PeersView, UserHistoryView, MediaTypesView, CategoriesView } from '@/app/pages/legacy-tables'
import { InvitesView, SendInviteView } from '@/app/pages/invites'
import { AllowedClientsView } from '@/app/pages/allowed-clients'
import { PostsHistoryView } from '@/app/pages/posts-history'
import { TicketsView, TicketDetailView } from '@/app/pages/tickets'
import { UnreadTopicsView, DailyPostsView } from '@/app/pages/forum-lists'
import { ForumSearchView } from '@/app/pages/forum-search'
import { ForumComposeView, ForumPostEditView } from '@/app/pages/forum-compose'
import { BugReportView } from '@/app/pages/bug-report'
import { UsersView } from '@/app/pages/users'
import { TagsView, SmiliesView } from '@/app/pages/reference'

export interface PageProps {
  page: ShellData
  host: HTMLElement
}

export interface Route {
  id: string
  View: ComponentType<PageProps>
}

const DOC_PAGES = new Set([
  '/updateNotes.php',
  '/chathelp.php',
  '/api/list.php',
  '/games/hunt.php',
])

const SIMPLE_FORM_PAGES = new Set([
  '/tor/requestUpload.php',
  '/tor/editRequest.php',
  '/millionaires/donate.php',
  '/comment.php',
  '/banner/index.php',
  '/tor/newRequest.php',
])

export function resolveRoute(loc: Location): Route {
  const p = loc.pathname
  if (p === '/' || p === '/index.php') return { id: 'home', View: HomeView }
  if (p === '/tor/browse.php') return { id: 'browse', View: BrowseView }
  if (/^\/t\/r\//.test(p)) return { id: 'request-detail', View: RequestDetailView }
  if (/^\/t\/m\/\d+/.test(p)) return { id: 'media-info', View: MediaInfoPageView }
  if (/^\/t\/\d+/.test(p)) return { id: 'torrent', View: TorrentView }
  if (p === '/f' || p === '/f/' || /^\/f\/o\/\d+/.test(p)) return { id: 'forum', View: ForumIndexView }
  if (p === '/forums.php') {
    // /forums.php carries several actions: only the plain view is a board.
    // newtopic is a compose form, the rest are topic listings.
    const action = new URLSearchParams(loc.search).get('action')
    if (action === 'newtopic') return { id: 'forum-compose', View: ForumComposeView }
    if (action === 'editpost') return { id: 'forum-edit', View: ForumPostEditView }
    if (action === 'viewunread') return { id: 'unread', View: UnreadTopicsView }
    if (action === 'getdaily') return { id: 'daily', View: DailyPostsView }
    return { id: 'board', View: ForumBoardView }
  }
  if (/^\/f\/b\/\d+/.test(p) || p === '/forums/viewForum.php') return { id: 'board', View: ForumBoardView }
  if (p === '/f/s' || p === '/f/search.php' || p === '/forums/search.php') return { id: 'forum-search', View: ForumSearchView }
  if (p === '/forums/bugReport.php') return { id: 'bug-report', View: BugReportView }
  if (p === '/users.php') return { id: 'users', View: UsersView }
  if (p === '/tags.php') return { id: 'tags', View: TagsView }
  if (p === '/smilies.php') return { id: 'smilies', View: SmiliesView }
  if (p === '/tor/upload.php') return { id: 'simple-form', View: SimpleFormView }
  if (p === '/tor/search.php') return { id: 'browse', View: BrowseView }
  if (/^\/f\/t\/\d+/.test(p)) return { id: 'topic', View: ForumTopicView }
  if (p === '/messages.php') return { id: 'messages', View: MessagesView }
  if (p === '/sendmessage.php') return { id: 'compose-message', View: ComposeMessageView }
  if (/^\/u\/\d+/.test(p) || p === '/userdetails.php') return { id: 'profile', View: ProfileView }
  if (p.startsWith('/shoutbox/')) return { id: 'shoutbox', View: ShoutboxView }
  if (p === '/preferences/index.php') return { id: 'preferences', View: PreferencesView }
  if (p === '/store.php') return { id: 'store', View: StoreView }
  if (p === '/tor/requests2.php' || p === '/tor/requests.php') return { id: 'requests', View: RequestsView }
  if (p === '/stats/top10Tor.php') return { id: 'top10', View: Top10View }
  if (p === '/freeleech.php') return { id: 'freeleech', View: FreeleechView }
  if (p === '/snatch_summary.php') return { id: 'snatched', View: SnatchedView }
  if (p === '/userClientDetails.php') return { id: 'client-status', View: ClientStatusView }
  if (p === '/stats/userBonusPointHistory.php') return { id: 'bonus-history', View: BonusHistoryView }
  if (/^\/forums\/subscriptions\.php\/(newposts|doclean)/i.test(p)) {
    return { id: 'subscription-new-posts', View: SubscriptionNewPostsView }
  }
  if (/^\/forums\/subscriptions\.php\/clean/i.test(p)) {
    return { id: 'subscription-clean', View: SubscriptionCleanView }
  }
  if (p.startsWith('/forums/subscriptions.php')) return { id: 'subscriptions', View: SubscriptionsView }
  if (p === '/guides/' || p === '/guides/index.php') {
    return new URLSearchParams(loc.search).has('gid') ? { id: 'guide', View: GuideView } : { id: 'guides', View: GuidesView }
  }
  if (p === '/millionaires/pot.php') return { id: 'vault', View: MillionaireVaultView }
  if (p === '/tor/bookclubs.php') return { id: 'bookclubs', View: BookClubsView }
  if (p === '/play_lotto.php') return { id: 'lotto', View: LottoView }
  if (p === '/newUsers.php') return { id: 'newmembers', View: NewMembersView }
  if (p === '/friends.php') return { id: 'friends', View: FriendsView }
  if (p === '/staff.php') return { id: 'staff', View: StaffView }
  if (p === '/lotto/winners.php') return { id: 'lotto-winners', View: LottoWinnersView }
  if (p === '/games/hunts.php') return { id: 'hunts', View: HuntsView }
  if (p === '/banner/winners.php') return { id: 'banner-winners', View: BannerWinnersView }
  if (p === '/invite/unconfirmed.php') return { id: 'invites', View: InvitesView }
  if (p === '/invite/send.php') return { id: 'invite-send', View: SendInviteView }
  if (p === '/tor/recentlyDeleted.php') return { id: 'recently-deleted', View: RecentlyDeletedView }
  if (p === '/tor/peers.php') return { id: 'peers', View: PeersView }
  if (p === '/userhistory.php') {
    return new URLSearchParams(loc.search).get('action') === 'viewposts'
      ? { id: 'posts-history', View: PostsHistoryView }
      : { id: 'user-history', View: UserHistoryView }
  }
  if (p === '/tor/mediaType.php') return { id: 'media-types', View: MediaTypesView }
  if (p === '/tor/category.php') return { id: 'categories', View: CategoriesView }
  if (p === '/tor/allowed_clients.php') return { id: 'allowed-clients', View: AllowedClientsView }
  if (p === '/don/index.php') return { id: 'donate', View: DonateView }
  if (p === '/getrss.php') return { id: 'rss', View: RssView }
  if (p === '/chat.php') return { id: 'chat', View: ChatView }
  if (p === '/rules.php') return { id: 'rules', View: RulesView }
  if (p === '/faq.php') return { id: 'faq', View: FaqView }
  if (SIMPLE_FORM_PAGES.has(p) || [...SIMPLE_FORM_PAGES].some((s) => p.startsWith(s + '/'))) {
    return { id: 'simple-form', View: SimpleFormView }
  }
  if (p === '/ticket.php/myTickets' || p === '/ticket.php' || p === '/ticket.php/') {
    return { id: 'tickets', View: TicketsView }
  }
  if (p.startsWith('/ticket.php/ticket/')) return { id: 'ticket-detail', View: TicketDetailView }
  if (p === '/ticket.php/newTicket') return { id: 'simple-form', View: SimpleFormView }
  if (p.startsWith('/ticket.php')) return { id: 'doc', View: DocView }
  if (DOC_PAGES.has(p)) return { id: 'doc', View: DocView }
  return { id: 'legacy', View: LegacyView }
}

// Sidebar entries sharing a pathname, told apart by a query param: Browse,
// Bookmarks and uploads all live on /tor/browse.php. A missing param means the
// listed default. Only genuine selectors belong here, never incidental ones
// like sort or the highlight drops the moment the list is re-sorted.
const ACTIVE_DISCRIMINATORS: Record<string, string> = {
  'tor[searchIn]': 'torrents',
}

/** Current-page check for sidebar highlighting. */
export function isActive(href: string, loc: Location = location): boolean {
  const target = new URL(href, loc.origin)
  if (target.pathname === '/') return loc.pathname === '/' || loc.pathname === '/index.php'
  const samePath = loc.pathname === target.pathname || loc.pathname.startsWith(target.pathname + '/')
  if (!samePath) return false
  const cur = new URLSearchParams(loc.search)
  for (const [key, fallback] of Object.entries(ACTIVE_DISCRIMINATORS)) {
    const linkVal = target.searchParams.get(key)
    const curVal = cur.get(key)
    // Only enforce when this link (or the current URL) actually names the
    // discriminator; otherwise unrelated pages are unaffected.
    if (linkVal !== null || curVal !== null) {
      if ((linkVal ?? fallback) !== (curVal ?? fallback)) return false
    }
  }
  return true
}
