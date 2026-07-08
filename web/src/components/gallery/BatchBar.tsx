import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useSelectionStore } from '../../stores/appStore';

export default function BatchBar() {
  const selection = useSelectionStore();
  const queryClient = useQueryClient();
  const [tagName, setTagName] = useState('');
  const [busy, setBusy] = useState(false);

  const ids = Array.from(selection.selected);

  const applyTag = async () => {
    const name = tagName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      for (const id of ids) {
        await api(`/api/images/${id}/tags`, { method: 'POST', body: JSON.stringify({ name }) });
      }
      setTagName('');
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
    } finally {
      setBusy(false);
    }
  };

  const deleteAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const id of ids) {
        await api(`/api/images/${id}`, { method: 'DELETE' });
      }
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ['images'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-indigo-900/60 bg-indigo-950/20 px-4 py-2">
      <span className="text-xs text-indigo-300">{ids.length} selected</span>
      <div className="flex items-center gap-1">
        <input
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void applyTag()}
          placeholder="Add tag to all…"
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        />
        <button
          onClick={() => void applyTag()}
          disabled={busy || !tagName.trim()}
          className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Tag
        </button>
      </div>
      <button
        onClick={() => void deleteAll()}
        disabled={busy}
        className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:border-red-700 hover:text-red-300"
      >
        Delete {ids.length}
      </button>
    </div>
  );
}
