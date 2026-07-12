'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Garment } from '@/types/db';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  group: 'Navigate' | 'Garments' | 'Actions';
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}

/**
 * Cmd/Ctrl+K command palette. Modal search box that filters actions
 * by label + hint, navigates with arrow keys, executes with Enter.
 *
 * Opens when `open` flips to true; closes on Escape, click outside,
 * or after running an action.
 */
export default function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter + group actions.
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || (a.hint ?? '').toLowerCase().includes(q)
    );
  }, [actions, query]);

  // Group filtered by category, preserving order.
  const grouped = useMemo(() => {
    const groups: Record<string, PaletteAction[]> = {};
    for (const a of filtered) {
      (groups[a.group] ||= []).push(a);
    }
    return groups;
  }, [filtered]);

  // Reset highlight + focus when opening.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Focus on next tick so the modal has rendered.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp highlight when filter changes.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  // Global Cmd/Ctrl+K listener — opens the palette. (Mounted by parent.)
  // (Not handled here — the parent decides when to set `open`.)

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const action = filtered[highlight];
      if (action) {
        action.run();
        onClose();
      }
    }
  };

  // Scroll the highlighted item into view as it changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  // Flatten for keyboard nav indexing.
  const flat: PaletteAction[] = [];
  for (const group of Object.keys(grouped)) {
    for (const a of grouped[group]) flat.push(a);
  }
  // Realign highlight index with the flat list.
  const flatIndexOf = (a: PaletteAction) => flat.indexOf(a);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="w-full max-w-xl bg-white border border-[#EAE5D9] rounded-2xl shadow-2xl shadow-stone-300/60 overflow-hidden">
        {/* Search input */}
        <div className="px-4 py-3 border-b border-[#EAE5D9] flex items-center gap-2">
          <span className="text-stone-400" aria-hidden="true">🔎</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            placeholder="Type a command or search garments…"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-stone-400 focus:outline-none"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden md:inline-block text-[9px] font-bold text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1">
          {flat.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400">
              No commands match <span className="font-mono text-stone-600">"{query}"</span>
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="px-3 pt-2 pb-1 text-[9px] uppercase font-black tracking-wider text-stone-400">
                  {group}
                </div>
                {items.map((a) => {
                  const idx = flatIndexOf(a);
                  const isActive = idx === highlight;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      data-idx={idx}
                      onClick={() => {
                        a.run();
                        onClose();
                      }}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-3 transition ${
                        isActive ? 'bg-[var(--accent-terracotta)]/10' : 'hover:bg-stone-50'
                      }`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-[var(--text-primary)] truncate">
                          {a.label}
                        </span>
                        {a.hint && (
                          <span className="block text-[10px] text-stone-500 truncate">{a.hint}</span>
                        )}
                      </span>
                      {a.shortcut && (
                        <kbd className="text-[9px] font-bold text-stone-500 bg-white border border-stone-200 px-1.5 py-0.5 rounded">
                          {a.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-[#EAE5D9] bg-[#FAF8F5] flex items-center gap-3 text-[9px] text-stone-500">
          <span><kbd className="font-bold">↑</kbd><kbd className="font-bold">↓</kbd> navigate</span>
          <span><kbd className="font-bold">↵</kbd> select</span>
          <span><kbd className="font-bold">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

/** Hook to wire the Cmd/Ctrl+K listener into a parent. */
export function useCommandPaletteShortcut(
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev: boolean) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}