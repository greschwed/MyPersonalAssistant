import type { HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  meta?: ReactNode;
  children: ReactNode;
};

export function Panel({ label, meta, children, className = "", ...rest }: PanelProps) {
  return (
    <section
      {...rest}
      className={`panel p-5 flex flex-col gap-3 min-h-[140px] ${className}`}
    >
      {(label || meta) && (
        <header className="flex items-baseline justify-between gap-3">
          {label && <span className="label-xs">{label}</span>}
          {meta && <span className="label-xs text-[var(--ink-3)]">{meta}</span>}
        </header>
      )}
      <div className="flex-1">{children}</div>
    </section>
  );
}
