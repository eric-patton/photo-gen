import { Outlet, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useGenerations } from '../../api/queries';

const NAV_ITEMS = [
  { to: '/', label: 'Gallery' },
  { to: '/generate', label: 'Generate' },
  { to: '/characters', label: 'Characters' },
  { to: '/costs', label: 'Costs' },
  { to: '/settings', label: 'Settings' },
];

export default function AppShell() {
  return (
    <div className="flex h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/50">
        <div className="px-4 py-4 text-lg font-semibold tracking-tight text-neutral-100">
          photo-gen
        </div>
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
