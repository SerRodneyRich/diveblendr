export default function LogoTitle() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-8">
      <div className="flex-shrink-0">
        <img 
          src="/icons/icon128.png" 
          alt="DiveBlendr Logo" 
          width={96} 
          height={96}
          loading="eager"
          className="drop-shadow-lg rounded-full bg-white/10 p-3 sm:w-32 sm:h-32 sm:p-4"
        />
      </div>
      <div className="space-y-2 sm:space-y-4 text-center sm:text-left">
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight">
          Dive<span className="text-blue-400">Blendr</span>
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-slate-300 font-light">
          Technical Diving Tools for All
        </p>
      </div>
    </div>
  )
}