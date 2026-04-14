'use client'

import { useState } from 'react'
import { HiX, HiExternalLink } from 'react-icons/hi'
import { FaGithub, FaCode, FaBug, FaPlus, FaCog } from 'react-icons/fa'

interface WhatsNewModalProps {
  isOpen: boolean
  onClose: () => void
}

interface Commit {
  hash: string
  date: string
  author: string
  title: string
  description: string
  type: 'feature' | 'fix' | 'enhancement' | 'security' | 'performance'
  files: string[]
  impact: 'major' | 'minor' | 'patch'
}

const recentCommits: Commit[] = [
  {
    hash: 'pending',
    date: '2026-04-14T00:00:00+00:00',
    author: 'Claude Code Assistant',
    title: 'Fix Static Export Prerender Crash (a[d] is not a function)',
    description: 'Fixed a recurring webpack runtime error during static export prerender that caused random pages to fail with "TypeError: a[d] is not a function". Root cause was outputFileTracingRoot: import.meta.dirname in next.config.js, which confused Next.js 15.5.2&apos;s worker pool chunk tracing during static export. Also removed redundant ClientProviders wrappers from calculator and marine-conditions pages (providers are already supplied by the root LayoutClient), and converted fragile dynamic({ ssr: false }) named-export imports of WhatsNewButton and PreferencesModal into direct imports for a simpler client boundary.',
    type: 'fix',
    files: [
      'next.config.js',
      'src/app/page.tsx',
      'src/app/calculator/page.tsx',
      'src/app/marine-conditions/page.tsx',
      'src/components/TankSelector.tsx',
      'src/components/NavigationMenu.tsx'
    ],
    impact: 'major'
  },
  {
    hash: 'prev-pending',
    date: '2026-04-13T00:00:00+00:00',
    author: 'Claude Code Assistant',
    title: 'Open Source Release — Remove Stripe & Analytics UI, Add GitHub Contribution Modal',
    description: 'Prepared DiveBlendr for public open-source release. Removed Stripe donation integration (DonateButton, DonateModal, thank-you page). Removed Analytics and Feedback menu items from VerticalMenu. Replaced Feedback button with new OpenSourceButton modal explaining how to contribute via GitHub (issues, forks, PRs). Added open-source banner to main landing page. Backend page-view tracking (GA4, GoatCounter, Vercel Analytics) preserved.',
    type: 'feature',
    files: [
      'src/components/OpenSourceButton.tsx',
      'src/components/VerticalMenu.tsx',
      'src/app/page.tsx',
      'src/components/WhatsNewModal.tsx'
    ],
    impact: 'major'
  },
  {
    hash: 'f655d7c',
    date: '2026-04-11T00:00:00+00:00',
    author: 'Claude Code Assistant',
    title: 'Sitewide Preferences, Open Source Readiness & Calculation Improvements',
    description: 'Major platform update: Added sitewide diver preferences system with dive mode/gas type defaults, configurable safety limits (PPO\u2082, gas density, END), and custom tank management. Full JSON backup/restore for all user preferences. Migrated all hardcoded API keys (reCAPTCHA, EmailJS, GA4, GoatCounter, Stripe) to environment variables for open-source readiness. Improved gas density calculations with water temperature correction. Added oxygen narcosis model toggle (NOAA/DCIEM vs IANTD/GUE). Added NOAA CNS\u0025 single-dive estimate display. UI polish: reusable SliderWithInput component, mobile-responsive analysis grid, severity-based warning borders, custom tank badges and default tank star indicator in TankSelector. Preferences gear icon added to navigation menu.',
    type: 'feature',
    files: [
      'src/contexts/PreferencesContext.tsx',
      'src/utils/preferencesBackup.ts',
      'src/components/PreferencesModal.tsx',
      'src/components/NavigationMenu.tsx',
      'src/components/TankSelector.tsx',
      'src/components/AnalysisResults.tsx',
      'src/utils/endModCalculations.ts',
      'src/components/ui/SliderWithInput.tsx',
      'src/app/layout.tsx',
      '.env.example'
    ],
    impact: 'major'
  },
  {
    hash: '65dd918',
    date: '2025-10-06T09:08:03+07:00',
    author: 'Claude Code Assistant',
    title: 'PWA Offline Mode Enhancement',
    description: 'Fixed offline mode to fallback faster.  Massively improved load times.',
    type: 'enhancement',
    files: ['next.config.js', 'src/components/PWANetworkStatus.tsx', 'src/app/layout.tsx', 'public/sw.js'],
    impact: 'major'
  },
  {
    hash: '0ca1c61',
    date: '2025-09-26T19:00:00+08:00',
    author: 'RodneyRich',
    title: 'Major Platform Enhancement: Accessibility, Units & Marine Features',
    description: 'Comprehensive platform upgrade featuring: Accessibility system with new AccessibilityContext, settings panel, and enhanced focus/contrast options. Complete units conversion system (metric/imperial) with UnitsContext and toggle component. Requires some fine-tuning still. Added favorites system to Marine Conditions. New consolidated toolbar with PWA installation, audits modal, and vertical menu',
    type: 'feature',
    files: ['contexts/AccessibilityContext.tsx', 'contexts/UnitsContext.tsx', 'contexts/FavoritesContext.tsx', 'components/UnitsToggle.tsx', 'components/AccessibilityToolbar.tsx', 'components/PWAButton.tsx', 'components/VerticalMenu.tsx', 'marine-conditions/page.tsx', 'utils/unitConversions.ts', 'layout.tsx'],
    impact: 'major'
  },
  {
    hash: '68358ee',
    date: '2025-09-15T20:00:00+08:00',
    author: 'Claude Code Assistant',
    title: 'Security Audit & What\'s New System',
    description: 'Comprehensive security audit revealing excellent 9.5/10 security rating. Added SecurityModal with detailed audit findings and WhatsNewModal with timezone-aware GitHub commit tracking. Enhanced GPR file handling with educational user guidance. Implemented pre-commit automation process.',
    type: 'security',
    files: ['SecurityModal.tsx', 'WhatsNewModal.tsx', 'ImageUploader.tsx', 'CLAUDE.md', 'page.tsx'],
    impact: 'major'
  },
  {
    hash: '226cbcd',
    date: '2025-09-14T18:16:16+08:00',
    author: 'Claude Code Assistant',
    title: 'SEO Enhancement Package',
    description: 'Comprehensive SEO improvements including enhanced metadata, structured data, hidden content for search engines, and updated sitemap. Added 35+ technical diving keywords and schema.org markup for better discoverability.',
    type: 'enhancement',
    files: ['sitemap-0.xml', 'layout.tsx', 'metadata.ts', 'page.tsx', 'calculator/page.tsx'],
    impact: 'major'
  },
  {
    hash: '9de7f55',
    date: '2025-09-14T13:21:46+08:00',
    author: 'SerRodneyRich',
    title: 'Fixed END and MOD Calculations',
    description: 'Critical fix for Equivalent Narcotic Depth and Maximum Operating Depth calculations. Added comprehensive gas density analysis, improved safety margin calculations, and enhanced technical diving accuracy.',
    type: 'fix',
    files: ['endModCalculations.ts', 'ModCheckResults.tsx', 'RecommendationCard.tsx', 'GasBlender.tsx'],
    impact: 'major'
  },
  {
    hash: '4729c87',
    date: '2025-09-14T13:21:42+08:00',
    author: 'SerRodneyRich',
    title: 'ESLint Configuration Fix',
    description: 'Resolved ESLint configuration issues and updated Next.js config for better development experience and code quality enforcement.',
    type: 'fix',
    files: ['eslint.config.js', 'next.config.js'],
    impact: 'minor'
  },
  {
    hash: '9d67c38',
    date: '2025-09-13T12:25:59+08:00',
    author: 'SerRodneyRich & Claude',
    title: 'Marine Conditions Feature Launch',
    description: 'Major new feature: Real-time marine conditions with global weather data, tide charts, diving condition scoring, and mobile-optimized interface. Includes lazy loading for performance optimization.',
    type: 'feature',
    files: ['marine-conditions/page.tsx', 'TideChart.tsx', 'DivingConditionScore.tsx', 'loading.tsx'],
    impact: 'major'
  },
  {
    hash: '57aaec7',
    date: '2025-09-12T15:30:00+08:00',
    author: 'SerRodneyRich',
    title: 'MathJax Mobile PWA Reliability',
    description: 'Improved MathJax loading reliability for mobile Progressive Web App installations, ensuring mathematical formulas display correctly across all devices.',
    type: 'fix',
    files: ['MathJax.tsx'],
    impact: 'minor'
  },
  {
    hash: 'bfcfed3',
    date: '2025-09-12T14:20:00+08:00',
    author: 'SerRodneyRich',
    title: 'Critical Input Field Fallback Fix',
    description: 'Fixed critical fallback issue in gas calculators that could cause incorrect calculations. Enhanced input validation and error handling for safer gas mixing calculations.',
    type: 'fix',
    files: ['gas calculators'],
    impact: 'major'
  },
  {
    hash: '02aa340',
    date: '2025-09-12T10:15:00+08:00',
    author: 'SerRodneyRich',
    title: 'Navigation Menu Icons & Photo Editor UI',
    description: 'Added intuitive icons to navigation menu items and improved photo editor user interface for better usability and visual clarity.',
    type: 'enhancement',
    files: ['NavigationMenu.tsx', 'photo editor components'],
    impact: 'minor'
  },
  {
    hash: 'b146417',
    date: '2025-09-11T16:45:00+08:00',
    author: 'SerRodneyRich',
    title: 'Photo Correction Tool Launch',
    description: 'First release of underwater photo correction tool with GoPro presets, color correction algorithms, and batch processing capabilities.',
    type: 'feature',
    files: ['photo-correction', 'PhotoCorrectionTab.tsx'],
    impact: 'major'
  }
]

