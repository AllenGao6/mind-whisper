type Row = {
  label: string;
  mind: string;
  wispr: string;
};

const rows: Row[] = [
  { label: "Price", mind: "Free", wispr: "$12–15/mo" },
  { label: "Open source", mind: "Yes (MIT)", wispr: "No" },
  { label: "Data stays local", mind: "Yes", wispr: "Cloud" },
  { label: "Voice providers", mind: "3, swap anytime", wispr: "Locked" },
  { label: "Edit the AI prompt", mind: "Yes", wispr: "No" },
  { label: "Cost per use", mind: "Fractions of a ¢/min", wispr: "Subscription" },
];

export function Comparison() {
  return (
    <section
      id="why"
      className="relative border-b border-[var(--color-border)] py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[var(--container-content)] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
            Why MindWhisper
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            Free where others charge
          </h2>
          <p className="mt-4 text-[var(--color-text-muted)]">
            Same idea. A very different deal.
          </p>
        </div>

        <div className="mt-14 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {/* Header row */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-[var(--color-border)] sm:grid-cols-[1.6fr_1fr_1fr]">
            <div className="p-4 sm:p-5" />
            <div className="border-l border-[var(--color-border)] bg-[var(--color-accent-soft)] p-4 text-center sm:p-5">
              <span className="text-sm font-medium tracking-tight text-[var(--color-accent)] sm:text-base">
                MindWhisper
              </span>
            </div>
            <div className="border-l border-[var(--color-border)] p-4 text-center sm:p-5">
              <span className="text-sm font-medium tracking-tight text-[var(--color-text-muted)] sm:text-base">
                Wispr Flow
              </span>
            </div>
          </div>

          {rows.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1.4fr_1fr_1fr] sm:grid-cols-[1.6fr_1fr_1fr] ${
                i < rows.length - 1
                  ? "border-b border-[var(--color-border)]"
                  : ""
              }`}
            >
              <div className="flex items-center p-4 text-sm text-[var(--color-text)] sm:p-5">
                {row.label}
              </div>
              <div className="flex items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-accent-soft)] p-4 text-center text-sm font-medium text-[var(--color-text)] sm:p-5">
                {row.mind}
              </div>
              <div className="flex items-center justify-center border-l border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-text-dim)] sm:p-5">
                {row.wispr}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center font-mono text-[11px] text-[var(--color-text-dim)]">
          Wispr Flow pricing as of 2026. Comparison reflects publicly listed
          plans.
        </p>
      </div>
    </section>
  );
}
