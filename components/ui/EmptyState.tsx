export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <div className="text-sm font-medium text-slate-800">{title}</div>
      {description ? <div className="mt-1 text-xs text-slate-500">{description}</div> : null}
    </div>
  );
}
