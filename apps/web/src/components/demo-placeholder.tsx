type DemoPlaceholderProps = {
  /** Short caption shown inside the empty box (e.g. "Dynamic island demo"). */
  label: string;
  /** Tailwind aspect-ratio class. Defaults to 16:9. */
  aspect?: string;
};

/**
 * A styled placeholder where a feature GIF/video will go later. It intentionally
 * renders no <img> so nothing breaks before the media exists.
 *
 * To drop in a real demo later, replace the inner content with, e.g.:
 *   import Image from "next/image";
 *   <Image src="/features/dynamic-island.gif" alt={label} fill unoptimized className="object-cover" />
 * (use `unoptimized` for animated GIFs). Suggested path: public/features/<name>.gif
 */
export function DemoPlaceholder({ label, aspect = "aspect-video" }: DemoPlaceholderProps) {
  return (
    <div className="relative w-full">
      <div
        aria-hidden
        className="absolute -inset-4 rounded-3xl bg-[var(--color-accent-soft)] blur-3xl"
      />
      <div
        className={`relative ${aspect} w-full overflow-hidden rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] ring-soft`}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] text-sm text-[var(--color-accent)]">
            ▶
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
