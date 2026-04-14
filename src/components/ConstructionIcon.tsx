export default function ConstructionIcon() {
  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className="relative group">
        {/* Construction icon */}
        <div 
          className="
            w-12 h-12
            border-3 border-orange-500
            rounded-full
            flex items-center justify-center 
            cursor-pointer 
            hover:scale-110 
            transition-transform 
            duration-200
            bg-transparent
          "
        >
          <span 
            className="material-symbols-outlined text-orange-500 text-4xl mb-1"
            style={{
              fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
            }}
          >
            !
          </span>
        </div>
        
        {/* Hover tooltip */}
        <div className="
          absolute bottom-full left-0 mb-2 
          min-w-80 max-w-96
          bg-gray-900 border border-orange-500 
          text-white text-sm 
          rounded-lg p-4 
          opacity-0 group-hover:opacity-100 
          transition-opacity 
          duration-200
          pointer-events-none 
          shadow-xl
          z-60
        ">
          <div className="text-center">
            <h3 className="text-lg font-bold mb-2 text-orange-400">
              Under Construction
            </h3>
            <p className="text-sm leading-relaxed font-medium text-white">
              This site is heavily in development. While we aim to have perfection in calculations, 
              as we add or make changes, sometimes unintended calculational mishaps can and will happen. 
              <span className="font-bold text-white"> Please double check all values prior to diving.</span> 
              <span className="italic">Please excuse our mess!</span>
            </p>
          </div>
          
          {/* Tooltip arrow */}
          <div className="absolute top-full left-6 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    </div>
  )
}