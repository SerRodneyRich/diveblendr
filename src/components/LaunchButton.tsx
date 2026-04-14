import Link from 'next/link'

export default function LaunchButton() {
  return (
    <div className="pt-8">
      <Link 
        href="/calculator" 
        className="inline-flex items-center px-6 sm:px-8 py-3 sm:py-4 border border-blue-700 text-white bg-white/10 font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 cursor-pointer"
      >
        Launch App
      </Link>
    </div>
  )
}