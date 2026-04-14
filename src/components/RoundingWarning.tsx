export default function RoundingWarning() {
  return (
    <div className="flex items-center">
      <div className="bg-blue-800 border border-blue-600 text-white p-4 rounded m-4">
        <div className="font-semibold mb-2">⚠️ Remember when sampling your tank, round as follows:</div>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>Oxygen: Round down (e.g., 32.4% → 32%)</li>
          <li>Helium: Round up (e.g., 18.6% → 19%)</li>
          <li>MOD: Round down (e.g., 33.7m → 33m)</li>
        </ul>
      </div>
    </div>
  )
}