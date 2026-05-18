type Feature = {
  title: string;
  body: string;
  badge: string;
};

const features: Feature[] = [
  {
    badge: "Providers",
    title: "Three providers, one click to switch",
    body: "OpenAI Whisper, Deepgram Nova-3 (streaming, lowest latency), and Groq Whisper. Pick the engine that fits the moment.",
  },
  {
    badge: "Formatter",
    title: "Cleans up your speech before it pastes",
    body: "GPT-4o-mini polishes the transcript with built-in presets — Email, Slack, Bullets — or write your own prompt. Streams live into the HUD.",
  },
  {
    badge: "Hotkeys",
    title: "Global, fully customizable",
    body: "Rebind the hold-to-talk key, the formatter toggle, or any preset 1–9. Chord shortcuts work in every app.",
  },
  {
    badge: "Privacy",
    title: "Your data stays local",
    body: "No telemetry. No accounts. Settings, presets, and history live on your Mac. Audio goes only to the provider you chose.",
  },
  {
    badge: "Reliability",
    title: "Clipboard-safe paste",
    body: "Your previous clipboard contents are snapshot before the paste and restored automatically. Nothing gets clobbered.",
  },
  {
    badge: "Updates",
    title: "Signed, notarized, auto-updating",
    body: "Releases ship through GitHub. The app downloads new versions in the background and offers a one-click install in the menu bar.",
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
            Built for people who type for a living — and would rather speak
            half the time.
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
