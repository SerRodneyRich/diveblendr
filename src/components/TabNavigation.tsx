
interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabs = [
    { id: 'recommendations', label: 'Gas Recommendations', shortLabel: 'Recommendations' },
    { id: 'mixer', label: 'Gas Playground', shortLabel: 'Playground' },
    { id: 'blender', label: 'Gas Blender', shortLabel: 'Blender' },
    { id: 'modcheck', label: 'MOD Check', shortLabel: 'MOD Check' },
    { id: 'sac', label: 'SAC/RMV Calculator', shortLabel: 'SAC/RMV' },
    { id: 'bottomtime', label: 'Bottom Time Calculator', shortLabel: 'Bottom Time' },
    { id: 'photo-editor', label: 'Underwater Photo Editor', shortLabel: 'Photo Editor' },
    { id: 'links', label: 'Links', shortLabel: 'Links' }
  ]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, tabId: string) => {
    const currentIndex = tabs.findIndex(tab => tab.id === tabId)
    
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1
        onTabChange(tabs[prevIndex].id)
        // Focus the new tab
        setTimeout(() => {
          const tabButtons = document.querySelectorAll('[role="tab"]')
          ;(tabButtons[prevIndex] as HTMLElement)?.focus()
        }, 0)
        break
      case 'ArrowRight':
        e.preventDefault()
        const nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0
        onTabChange(tabs[nextIndex].id)
        // Focus the new tab
        setTimeout(() => {
          const tabButtons = document.querySelectorAll('[role="tab"]')
          ;(tabButtons[nextIndex] as HTMLElement)?.focus()
        }, 0)
        break
      case 'Home':
        e.preventDefault()
        onTabChange(tabs[0].id)
        setTimeout(() => {
          const tabButtons = document.querySelectorAll('[role="tab"]')
          ;(tabButtons[0] as HTMLElement)?.focus()
        }, 0)
        break
      case 'End':
        e.preventDefault()
        onTabChange(tabs[tabs.length - 1].id)
        setTimeout(() => {
          const tabButtons = document.querySelectorAll('[role="tab"]')
          ;(tabButtons[tabs.length - 1] as HTMLElement)?.focus()
        }, 0)
        break
    }
  }

  return (
    <div className="bg-gray-800 rounded-t-lg border-b border-gray-700 hidden md:block">
      <nav className="flex overflow-x-auto" role="tablist" aria-label="Navigation tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`px-3 sm:px-6 py-3 sm:py-4 font-semibold transition-colors whitespace-nowrap text-sm sm:text-base focus:ring-2 focus:ring-yellow-400 focus:outline-none ${
              activeTab === tab.id
                ? 'text-yellow-400 border-b-2 border-yellow-400 bg-gray-700'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}