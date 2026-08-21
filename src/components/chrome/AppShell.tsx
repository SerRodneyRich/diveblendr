'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { FiSettings } from 'react-icons/fi'
import {
  HiOutlineBars3,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineEllipsisHorizontal,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { MdAccessibility } from 'react-icons/md'
import { Button, cn } from '@/components/ui'
import MarineBackdrop from '@/components/chrome/MarineBackdrop'
import { UnitsToggle } from '@/components/UnitsToggle'
import { DiveModeToggle, DIVE_MODE_OPTIONS } from '@/components/DiveModeToggle'
import { usePreferences } from '@/contexts/PreferencesContext'
import OpenSourceButton from '@/components/OpenSourceButton'
import {
  findNavItem,
  navGroups,
  navItems,
  navTitle,
  primaryNavItems,
  type NavItem,
} from '@/config/navigation'

// Both touch localStorage on mount, so they must stay out of the prerender.
const PreferencesModal = dynamic(
  () => import('@/components/PreferencesModal').then((m) => m.PreferencesModal),
  { ssr: false }
)
const AccessibilitySettings = dynamic(
  () => import('@/components/AccessibilitySettings').then((m) => m.AccessibilitySettings),
  { ssr: false }
)

function NavBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto rounded-full border border-border-strong bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-text-subtle">
      {children}
    </span>
  )
}

function SidebarLink({
  item,
  active,
  collapsed = false,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  /** Icon-only rail mode. The label becomes the tooltip and the a11y name. */
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      // aria-current is how a screen reader announces "you are here"; the
      // previous menu conveyed the active tool with colour alone.
      aria-current={active ? 'page' : undefined}
      // Collapsed, the visible label is gone, so the accessible name and the
      // native tooltip both have to come from the attributes instead.
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        // 44px on touch, where it is the minimum comfortable target. On a
        // fine pointer the same 44px is what pushed the last three tools below
        // a laptop fold — a finished feature you cannot see is worse than a
        // row you must aim at slightly more carefully, and a mouse is precise.
        'flex min-h-11 items-center rounded-sm text-sm transition-colors motion-reduce:transition-none',
        '[@media(pointer:fine)]:min-h-9',
        collapsed ? 'justify-center px-0' : 'gap-3 px-3',
        active
          ? 'bg-surface-2/80 font-medium text-brand-strong'
          : 'text-text-muted hover:bg-surface-2 hover:text-text'
      )}
    >
      <span aria-hidden="true" className="shrink-0 text-base">
        {item.icon}
      </span>
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </>
      )}
    </Link>
  )
}

