import type { ReactNode } from 'react'
import { BsJournalArrowDown } from 'react-icons/bs'
import { FaLink, FaMagic } from 'react-icons/fa'
import { GiScubaTanks, GiWaterSplash } from 'react-icons/gi'
import { ImHourGlass } from 'react-icons/im'
import { MdOutlineTimer, MdOutlineVerticalAlignBottom } from 'react-icons/md'
import { TbPolaroid, TbRoute } from 'react-icons/tb'

/**
 * The single source of truth for app navigation.
 *
 * Add entries to this array, not to markup: the drawer, its collapsed rail and
 * the mobile bottom bar all render from it. The tool list was once duplicated
 * across NavigationMenu and VerticalMenu, which is why they drifted apart.
 */

export type NavGroup = 'plan' | 'gases' | 'utilities'

export interface NavItem {
  /** Route path. Trailing slash matches the export's `trailingSlash: true`. */
  href: string
  label: string
  /** One line describing what the tool does, shown in menus. */
  description: string
  icon: ReactNode
  group: NavGroup
  /** Small badge, e.g. "Soon" for the not-yet-built planner. */
  badge?: string
  /** Shown in the mobile bottom bar (max 3 + More). */
  primary?: boolean
}

export const navGroups: { id: NavGroup; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'gases', label: 'Gases' },
  { id: 'utilities', label: 'Utilities' },
]

/**
 * The dive planner, kept out of `navItems` until it does something.
 *
 * It sat in the drawer with a "Soon" badge, which cost a permanent row in a
 * menu that already overflowed a laptop viewport — so a real, finished tool
 * (Share card, Photo editor, Links) fell below the fold to make room for one
 * that does nothing yet. The route still exists and still renders; the
 * landing page announces it as coming. Put it back in `navItems` when it
 * plans a dive.
 */
export const upcomingPlanner = {
  href: '/planner/',
  label: 'Dive planner',
  description: 'Decompression schedules with gradient factors',
  icon: <TbRoute />,
} as const

export const navItems: NavItem[] = [
  {
    href: '/gas-planning/',
    label: 'Gas planning',
    description: 'Bottom time, turn pressure and minimum gas',
    icon: <ImHourGlass />,
    group: 'plan',
    primary: true,
  },
  {
    href: '/mix/',
    label: 'Best mix',
    description: 'Find optimal gas mixes for your dive',
    icon: <BsJournalArrowDown />,
    group: 'gases',
    primary: true,
  },
  {
    href: '/mix/check/',
    label: 'MOD check',
    description: 'Verify maximum operating depths',
    icon: <MdOutlineVerticalAlignBottom />,
    group: 'gases',
  },
  {
    href: '/blender/',
    label: 'Gas blender',
    description: 'Partial-pressure and continuous blending',
    icon: <GiScubaTanks />,
    group: 'gases',
    primary: true,
  },
  {
    href: '/sac/',
    label: 'SAC / RMV',
    description: 'Calculate air consumption rates',
    icon: <MdOutlineTimer />,
    group: 'utilities',
  },
  {
    href: '/conditions/',
    label: 'Conditions',
    description: 'Tides, weather and diving conditions',
    icon: <GiWaterSplash />,
    group: 'utilities',
  },
  {
    href: '/photo/',
    label: 'Photo editor',
    description: 'Correct underwater colour casts',
    icon: <FaMagic />,
    group: 'utilities',
  },
  {
    href: '/share/',
    label: 'Share card',
    description: 'Turn a dive log into a shareable graphic',
    icon: <TbPolaroid />,
    group: 'utilities',
  },
  {
    href: '/links/',
    label: 'Links',
    description: 'Useful diving resources and references',
    icon: <FaLink />,
    group: 'utilities',
  },
]

/** Items shown in the mobile bottom bar, before the "More" entry. */
export const primaryNavItems = navItems.filter((i) => i.primary)

/**
 * Resolve the nav item for a pathname, preferring the longest match so
 * `/mix/check/` does not resolve to `/mix/`.
 */
export function findNavItem(pathname: string): NavItem | undefined {
  const normalised = pathname.endsWith('/') ? pathname : `${pathname}/`
  return [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => normalised === i.href || normalised.startsWith(i.href))
}

/** Label for the page header. */
export function navTitle(pathname: string): string {
  const item = findNavItem(pathname)
  if (item) return item.label
  // The landing page. Deliberately not a navItem: findNavItem matches on
  // startsWith, so a '/' entry would match every route and leave the sidebar
  // permanently highlighting Home. The sidebar wordmark is the link there.
  if (pathname === '/' || pathname === '') return 'Home'
  // The planner is a real route with a real page, but it is deliberately out of
  // `navItems` until it plans a dive. Without this it fell through to the app's
  // own name, so its header read "DiveBlendr" instead of naming the tool.
  if (normalisedPath(pathname).startsWith(upcomingPlanner.href)) {
    return upcomingPlanner.label
  }
  return 'DiveBlendr'
}

/** A pathname with the trailing slash this app's routes always carry. */
function normalisedPath(pathname: string): string {
  return pathname.endsWith('/') ? pathname : `${pathname}/`
}
