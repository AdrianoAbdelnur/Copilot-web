import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }: CardProps) {
  return <div className={`border-b border-slate-100 px-4 py-3 ${className}`} {...props} />;
}

export function CardTitle({ className = "", children, ...props }: CardProps) {
  return (
    <h2 className={`text-sm font-semibold text-slate-900 ${className}`} {...props}>
      {children}
    </h2>
  );
}

export function CardContent({ className = "", ...props }: CardProps) {
  return <div className={`p-4 ${className}`} {...props} />;
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </Card>
  );
}
