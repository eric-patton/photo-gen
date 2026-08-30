import { useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useCreateProject, useDeleteProject, useGenerations, useProjects } from '../../api/queries';
import { useAppStore } from '../../stores/appStore';

const NAV_ITEMS = [
  { to: '/', label: 'Gallery' },
  { to: '/generate', label: 'Generate' },
  { to: '/characters', label: 'Characters' },
  { to: '/style-lab', label: 'Style Lab' },
  { to: '/costs', label: 'Costs' },
  { to: '/settings', label: 'Settings' },
];

export default function AppShell() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="flex h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight text-neutral-100">photo-gen</span>
          <ThemeToggle />
        </div>
        <ProjectSwitcher />
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <StatusBar />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function ProjectSwitcher() {
  const projects = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const { currentProjectId, setCurrentProject } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const list = (projects.data ?? []).filter((p) => !p.archived);

  // Keep the selection valid as projects load/change.
  useEffect(() => {
    if (list.length === 0) return;
    if (currentProjectId === null || !list.some((p) => p.id === currentProjectId)) {
      setCurrentProject(list[0]!.id);
    }
  }, [list, currentProjectId, setCurrentProject]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createProject.mutate(
      { name: trimmed },
      {
        onSuccess: (project) => {
          setCurrentProject(project.id);
          setName('');
          setCreating(false);
        },
      },
    );
  };

  const removeCurrent = () => {
    const project = list.find((p) => p.id === currentProjectId);
    if (!project) return;
    if (!confirm(`Delete project '${project.name}'?`)) return;
    const selectNext = () => {
      const remaining = list.filter((p) => p.id !== project.id);
      setCurrentProject(remaining[0]?.id ?? null);
    };
    deleteProject.mutate(
      { id: project.id },
      {
        onSuccess: selectNext,
        onError: (err) => {
          // Non-empty projects 409 with the counts; force archives + soft-deletes.
          if (err instanceof ApiError && err.status === 409) {
            if (confirm(`${err.message}\n\nArchive '${project.name}' and soft-delete its images?`)) {
              deleteProject.mutate({ id: project.id, force: true }, { onSuccess: selectNext });
            }
          } else {
            alert(`Delete failed: ${err.message}`);
          }
        },
      },
    );
  };

  return (
    <div className="mb-3 px-3">
      <label className="mb-1 block px-1 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
        Project
      </label>
      {creating ? (
        <div className="flex gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setCreating(false);
            }}
            placeholder="New project name"
            className="w-full min-w-0 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
          />
          <button
            onClick={submit}
            className="rounded bg-indigo-600 px-2 text-xs text-white hover:bg-indigo-500"
          >
            ✓
          </button>
        </div>
      ) : (
        <div className="flex gap-1">
          <select
            value={currentProjectId ?? ''}
            onChange={(e) => setCurrentProject(Number(e.target.value))}
            className="w-full min-w-0 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs"
          >
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setCreating(true)}
            title="New project"
            className="rounded border border-neutral-800 px-2 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          >
            +
          </button>
          <button
            onClick={removeCurrent}
            disabled={currentProjectId === null || deleteProject.isPending}
            title="Delete current project"
            className="rounded border border-neutral-800 px-1.5 text-xs text-neutral-500 hover:border-red-800 hover:text-red-400 disabled:opacity-40"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-md border border-neutral-700 px-1.5 py-1 text-sm leading-none text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
    >
      {isDark ? '☀' : '☾'}
    </button>
  );
}

function StatusBar() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ ok: boolean; version: string }>('/api/health'),
    refetchInterval: 30_000,
  });
  const active = useGenerations({ statuses: ['queued', 'running'] });
  const activeCount = active.data?.length ?? 0;

  const connected = health.data?.ok === true;
  return (
    <div className="space-y-1 border-t border-neutral-800 px-4 py-3 text-xs text-neutral-500">
      {activeCount > 0 && (
        <div className="flex items-center gap-2 text-indigo-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          {activeCount} generating…
        </div>
      )}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        {connected ? `server v${health.data?.version}` : 'server offline'}
      </div>
    </div>
  );
}
