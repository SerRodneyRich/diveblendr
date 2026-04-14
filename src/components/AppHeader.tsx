import Link from 'next/link'

interface AppHeaderProps {
  activeTab?: string
}

export default function AppHeader({ activeTab }: AppHeaderProps) {
  const getToolName = (tab: string) => {
    const toolNames = {
      'recommendations': 'Gas Recommendations',
      'mixer': 'Gas Playground', 
      'blender': 'Gas Blender',
      'modcheck': 'MOD Check',
      'sac': 'SAC/RMV Calculator',
      'bottomtime': 'Bottom Time Calculator',
      'photo-editor': 'Underwater Photo Editor',
      'marine-conditions': 'Marine Conditions',
      'links': 'Links'
    }
    return toolNames[tab as keyof typeof toolNames] || 'DiveBlendr Tools'
  }
  return (
    <header className="border-b border-gray-700 p-3 sm:p-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left Side - Logo and Title */}
        <Link href="/" className="flex items-center space-x-2 sm:space-x-3">
          <img 
                    src="/icons/icon128.png" 
                    alt="DiveBlendr Logo" 
                    width={40} 
                    height={40}
                    loading="eager"
                    className="drop-shadow-lg rounded-full bg-white/10 p-3 sm:w-24 sm:h-24 sm:p-2"
                  />
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-yellow-400">DiveBlendr</h1>
            <p className="text-xs sm:text-sm text-gray-400">A Custom Blend of Technical Diving Tools</p>
          </div>
        </Link>
        
        {/* Center - Current Tool Name (Desktop Only) */}
        {activeTab && (
          <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2">
            <h2 className="text-xl font-semibold text-white text-center">
              {getToolName(activeTab)}
            </h2>
          </div>
        )}
        
        {/* Right Side - Space for other controls */}
        <div className="w-16 sm:w-24"></div>
      </div>
    </header>
  )
}