import LegacyToolRedirect from '@/components/chrome/LegacyToolRedirect'

export const metadata = { title: 'Marine conditions — DiveBlendr' }

/**
 * Forward shim for the old URL. The tool itself now lives at `/conditions/`
 * inside the `(tools)` route group, so it renders in the shared AppShell chrome.
 * This page exists only so bookmarks and inbound links keep working.
 */
export default function MarineConditionsRedirect() {
  return <LegacyToolRedirect to="/conditions/" label="marine conditions" />
}
