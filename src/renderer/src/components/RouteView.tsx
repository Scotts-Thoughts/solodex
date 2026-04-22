import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  getMajorBattles,
  getTrainer,
  getPokemonData,
  getSuperEffectiveMoveSuggestions,
  displayName,
  GAMES_WITH_TRAINERS,
  GAME_COLOR,
  GAME_ABBREV,
  type MajorBattle,
  type MoveSuggestion,
} from '../data'
import type { TrainerPokemon } from '../types/pokemon'
import { getArtworkUrl } from '../utils/sprites'
import TypeBadge, { TYPE_COLORS } from './TypeBadge'

const PLAN_DRAFT_KEY = 'routePlanner:draft'
const PLAN_SAVED_KEY = 'routePlanner:savedPlans'
const SCHEMA_VERSION = 1

// ── Plan types ────────────────────────────────────────────────────────────────

// Picks: battleId → (enemyKey → move names)
// enemyKey = `${trainerId}:${partyIndex}` so duplicate species get separate buckets
type PickMap = Record<string, Record<string, string[]>>

interface RoutePlan {
  schemaVersion: number
  game: string
  runnerSpecies: string
  planName: string
  picks: PickMap
}

interface SavedPlan {
  id: string
  name: string
  game: string
  runnerSpecies: string
  picks: PickMap
  savedAt: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadDrafts(): Record<string, PickMap> {
  try {
    const raw = localStorage.getItem(PLAN_DRAFT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveDraft(game: string, runner: string, picks: PickMap) {
  const drafts = loadDrafts()
  drafts[`${game}::${runner}`] = picks
  localStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(drafts))
}

function loadSavedPlans(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(PLAN_SAVED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistSavedPlans(plans: SavedPlan[]) {
  localStorage.setItem(PLAN_SAVED_KEY, JSON.stringify(plans))
}

function enemyKey(trainerId: string, partyIndex: number): string {
  return `${trainerId}:${partyIndex}`
}

function sourceBadge(s: MoveSuggestion): string {
  if (s.source === 'level') return `Lv${s.level}`
  if (s.source === 'tm') return s.tmCode ?? 'TM'
  if (s.source === 'tutor') return 'Tutor'
  return 'Egg'
}

function sourceBadgeColor(s: MoveSuggestion): string {
  if (s.source === 'level') return 'bg-blue-700 text-blue-100'
  if (s.source === 'tm') return 'bg-amber-700 text-amber-100'
  if (s.source === 'tutor') return 'bg-purple-700 text-purple-100'
  return 'bg-pink-700 text-pink-100'
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface Props {
  selectedGame: string
  runnerSpecies: string | null
  onChangeRunner: () => void
  availableGames: string[]
  onChangeGame: (game: string) => void
}

export default function RouteView({ selectedGame, runnerSpecies, onChangeRunner, availableGames, onChangeGame }: Props) {
  const [tab, setTab] = useState<'battles' | 'summary'>('battles')
  const [picks, setPicks] = useState<PickMap>({})
  const [planName, setPlanName] = useState('Untitled plan')
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null)
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => loadSavedPlans())

  const isSupportedGame = GAMES_WITH_TRAINERS.includes(selectedGame)
  const battles = useMemo<MajorBattle[]>(
    () => (isSupportedGame ? getMajorBattles(selectedGame) : []),
    [selectedGame, isSupportedGame]
  )

  // Load draft picks whenever runner/game changes
  useEffect(() => {
    if (!runnerSpecies || !isSupportedGame) {
      setPicks({})
      return
    }
    const drafts = loadDrafts()
    setPicks(drafts[`${selectedGame}::${runnerSpecies}`] ?? {})
  }, [selectedGame, runnerSpecies, isSupportedGame])

  // Auto-save draft on every change
  useEffect(() => {
    if (!runnerSpecies || !isSupportedGame) return
    saveDraft(selectedGame, runnerSpecies, picks)
  }, [picks, selectedGame, runnerSpecies, isSupportedGame])

  // Default selection
  useEffect(() => {
    if (!selectedBattleId && battles.length > 0) {
      setSelectedBattleId(battles[0].id)
    } else if (selectedBattleId && !battles.find(b => b.id === selectedBattleId)) {
      setSelectedBattleId(battles[0]?.id ?? null)
    }
  }, [battles, selectedBattleId])

  const togglePick = useCallback((battleId: string, key: string, move: string) => {
    setPicks(prev => {
      const battle = { ...(prev[battleId] ?? {}) }
      const existing = battle[key] ?? []
      const idx = existing.indexOf(move)
      battle[key] = idx === -1 ? [...existing, move] : existing.filter(m => m !== move)
      if (battle[key].length === 0) delete battle[key]
      const next = { ...prev, [battleId]: battle }
      if (Object.keys(next[battleId]).length === 0) delete next[battleId]
      return next
    })
  }, [])

  const handleSaveAs = useCallback(() => {
    if (!runnerSpecies) return
    const name = window.prompt('Plan name:', planName) ?? ''
    if (!name.trim()) return
    const newPlan: SavedPlan = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      game: selectedGame,
      runnerSpecies,
      picks,
      savedAt: Date.now(),
    }
    const next = [...savedPlans, newPlan]
    setSavedPlans(next)
    persistSavedPlans(next)
    setPlanName(name.trim())
  }, [savedPlans, picks, selectedGame, runnerSpecies, planName])

  const handleLoad = useCallback((id: string) => {
    const plan = savedPlans.find(p => p.id === id)
    if (!plan) return
    if (plan.game !== selectedGame || plan.runnerSpecies !== runnerSpecies) {
      const ok = window.confirm(
        `This plan is for ${plan.runnerSpecies} in ${plan.game}. Load anyway? (Picks may not match the current battles.)`
      )
      if (!ok) return
    }
    setPicks(plan.picks)
    setPlanName(plan.name)
  }, [savedPlans, selectedGame, runnerSpecies])

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Delete this saved plan?')) return
    const next = savedPlans.filter(p => p.id !== id)
    setSavedPlans(next)
    persistSavedPlans(next)
  }, [savedPlans])

  const handleExport = useCallback(async () => {
    if (!runnerSpecies) return
    const plan: RoutePlan = {
      schemaVersion: SCHEMA_VERSION,
      game: selectedGame,
      runnerSpecies,
      planName,
      picks,
    }
    const safeName = planName.replace(/[\\/:*?"<>|]/g, '_')
    const defaultName = `${safeName}-${runnerSpecies}-${selectedGame}.json`.replace(/\s+/g, '_')
    const ok = await window.electronAPI.saveRoutePlan(JSON.stringify(plan, null, 2), defaultName)
    if (!ok) console.warn('[Solodex] route plan export cancelled or failed')
  }, [planName, picks, selectedGame, runnerSpecies])

  const handleImport = useCallback(async () => {
    const json = await window.electronAPI.loadRoutePlan()
    if (!json) return
    try {
      const parsed = JSON.parse(json) as RoutePlan
      if (typeof parsed !== 'object' || parsed == null) throw new Error('not an object')
      if (typeof parsed.picks !== 'object' || parsed.picks == null) throw new Error('missing picks')
      if (parsed.game !== selectedGame || parsed.runnerSpecies !== runnerSpecies) {
        const ok = window.confirm(
          `Imported plan is for ${parsed.runnerSpecies ?? '?'} in ${parsed.game ?? '?'}. Apply to current ${runnerSpecies ?? '?'} / ${selectedGame} anyway?`
        )
        if (!ok) return
      }
      setPicks(parsed.picks)
      setPlanName(parsed.planName ?? 'Imported plan')
    } catch (err) {
      console.error('[Solodex] failed to parse imported route plan:', err)
      alert('Could not parse plan file. Make sure it is a valid Solodex route plan JSON.')
    }
  }, [selectedGame, runnerSpecies])

  // ── Render ──

  if (!isSupportedGame) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Route planner only supports games with trainer data.
      </div>
    )
  }

  if (!runnerSpecies) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
        <div>Pick a Pokemon to plan a solo run with.</div>
        <button
          onClick={onChangeRunner}
          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold"
        >
          Choose runner
        </button>
      </div>
    )
  }

  const runnerData = getPokemonData(runnerSpecies, selectedGame)
  const selectedBattle = battles.find(b => b.id === selectedBattleId) ?? null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700 bg-gray-800/60 flex-wrap">
        <div className="flex items-center gap-2">
          {runnerData && (
            <img
              src={getArtworkUrl(runnerSpecies, runnerData.national_dex_number)}
              alt={runnerSpecies}
              className="w-10 h-10 object-contain"
            />
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-gray-500">Runner</span>
            <span className="text-sm font-bold text-white">{displayName(runnerSpecies)}</span>
          </div>
          <button
            onClick={onChangeRunner}
            className="ml-2 px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Change
          </button>
        </div>

        <div className="h-8 w-px bg-gray-700" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Plan</span>
          <input
            value={planName}
            onChange={e => setPlanName(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-sm text-white w-44"
          />
        </div>

        <div className="flex items-center gap-1">
          <button onClick={handleSaveAs} className="px-2 py-1 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white">Save as…</button>
          <select
            value=""
            onChange={e => {
              if (e.target.value) handleLoad(e.target.value)
              e.currentTarget.value = ''
            }}
            className="bg-gray-900 border border-gray-700 rounded px-1 py-1 text-xs text-gray-200"
          >
            <option value="">Load…</option>
            {savedPlans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.runnerSpecies} / {p.game}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={e => {
              if (e.target.value) handleDelete(e.target.value)
              e.currentTarget.value = ''
            }}
            className="bg-gray-900 border border-gray-700 rounded px-1 py-1 text-xs text-gray-400"
          >
            <option value="">Delete…</option>
            {savedPlans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button onClick={handleExport} className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Export JSON</button>
          <button onClick={handleImport} className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Import JSON</button>
        </div>

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {availableGames.length > 1 && (
            <div className="flex items-center gap-1">
              {availableGames.map(game => {
                const isActive = game === selectedGame
                const color = GAME_COLOR[game] ?? '#6B7280'
                return (
                  <button
                    key={game}
                    onClick={() => onChangeGame(game)}
                    className="rounded px-2 py-1 text-[11px] font-bold tracking-wide transition-all duration-150"
                    style={
                      isActive
                        ? { backgroundColor: color, color: '#fff' }
                        : { backgroundColor: '#1a1f29', color: '#8b96a5', border: `1px solid ${color}40` }
                    }
                    title={game}
                  >
                    {GAME_ABBREV[game] ?? game}
                  </button>
                )
              })}
            </div>
          )}

          <div className="inline-flex rounded overflow-hidden border border-gray-700">
            <button
              onClick={() => setTab('battles')}
              className={`px-3 py-1 text-xs font-bold ${tab === 'battles' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              Battles
            </button>
            <button
              onClick={() => setTab('summary')}
              className={`px-3 py-1 text-xs font-bold ${tab === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              Summary
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      {tab === 'battles' ? (
        <div className="flex-1 flex overflow-hidden">
          <BattleList
            battles={battles}
            selectedId={selectedBattleId}
            onSelect={setSelectedBattleId}
            picks={picks}
          />
          <div className="flex-1 overflow-auto">
            {selectedBattle ? (
              <BattleDetail
                key={selectedBattle.id}
                battle={selectedBattle}
                game={selectedGame}
                runnerSpecies={runnerSpecies}
                picks={picks[selectedBattle.id] ?? {}}
                onTogglePick={(key, move) => togglePick(selectedBattle.id, key, move)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                No major battles for this game.
              </div>
            )}
          </div>
        </div>
      ) : (
        <SummaryView battles={battles} game={selectedGame} picks={picks} planName={planName} runnerSpecies={runnerSpecies} />
      )}
    </div>
  )
}

// ── Battle list ───────────────────────────────────────────────────────────────

interface BattleListProps {
  battles: MajorBattle[]
  selectedId: string | null
  onSelect: (id: string) => void
  picks: PickMap
}

function BattleList({ battles, selectedId, onSelect, picks }: BattleListProps) {
  return (
    <div className="w-72 flex-shrink-0 border-r border-gray-700 overflow-auto">
      <ul>
        {battles.map(b => {
          const isActive = b.id === selectedId
          const pickCount = Object.values(picks[b.id] ?? {}).reduce((acc, arr) => acc + arr.length, 0)
          return (
            <li key={b.id}>
              <button
                onClick={() => onSelect(b.id)}
                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-800 ${
                  isActive ? 'bg-blue-900/40 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{b.name}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">Lv{b.maxLevel}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mt-0.5">
                  <span className="truncate">{b.trainerClass}</span>
                  {pickCount > 0 && (
                    <span className="text-blue-400">{pickCount} pick{pickCount === 1 ? '' : 's'}</span>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Battle detail ─────────────────────────────────────────────────────────────

interface BattleDetailProps {
  battle: MajorBattle
  game: string
  runnerSpecies: string
  picks: Record<string, string[]>
  onTogglePick: (key: string, move: string) => void
}

function BattleDetail({ battle, game, runnerSpecies, picks, onTogglePick }: BattleDetailProps) {
  const trainers = battle.trainerIds
    .map(id => getTrainer(game, id))
    .filter((t): t is NonNullable<ReturnType<typeof getTrainer>> => t != null)

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">{battle.name}</h2>
        <div className="text-xs text-gray-500">{battle.trainerClass} · max Lv{battle.maxLevel}</div>
      </div>

      {trainers.map(trainer => (
        <div key={trainer.id} className="space-y-3">
          {trainers.length > 1 && (
            <div className="text-sm text-gray-400 font-semibold">{trainer.name}</div>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {trainer.party.map((mon, idx) => (
              <EnemyCard
                key={`${trainer.id}:${idx}`}
                enemy={mon}
                game={game}
                runnerSpecies={runnerSpecies}
                pickedMoves={picks[enemyKey(trainer.id, idx)] ?? []}
                onTogglePick={move => onTogglePick(enemyKey(trainer.id, idx), move)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Enemy card with suggestions ───────────────────────────────────────────────

interface EnemyCardProps {
  enemy: TrainerPokemon
  game: string
  runnerSpecies: string
  pickedMoves: string[]
  onTogglePick: (move: string) => void
}

interface GroupedSuggestion {
  move: string
  type: string
  multiplier: number
  power: number | null
  sources: MoveSuggestion[]
}

function EnemyCard({ enemy, game, runnerSpecies, pickedMoves, onTogglePick }: EnemyCardProps) {
  const enemyData = getPokemonData(enemy.species, game)
  const suggestions = useMemo(
    () => getSuperEffectiveMoveSuggestions(runnerSpecies, enemy.species, game),
    [runnerSpecies, enemy.species, game]
  )
  const groupedSuggestions = useMemo<GroupedSuggestion[]>(() => {
    const byMove = new Map<string, GroupedSuggestion>()
    for (const s of suggestions) {
      const existing = byMove.get(s.move)
      if (existing) {
        existing.sources.push(s)
      } else {
        byMove.set(s.move, {
          move: s.move,
          type: s.type,
          multiplier: s.multiplier,
          power: s.power,
          sources: [s],
        })
      }
    }
    return Array.from(byMove.values())
  }, [suggestions])

  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3">
      <div className="flex items-center gap-3 mb-2">
        {enemyData && (
          <img
            src={getArtworkUrl(enemy.species, enemyData.national_dex_number)}
            alt={enemy.species}
            className="w-12 h-12 object-contain"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">
            {displayName(enemy.species)} <span className="text-gray-400 font-normal">Lv{enemy.level}</span>
          </div>
          <div className="flex gap-1 mt-1">
            {enemyData?.type_1 && <TypeBadge type={enemyData.type_1} />}
            {enemyData?.type_2 && enemyData.type_2 !== enemyData.type_1 && <TypeBadge type={enemyData.type_2} />}
          </div>
        </div>
      </div>

      {groupedSuggestions.length === 0 ? (
        <div className="text-xs text-gray-500 italic">No super-effective moves in learnset.</div>
      ) : (
        <ul className="space-y-1">
          {groupedSuggestions.map(g => {
            const checked = pickedMoves.includes(g.move)
            return (
              <li key={g.move}>
                <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-700/40 rounded px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onTogglePick(g.move)}
                    className="accent-blue-500"
                  />
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ backgroundColor: TYPE_COLORS[g.type] ?? '#6B7280', color: 'white' }}
                  >
                    {g.type}
                  </span>
                  <span className="text-gray-100 flex-1 truncate">{g.move}</span>
                  <span className="text-gray-500">{g.power}bp</span>
                  {g.multiplier > 2 && (
                    <span className="text-amber-400 font-bold">{g.multiplier}×</span>
                  )}
                  <span className="flex items-center gap-1">
                    {g.sources.map((s, i) => (
                      <span
                        key={`${s.source}-${s.tmCode ?? s.level ?? i}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sourceBadgeColor(s)}`}
                      >
                        {sourceBadge(s)}
                      </span>
                    ))}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Summary view ──────────────────────────────────────────────────────────────

interface SummaryProps {
  battles: MajorBattle[]
  game: string
  picks: PickMap
  planName: string
  runnerSpecies: string
}

function SummaryView({ battles, game, picks, planName, runnerSpecies }: SummaryProps) {
  const battlesWithPicks = battles.filter(b => picks[b.id] && Object.keys(picks[b.id]).length > 0)

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-bold text-white">{planName}</h2>
        <div className="text-sm text-gray-400 mb-6">
          Solo run: {displayName(runnerSpecies)} · {game}
        </div>

        {battlesWithPicks.length === 0 ? (
          <div className="text-gray-500 italic">No moves picked yet. Switch to Battles to plan your run.</div>
        ) : (
          <ol className="space-y-4">
            {battlesWithPicks.map(b => (
              <li key={b.id} className="bg-gray-800 border border-gray-700 rounded p-3">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="font-bold text-white">{b.name}</div>
                  <div className="text-xs text-gray-500">Lv{b.maxLevel} · {b.trainerClass}</div>
                </div>
                <ul className="space-y-1 text-sm">
                  {Object.entries(picks[b.id] ?? {}).map(([key, moves]) => {
                    const [trainerId, idxStr] = key.split(':')
                    const trainer = getTrainer(game, trainerId)
                    const enemy = trainer?.party[Number(idxStr)]
                    if (!enemy) return null
                    return (
                      <li key={key} className="flex flex-wrap items-center gap-2">
                        <span className="text-gray-300 w-40 truncate">
                          {displayName(enemy.species)} <span className="text-gray-500">Lv{enemy.level}</span>
                        </span>
                        <span className="text-gray-100">{moves.join(', ')}</span>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