/**
 * Application chrome: persistent sidebar on desktop, bottom tab bar on mobile.
 *
 * Replaces the previous arrangement — a hamburger in one corner, a floating FAB
 * stack in another and floating warning icons in a third — where nothing
 * indicated which tool you were in, and menu entries that navigated to a
 * different page looked identical to ones that swapped an in-page tab.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { preferences } = usePreferences()
  const currentDiveMode = DIVE_MODE_OPTIONS.find((o) => o.value === preferences.diveMode)
  /** Mobile: drawer slid in over the content. */
  const [drawerOpen, setDrawerOpen] = useState(false)
  /** Desktop: drawer collapsed to an icon rail. */
  const [collapsed, setCollapsed] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [a11yOpen, setA11yOpen] = useState(false)

  const current = findNavItem(pathname)
  const isActive = (href: string) => current?.href === href

  const utilityActions = (
    <>
      <Button
        variant="ghost"
        iconOnly
        onClick={() => setPrefsOpen(true)}
        aria-label="Preferences"
      >
        <FiSettings className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        iconOnly
        onClick={() => setA11yOpen(true)}
        aria-label="Accessibility settings"
      >
        <MdAccessibility className="h-5 w-5" />
      </Button>
      <OpenSourceButton className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text motion-reduce:transition-none" />
    </>
  )

  return (
    <>
      {/* The docked sidebar's width, published for anything fixed to the
          viewport that must clear it — the message bar is the only such
          element today. Zero below `lg`, where the drawer is an overlay rather
          than part of the layout, and the media query lives in the CSS so the
          value is correct on the very first paint. */}
      <style>{`@media (min-width:1024px){:root{--shell-rail:${collapsed ? '4rem' : '15rem'}}}`}</style>

      <MarineBackdrop />

      {/* Scrim behind the mobile drawer. Desktop never needs it — the rail is
          part of the layout there, not an overlay. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-drawer-scrim bg-abyss/70 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="relative min-h-dvh lg:flex">
      {/*
        One drawer for both breakpoints, rather than a desktop sidebar plus a
        separate mobile sheet. On desktop it is part of the layout and collapses
        to an icon rail; on mobile the same element slides in over the content.
        Same markup, same nav state, one place to change.
      */}
      <aside
        aria-label="Main"
        className={cn(
          'glass fixed inset-y-0 left-0 z-drawer flex h-dvh shrink-0 flex-col border-y-0 border-l-0 border-r border-border',
          // Docked on desktop the 72% glass reads as depth; as a mobile overlay
          // it let the page show straight through the menu. `glass` sets the
          // translucent background as a plain declaration, so this wins on
          // specificity below lg and hands back to it above.
          'max-lg:!bg-surface-1',
          'transition-[transform,width] duration-200 motion-reduce:transition-none',
          'lg:sticky lg:top-0 lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-60',
          // Mobile: off-canvas until opened. Always full width there — an icon
          // rail you cannot hover is not a useful mobile affordance.
          'w-60',
          drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-border',
            collapsed ? 'justify-center px-0' : 'justify-between px-4'
          )}
        >
          {!collapsed && (
            <Link
              href="/"
              onClick={() => setDrawerOpen(false)}
              className="text-h3 font-semibold text-text"
            >
              Dive<span className="text-brand">Blendr</span>
            </Link>
          )}
          {/* Collapse toggle: desktop only. On mobile the drawer is dismissed
              by the scrim or the close button, and a rail is not offered. */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="hidden h-11 w-11 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text motion-reduce:transition-none lg:inline-flex"
          >
            {collapsed ? (
              <HiOutlineChevronDoubleRight className="h-4 w-4" />
            ) : (
              <HiOutlineChevronDoubleLeft className="h-4 w-4" />
            )}
          </button>
          {/* Mobile close */}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text lg:hidden"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Tools" className={cn('flex-1 overflow-y-auto', collapsed ? 'p-2' : 'p-2')}>
          {navGroups.map((group) => {
            const items = navItems.filter((i) => i.group === group.id)
            if (items.length === 0) return null
            return (
              <div key={group.id} className="mb-3 [@media(pointer:fine)]:mb-1.5">
                {/* The group heading is meaningless next to a column of icons,
                    but removing it from the a11y tree would flatten the
                    structure, so it stays as a screen-reader label. */}
                <h2
                  className={cn(
                    'text-[0.6875rem] font-semibold uppercase tracking-wider text-text-subtle',
                    collapsed ? 'sr-only' : 'px-3 py-1.5 [@media(pointer:fine)]:py-1'
                  )}
                >
                  {group.label}
                </h2>
                {collapsed && <div className="mx-2 mb-1 border-t border-border" />}
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <SidebarLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      collapsed={collapsed}
                      onNavigate={() => setDrawerOpen(false)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Units, dive mode and the utility cluster live here, at the foot of
            the drawer — one home each, not duplicated in the page header.
            Both toggles are app-wide facts about the diver that every tool
            reads, so they belong to the chrome rather than to any one page.
            Collapsed, the two selects would be unreadable at 64px, so the rail
            shows only the icon row. */}
        <div className="shrink-0 border-t border-border p-2">
          {!collapsed && (
            <>
              <UnitsToggle className="mb-2 px-1" />
              <DiveModeToggle className="mb-2 px-1" />
            </>
          )}
          <div
            className={cn(
              'flex items-center gap-1',
              collapsed ? 'flex-col' : 'justify-center'
            )}
          >
            {utilityActions}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact header. On desktop it labels the current tool; on mobile it
            is the only always-visible chrome besides the bottom bar. */}
        <header className="glass sticky top-0 z-nav flex h-14 shrink-0 items-center gap-3 border-x-0 border-t-0 border-b border-border px-4">
          {/* Opens the same drawer the desktop renders inline. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text lg:hidden"
          >
            <HiOutlineBars3 className="h-5 w-5" />
          </button>
          <Link href="/" className="text-h3 font-semibold text-text lg:hidden">
            Dive<span className="text-brand">Blendr</span>
          </Link>
          <h1 className="hidden truncate text-h3 font-semibold text-text lg:block">
            {navTitle(pathname)}
          </h1>
          {/* Units live in the sidebar footer on desktop and the More sheet on
              mobile. Dive mode gets a readout here as well, because it changes
              what every tool computes: without it a diver on a phone can plan a
              CCR dive while the page is still answering for open circuit, with
              nothing on screen to say so. Tapping it opens the drawer that
              holds the control. */}
          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-xs font-medium text-text-muted"
            >
              <span className="sr-only">Dive mode: </span>
              {currentDiveMode?.label ?? 'Dive mode'}
            </button>
            <Button
              variant="ghost"
              iconOnly
              onClick={() => setPrefsOpen(true)}
              aria-label="Preferences"
            >
              <FiSettings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Bottom padding on mobile clears the fixed tab bar. */}
        {/* The tab bar is min-h-14 plus the device's safe-area inset, and it is
            fixed, so the content well has to reserve both or the last card
            renders behind it. A flat pb-20 did not cover an iPhone's home
            indicator. */}
        <main
          id="main-content"
          className="min-w-0 flex-1 pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-14"
        >
          {/* 110rem, not 72rem. At 1440px and wider the old cap left ~180px of
              dead gutter each side while the results columns were cramped. */}
          <div className="mx-auto w-full max-w-[110rem] px-3 py-4 md:px-5">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-0 bottom-0 z-nav grid grid-cols-4 border-x-0 border-b-0 border-t border-border lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primaryNavItems.slice(0, 3).map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem]',
                active ? 'text-brand-strong' : 'text-text-muted'
              )}
            >
              <span aria-hidden="true" className="text-lg">
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
        {/* Opens the drawer rather than a second sheet listing the same tools:
            the drawer already carries every entry plus the units and dive-mode
            toggles, so a separate "All tools" modal was a duplicate menu that
            had to be kept in sync with this one. */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="More tools"
          className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] text-text-muted"
        >
          <HiOutlineEllipsisHorizontal aria-hidden="true" className="text-lg" />
          <span>More</span>
        </button>
      </nav>

      <PreferencesModal isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} />
      <AccessibilitySettings isOpen={a11yOpen} onClose={() => setA11yOpen(false)} />
      </div>
    </>
  )
}
