import type { ReactNode } from "react";

/**
 * One settings topic: what it is and why on the left, the controls on the right.
 * Sections sit on hairlines instead of cards so the page reads as one document.
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-x-12 gap-y-5 border-t border-desk-line py-9 first:border-t-0 first:pt-2 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
    >
      <div>
        <h2 id={`${id}-title`} className="font-display-tight text-[1.375rem] leading-tight text-desk-text">
          {title}
        </h2>
        {description && <p className="mt-2 max-w-[40ch] text-sm leading-relaxed text-desk-muted">{description}</p>}
      </div>
      <div className="max-w-[640px] min-w-0">{children}</div>
    </section>
  );
}
