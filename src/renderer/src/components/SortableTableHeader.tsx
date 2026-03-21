import type { SortColumn, SortState } from '../hooks/useMoveSort'

const TH_BASE = 'sticky top-0 bg-gray-900 z-10 py-1 px-1 text-sm font-semibold cursor-pointer select-none'

interface Column {
  key: SortColumn
  label: string
  align: 'left' | 'right'
}

const COLUMNS: Column[] = [
  { key: 'default', label: 'Lv', align: 'left' },
  { key: 'move', label: 'Move', align: 'left' },
  { key: 'type', label: 'Type', align: 'left' },
  { key: 'cat', label: 'Cat', align: 'left' },
  { key: 'pwr', label: 'Pwr', align: 'right' },
  { key: 'acc', label: 'Acc', align: 'right' },
  { key: 'pp', label: 'PP', align: 'right' },
]

export default function SortableTableHeader({ sort, onSort, col1 = 'Lv' }: {
  sort: SortState
  onSort: (column: SortColumn) => void
  col1?: string
}) {
  return (
    <thead>
      <tr>
        {COLUMNS.map((col, i) => {
          const label = i === 0 ? col1 : col.label
          const isActive = sort.column !== 'default' && col.key === sort.column
          return (
            <th
              key={col.key}
              className={`${TH_BASE} ${col.align === 'right' ? 'text-right' : 'text-left'} ${i === 0 ? 'w-10' : ''} ${isActive ? 'text-gray-300' : 'text-gray-600 hover:text-gray-400'}`}
              onClick={() => onSort(col.key)}
              onContextMenu={e => { e.preventDefault(); onSort('default') }}
            >
              {label}
              {isActive && (
                <span className="text-[10px] ml-0.5 opacity-70">
                  {sort.direction === 'asc' ? '\u25B2' : '\u25BC'}
                </span>
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
