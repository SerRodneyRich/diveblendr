import { useState } from 'react'
import { MdError, MdWarning, MdInfo } from 'react-icons/md'

export interface Warning {
  type: 'danger' | 'warning' | 'info'
  message: string
  id?: string
  title?: string
}

interface WarningIconStackProps {
  warnings: Warning[]
}

export default function WarningIconStack({ warnings }: WarningIconStackProps) {
  const [focusedTooltip, setFocusedTooltip] = useState<string | null>(null)
  
  if (warnings.length === 0) return null

  const groupedWarnings = warnings.reduce((acc, warning) => {
    if (!acc[warning.type]) acc[warning.type] = []
    acc[warning.type].push(warning.message)
    return acc
  }, {} as Record<string, string[]>)

  const iconConfig = {
    danger: { color: 'border-red-500', icon: MdError, textColor: 'text-red-500', tooltipBorder: 'border-l-4 border-l-red-500' },
    warning: { color: 'border-yellow-500', icon: MdWarning, textColor: 'text-yellow-500', tooltipBorder: 'border-l-4 border-l-yellow-500' },
    info: { color: 'border-blue-500', icon: MdInfo, textColor: 'text-blue-500', tooltipBorder: 'border-l-4 border-l-blue-500' }
  }

  const handleKeyDown = (e: React.KeyboardEvent, type: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setFocusedTooltip(focusedTooltip === type ? null : type)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setFocusedTooltip(null)
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {Object.entries(groupedWarnings).map(([type, messages]) => (
        <div key={type} className="relative group">
          <div 
            role="button"
            tabIndex={0}
            onClick={() => setFocusedTooltip(focusedTooltip === type ? null : type)}
            onKeyDown={(e) => handleKeyDown(e, type)}
            onBlur={() => setTimeout(() => setFocusedTooltip(null), 150)}
            aria-label={`${type === 'danger' ? 'Danger' : type === 'warning' ? 'Warning' : 'Information'} notification. ${messages.length} message${messages.length > 1 ? 's' : ''}. Press Enter to view details.`}
            aria-expanded={focusedTooltip === type}
            className={`
              w-10 h-10 sm:w-12 sm:h-12 
              ${iconConfig[type as keyof typeof iconConfig].color} 
              border-2 rounded-full 
              flex items-center justify-center 
              cursor-pointer 
              hover:scale-110 
              transition-transform 
              shadow-lg
              bg-transparent
              focus:ring-2 focus:ring-yellow-400 focus:outline-none
            `}
          >
            {(() => {
              const IconComponent = iconConfig[type as keyof typeof iconConfig].icon
              return (
                <IconComponent 
                  className={`
                    text-lg sm:text-xl 
                    ${iconConfig[type as keyof typeof iconConfig].textColor}
                  `}
                  size="24"
                />
              )
            })()}
          </div>
          
          {/* Tooltip */}
          <div className={`
            absolute bottom-full left-0 mb-2
            min-w-64 max-w-80 sm:max-w-96
            bg-gray-900 border border-gray-600
            ${iconConfig[type as keyof typeof iconConfig].tooltipBorder}
            text-white text-xs sm:text-sm
            rounded-lg p-3
            transition-opacity
            shadow-xl
            z-60
            ${focusedTooltip === type || focusedTooltip === null ?
              'opacity-0 group-hover:opacity-100 pointer-events-none' :
              focusedTooltip === type ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }
          `}
          role="tooltip"
          aria-live="polite"
          >
            <div className="font-semibold text-yellow-400 mb-2 capitalize">
              {type === 'danger' ? 'DANGER' : type === 'warning' ? 'WARNING' : 'INFO'}
            </div>
            {messages.map((message, index) => (
              <div key={index} className="mb-1 last:mb-0">
                {message.replace(/⚠️ DANGER: |⚠️ WARNING: |⚠️ CAUTION: |ℹ️ /g, '')}
              </div>
            ))}
            
            {/* Tooltip arrow */}
            <div className="absolute top-full left-6 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      ))}
    </div>
  )
}