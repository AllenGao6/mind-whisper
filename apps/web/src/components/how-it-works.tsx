import { DemoPlaceholder } from "./demo-placeholder";

type Step = {
  index: string;
  title: string;
  body: string;
};

const steps: Step[] = [
  {
    index: "01",
    title: "Hold your hotkey",
    body: "Default is Right Option — rebindable to any key. Works globally in every app.",
  },
  {
    index: "02",
    title: "Speak naturally",
    body: "The bar at the bottom shows a live audio meter — and live text as you talk on Deepgram. Switch language right there if you need to.",
  },
  {
    index: "03",
    title: "Release — text appears",
    body: "Transcript is formatted by your active preset and pasted at the cursor. Your previous clipboard is restored automatically.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative border-b border-[var(--color-border)] py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[var(--container-wide)] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            Three steps. No mouse.
          </h2>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <DemoPlaceholder label="Walkthrough" />

          <ol className="flex flex-col gap-3">
            {steps.map((step) => (
              <li
                key={step.index}
                className="flex gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <span className="font-mono text-xs text-[var(--color-accent)]">
                  {step.index}
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-medium tracking-tight text-[var(--color-text)]">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
