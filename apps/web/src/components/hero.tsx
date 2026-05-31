import { DownloadButton } from "./download-button";
import { DemoPlaceholder } from "./demo-placeholder";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-[var(--color-border)]"
    >
      <div aria-hidden className="absolute inset-0 grid-bg" />
      <div aria-hidden className="absolute inset-0 hero-glow" />

      <div className="relative mx-auto max-w-[var(--container-wide)] px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
              Free · Open source · macOS
            </span>

            <h1 className="max-w-2xl text-balance text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Speak. It types itself.
              <br />
              <span className="bg-gradient-to-br from-[var(--color-text)] to-[var(--color-text-muted)] bg-clip-text text-transparent">
                Free, open, and yours.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-[var(--color-text-muted)] sm:text-lg">
              Hold a key in any app, talk, let go — your words land at the cursor.
              Your providers, your data, your machine. No subscription.
            </p>

            <div className="mt-9">
              <DownloadButton />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <DemoPlaceholder label="Product demo" />

            <div className="relative mt-4 flex items-center justify-center gap-2 font-mono text-[11px] text-[var(--color-text-dim)]">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5">
                ⌥
              </kbd>
              <span>hold to talk · release to paste</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
