import { DemoPlaceholder } from "./demo-placeholder";
import { PROVIDER_KEY_URLS } from "@/lib/constants";

type Provider = {
  name: string;
  note: string;
  href: string;
};

const providers: Provider[] = [
  {
    name: "OpenAI",
    note: "Whisper — reliable, widely available",
    href: PROVIDER_KEY_URLS.openai,
  },
  {
    name: "Deepgram",
    note: "Nova-3 — streams text as you talk",
    href: PROVIDER_KEY_URLS.deepgram,
  },
  {
    name: "Groq",
    note: "Whisper — very fast, very cheap",
    href: PROVIDER_KEY_URLS.groq,
  },
];

type Step = {
  index: string;
  title: string;
  body: string;
};

const steps: Step[] = [
  {
    index: "01",
    title: "Grab a key from a provider",
    body: "Create a free account with OpenAI, Deepgram, or Groq and copy an API key. You only need one to start.",
  },
  {
    index: "02",
    title: "Open Settings → Providers",
    body: "Click the MindWhisper menu-bar icon, open Settings, and go to the Providers tab.",
  },
  {
    index: "03",
    title: "Paste your key",
    body: "Drop the key in, pick that provider, and you're done. The key is stored locally on your Mac — never on our servers.",
  },
];

export function Setup() {
  return (
    <section
      id="setup"
      className="relative border-b border-[var(--color-border)] py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[var(--container-wide)] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
            Bring your own key
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            Your key. Your account.
          </h2>
          <p className="mt-4 text-[var(--color-text-muted)]">
            MindWhisper runs on your own API key — that&apos;s how it stays free
            and your audio never touches our servers. Setup takes a minute.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <DemoPlaceholder label="Adding your API key" />

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

        <div className="mt-12">
          <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Get a key
          </p>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
            {providers.map((provider) => (
              <a
                key={provider.name}
                href={provider.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between gap-3 bg-[var(--color-bg)] p-6 transition-colors hover:bg-[var(--color-surface)]"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium tracking-tight text-[var(--color-text)]">
                    {provider.name}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {provider.note}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-[var(--color-text-dim)] transition-colors group-hover:text-[var(--color-accent)]"
                >
                  ↗
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
