import AppShell from '@/components/chrome/AppShell'

/**
 * Shared chrome for every tool route.
 *
 * Because this is a layout rather than per-page markup, navigating between
 * tools with `next/link` keeps the React tree — and therefore all four context
 * providers and their state — mounted. The previous cross-page navigation used
 * `window.location.href`, which was a full document reload that discarded
 * everything the user had entered.
 */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
