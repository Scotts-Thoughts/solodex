import { useMemo } from 'react'
import { parseMarkdown, type Block, type Inline } from '../../utils/issues/miniMarkdown'

function renderInlines(inlines: Inline[]): React.ReactNode[] {
  return inlines.map((node, i) => {
    switch (node.type) {
      case 'text': return <span key={i}>{node.text}</span>
      case 'bold': return <strong key={i} className="font-semibold text-white">{renderInlines(node.children)}</strong>
      case 'code': return <code key={i} className="font-mono text-[12px] bg-gray-900 border border-gray-700 rounded px-1 py-px text-gray-200">{node.text}</code>
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            className="text-blue-400 hover:text-blue-300 underline"
            onClick={e => { e.preventDefault(); window.electronAPI.openExternal(node.href) }}
          >
            {renderInlines(node.children)}
          </a>
        )
    }
  })
}

function renderBlock(block: Block, i: number): React.ReactNode {
  switch (block.type) {
    case 'heading': {
      const cls = block.level === 1 ? 'text-base font-bold text-white' : block.level === 2 ? 'text-sm font-bold text-white' : 'text-xs font-bold text-gray-300 uppercase tracking-wider'
      return <div key={i} className={`${cls} mt-3 first:mt-0 mb-1`}>{renderInlines(block.inlines)}</div>
    }
    case 'paragraph':
      return <p key={i} className="text-sm text-gray-300 leading-relaxed mb-2">{renderInlines(block.inlines)}</p>
    case 'list':
      return block.ordered
        ? <ol key={i} className="list-decimal pl-5 mb-2 space-y-0.5 text-sm text-gray-300">{block.items.map((it, j) => <li key={j}>{renderInlines(it)}</li>)}</ol>
        : <ul key={i} className="list-disc pl-5 mb-2 space-y-0.5 text-sm text-gray-300">{block.items.map((it, j) => <li key={j}>{renderInlines(it)}</li>)}</ul>
    case 'code':
      return <pre key={i} className="font-mono text-[12px] bg-gray-900 border border-gray-700 rounded p-2 mb-2 overflow-x-auto text-gray-200 whitespace-pre">{block.text}</pre>
  }
}

/** Renders the note markdown subset (see utils/issues/miniMarkdown.ts). */
export default function MiniMarkdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return <div className={`select-text ${className}`}>{blocks.map(renderBlock)}</div>
}
