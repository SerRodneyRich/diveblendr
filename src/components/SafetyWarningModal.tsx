interface SafetyWarningModalProps {
  showSafety: boolean
  onClose: () => void
}

export default function SafetyWarningModal({ showSafety, onClose }: SafetyWarningModalProps) {
  if (!showSafety) return null

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      // Mark as acknowledged in session storage
      sessionStorage.setItem('safety-warning-acknowledged', 'true')
      onClose()
      console.log('Safety banner closed via background click and acknowledged for session')
    }
  }

  const handleCloseClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Mark as acknowledged in session storage
    sessionStorage.setItem('safety-warning-acknowledged', 'true')
    onClose()
    console.log('Safety banner closed and acknowledged for session')
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4"
      onClick={handleBackgroundClick}
    >
      <div className="bg-red-900 border-2 border-red-600 rounded-lg max-w-2xl p-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-red-400">⚠️ CRITICAL SAFETY WARNING</h2>
          <button 
            onClick={handleCloseClick}
            className="bg-red-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-red-700 transition-colors cursor-pointer text-lg font-bold flex-shrink-0 ml-4"
            title="Close safety warning"
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="text-red-200 space-y-3">
          <p><strong>DIVING IS INHERENTLY DANGEROUS</strong> - This tool is for educational and planning purposes only.</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Never dive beyond your certification level</li>
            <li>Verify all calculations with certified dive planning software</li>
            <li>Technical diving and gas mixing require proper training</li>
            <li>Equipment failures can be fatal - always have backups</li>
          </ul>
          <div className="bg-red-800 border border-red-600 p-3 rounded text-center">
            <strong>BY USING THIS TOOL, YOU ACCEPT FULL RESPONSIBILITY FOR ITS USE IN REAL DIVING ENVIRONMENTS.</strong>
          </div>
        </div>
      </div>
    </div>
  )
}