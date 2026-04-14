import MathJax from './MathJax'

interface MathContent {
  title: string
  content: string
}

interface MathModalProps {
  showMathModal: boolean
  mathContent: MathContent
  onClose: () => void
}

export default function MathModal({ showMathModal, mathContent, onClose }: MathModalProps) {
  if (!showMathModal) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 border-2 border-yellow-400 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-yellow-400">
          <h2 className="text-xl font-bold text-yellow-400">{mathContent.title}</h2>
          <button
            onClick={onClose}
            className="bg-yellow-400 text-gray-900 rounded-full w-8 h-8 flex items-center justify-center font-bold hover:bg-yellow-300 transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div 
          className="p-6 overflow-y-auto"
          style={{ maxHeight: 'calc(90vh - 120px)' }}
        >
          <MathJax content={mathContent.content} />
        </div>
      </div>
    </div>
  )
}