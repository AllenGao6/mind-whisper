type Feature = {
  title: string;
  body: string;
  badge: string;
};

const features: Feature[] = [
  {
    badge: "Providers",
    title: "Three engines, one click to switch",
    body: "OpenAI, Deepgram (streams text as you talk), and Groq. Pick whichever fits the moment.",
  },
  {
    badge: "Privacy",
    title: "Your data stays on your Mac",
    body: "No accounts, no tracking. Settings and history live locally. Audio only ever goes to the provider you chose.",
  },
  {
    badge: "Clipboard-safe",
    title: "Nothing gets lost",
    body: "Whatever was on your clipboard is saved before pasting and put right back after. No surprises.",
  },
  {
    badge: "Hotkeys",
    title: "Shortcuts that fit your hands",
    body: "Rebind the talk key and the formatter shortcuts to anything you like. They work in every app.",
  },
  {
    badge: "Updates",
    title: "Quietly stays current",
    body: "Signed and notarized. New versions download in the background and install with one click.",
  },
  {
    badge: "Open source",
    title: "Free and yours to inspect",
    body: "MIT-licensed. Read the code, build it yourself, or just download it and go.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="relative border-b border-[var(--color-border)] py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[var(--container-wide)] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
            Features
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            Small app. Serious dictation.
          </h2>
          <p className="mt-4 text-[var(--color-text-muted)]">
            The rest of what makes it pleasant to use every day.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="group relative flex flex-col gap-3 bg-[var(--color-bg)] p-7 transition-colors hover:bg-[var(--color-surface)]"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
                {feature.badge}
              </span>
              <h3 className="text-base font-medium tracking-tight text-[var(--color-text)]">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
