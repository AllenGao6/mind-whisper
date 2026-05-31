import { FeatureSpotlight } from "./feature-spotlight";

const spotlights = [
  {
    badge: "Dynamic island",
    title: "A tiny bar that stays out of your way",
    body: "A thin pill rests at the bottom of your screen. Hover it to switch your language, choose a formatting style, or change the transcription provider — then it tucks itself away again.",
    points: [
      "Hover to expand, move away to collapse",
      "Never steals focus from the app you're typing in",
      "Hide it entirely from the menu bar if you'd rather not see it",
    ],
    demoLabel: "Dynamic island demo",
  },
  {
    badge: "Multilingual",
    title: "Speak in the language you think in",
    body: "MindWhisper detects what you're speaking automatically — or lock it to a specific language for the cleanest results. No settings spelunking.",
    points: [
      "12+ languages, plus auto-detect",
      "Works across OpenAI, Deepgram, and Groq",
      "Switch language in one click from the bar",
    ],
    demoLabel: "Multilingual demo",
    reverse: true,
  },
  {
    badge: "Hold-to-talk",
    title: "Press, speak, release — it's pasted",
    body: "Hold your hotkey in any app, say what you mean, and let go. The text appears right where your cursor is. No window to open, no buttons to click.",
    points: [
      "Works everywhere on your Mac",
      "Your previous clipboard is saved and restored",
      "Rebind the key to whatever feels natural",
    ],
    demoLabel: "Hold-to-talk demo",
  },
  {
    badge: "Formatter",
    title: "Turn rambling speech into clean writing",
    body: "Pick Email, Slack, or bullet points — or write your own instructions — and your transcript is tidied up before it lands. Great for messages you'd otherwise rewrite.",
    points: [
      "Built-in Email / Slack / Bullets presets",
      "Bring your own prompt",
      "Toggle it on or off with a shortcut",
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
            Talk in any app, in your language. Here&apos;s the gist.
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
