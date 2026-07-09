import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface AppState {
  currentProjectId: number | null;
  setCurrentProject: (id: number | null) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentProjectId: null,
      setCurrentProject: (id) => set({ currentProjectId: id }),
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
    }),
    { name: 'photo-gen-app' },
  ),
);

interface SelectionState {
  selecting: boolean;
  selected: Set<string>;
  toggleSelecting: () => void;
  toggle: (id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selecting: false,
  selected: new Set(),
  toggleSelecting: () =>
    set((s) => ({ selecting: !s.selecting, selected: new Set<string>() })),
  toggle: (id) =>
    set((s) => {
      const selected = new Set(s.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { selected };
    }),
  clear: () => set({ selected: new Set<string>(), selecting: false }),
}));
