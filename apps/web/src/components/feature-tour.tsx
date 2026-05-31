import { FeatureSpotlight } from "./feature-spotlight";

const spotlights = [
  {
    badge: "Dynamic island",
    title: "A bar that stays out of your way",
    body: "A thin pill rests at the bottom of your screen. Hover to switch language, formatting, or provider — then it tucks away.",
    points: [
      "Hover to expand, leave to collapse",
      "Never steals focus",
      "Hide it entirely if you like",
    ],
    demoLabel: "Dynamic island demo",
  },
  {
    badge: "Multilingual",
    title: "Speak the language you think in",
    body: "Auto-detects your language, or lock one for the cleanest results.",
    points: [
      "12+ languages, plus auto-detect",
      "Works on every provider",
      "Switch in one click",
    ],
    demoLabel: "Multilingual demo",
    reverse: true,
  },
  {
    badge: "Hold-to-talk",
    title: "Press, speak, release",
    body: "Hold your hotkey anywhere, say what you mean, let go. Text lands at the cursor.",
    points: [
      "Works in every app",
      "Your clipboard is restored",
      "Rebind to any key",
    ],
    demoLabel: "Hold-to-talk demo",
  },
  {
    badge: "Formatter",
    title: "Edit the AI prompt yourself",
    body: "Pick Email, Slack, or bullets — or write your own instructions. Your transcript is cleaned up before it lands.",
    points: [
      "Email / Slack / Bullets presets",
      "Write your own prompt",
      "Toggle with a shortcut",
    ],
    demoLabel: "Formatter demo",
    reverse: true,
  },
];

export function FeatureTour() {
  return (
    <section
      id="tour"
      className="relative border-b border-[var(--color-border)] py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[var(--container-wide)] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
            Take the tour
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            What you can do
          </h2>
          <p className="mt-4 text-[var(--color-text-muted)]">
            Talk in any app, in your language.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-20 sm:gap-28">
          {spotlights.map((s) => (
            <FeatureSpotlight key={s.badge} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}
