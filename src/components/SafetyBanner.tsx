interface SafetyBannerProps {
  isHidden?: boolean
}

export default function SafetyBanner({ isHidden = false }: SafetyBannerProps) {
  if (isHidden) return null
  
  return (
    <div className="fixed bottom-0 left-0 right-0 p-2 sm:p-4 z-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <span className="text-lg sm:text-xl flex-shrink-0">⚠️</span>
          <p className="text-xs sm:text-sm text-amber-200 text-center leading-tight">
            <strong className="text-amber-300">Safety Notice:</strong> This tool is for educational purposes only. Always verify calculations 
            and dive within your certification limits.
          </p>
        </div>
      </div>
    </div>
  )
}