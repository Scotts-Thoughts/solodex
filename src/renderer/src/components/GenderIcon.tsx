/** ♂ / ♀ for a trainer Pokémon's gender; nothing when genderless or unknown (gen 1). */
export default function GenderIcon({ gender, className = '' }: { gender?: 'M' | 'F' | 'N' | null; className?: string }) {
  if (gender === 'M') return <span className={`text-blue-400 ${className}`} title="Male">{'♂'}</span>
  if (gender === 'F') return <span className={`text-pink-400 ${className}`} title="Female">{'♀'}</span>
  return null
}
