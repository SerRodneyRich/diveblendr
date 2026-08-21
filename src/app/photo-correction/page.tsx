import LegacyToolRedirect from '@/components/chrome/LegacyToolRedirect'

export const metadata = { title: 'Photo editor — DiveBlendr' }

/**
 * Forward shim for the old URL. The editor itself now lives at `/photo/` inside
 * the `(tools)` route group, so it renders in the shared AppShell chrome.
 * This page exists only so bookmarks and inbound links keep working.
 */
export default function PhotoCorrectionRedirect() {
  return <LegacyToolRedirect to="/photo/" label="the photo editor" />
}