function getTypeIcon(type: Commit['type']) {
  switch (type) {
    case 'feature': return <FaPlus className="text-green-400" />
    case 'fix': return <FaBug className="text-red-400" />
    case 'enhancement': return <FaCog className="text-blue-400" />
    case 'security': return <FaCode className="text-purple-400" />
    case 'performance': return <FaCode className="text-yellow-400" />
    default: return <FaCode className="text-gray-400" />
  }
}

function getImpactBadge(impact: Commit['impact']) {
  const colors = {
    major: 'bg-red-500/20 text-red-300 border-red-400/30',
    minor: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30',
    patch: 'bg-green-500/20 text-green-300 border-green-400/30'
  }
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs border ${colors[impact]}`}>
      {impact.toUpperCase()}
    </span>
  )
}

function formatDate(dateStr: string) {
  const commitDate = new Date(dateStr) // Automatically handles timezone conversion to local
  const now = new Date()
  const diffTime = now.getTime() - commitDate.getTime() // Positive = past, negative = future
  const diffHours = Math.floor(Math.abs(diffTime) / (1000 * 60 * 60))
  const diffDays = Math.floor(Math.abs(diffTime) / (1000 * 60 * 60 * 24))
  
  // Handle "future" commits (edge case for timezone differences)
  if (diffTime < 0) {
    if (diffHours === 0) return 'Just now'
    if (diffHours === 1) return '1 hour ago' // Treat as "just committed"
    if (diffHours <= 12) return 'Recently' // Within 12 hours future = "recently"
    return commitDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: commitDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }
  
  // Normal past commits
  if (diffHours < 24) {
    if (diffHours === 0) return 'Just now'
    if (diffHours === 1) return '1 hour ago'
    return `${diffHours} hours ago`
  }
  
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 7) return `${diffDays} days ago`
  
  return commitDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: commitDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

export default function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black/80 backdrop-blur-sm rounded-2xl border border-white/20 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/20 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              <FaGithub className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-white text-xl font-semibold">What&apos;s New in DiveBlendr</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full p-2 transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6 text-white">
            {/* Introduction */}
            <div className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-4">
              <p className="text-blue-200 text-sm leading-relaxed">
                Track the latest features, fixes, and improvements to DiveBlendr. Each update is carefully crafted to enhance your technical diving experience with better calculations, new tools, and improved reliability.
              </p>
            </div>

            {/* Commits Timeline */}
            <div className="space-y-4">
              {recentCommits.map((commit, index) => (
                <div key={commit.hash} className="bg-white/5 rounded-lg border border-white/10 p-4 hover:bg-white/8 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Type Icon */}
                    <div className="flex-shrink-0 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center mt-1">
                      {getTypeIcon(commit.type)}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-white font-medium text-lg">{commit.title}</h3>
                        {getImpactBadge(commit.impact)}
                      </div>
                      
                      <p className="text-blue-200 text-sm mb-3 leading-relaxed">
                        {commit.description}
                      </p>
                      
                      <div className="flex items-center justify-between text-xs text-gray-400 flex-wrap gap-2">
                        <div className="flex items-center gap-4">
                          <span>{formatDate(commit.date)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span>{commit.files.length} files changed</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="text-center text-gray-400 text-xs border-t border-white/10 pt-4">
              <p>Last updated: {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WhatsNewButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed top-4 right-4 z-20 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 backdrop-blur-sm text-white px-3 py-2 rounded-full shadow-lg transition-all duration-200 hover:scale-105 group text-sm font-medium"
        title="View Latest Updates"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span>New</span>
        </div>
      </button>
      
      <WhatsNewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}