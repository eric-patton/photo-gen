import type { ReactNode } from 'react';

export default function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
      <h1 className="text-lg font-semibold text-neutral-100">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
