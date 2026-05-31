type QA = { q: string; a: React.ReactNode };

const faqs: QA[] = [
  {
    q: "What macOS permissions does MindWhisper need?",
    a: (
      <>
        Three: <strong>Microphone</strong> to record your voice,{" "}
        <strong>Accessibility</strong> so the global hotkey works in any app,
        and <strong>Automation (System Events)</strong> to send the paste
        keystroke. macOS will prompt for each on first launch.
      </>
    ),
  },
  {
    q: "Where does my audio go?",
    a: (
      <>
        Audio is sent only to the transcription provider you choose — OpenAI,
        Deepgram, or Groq — using your own API key. MindWhisper itself has no
        server, no telemetry, no account system. Settings, presets, and
        history live on your Mac in <code className="font-mono text-xs">~/Library/Application Support</code>.
      </>
    ),
  },
  {
    q: "Which providers can I use?",
    a: (
      <>
        OpenAI Whisper (batch), Deepgram Nova-3 (WebSocket streaming, lowest
        latency), and Groq Whisper (very fast batch). You can configure one or
        all three and switch from the menu bar.
      </>
    ),
  },
  {
    q: "How is this different from Wispr Flow?",
    a: (
      <>
        MindWhisper is free and open source, runs on your own provider keys, and
        keeps your data on your Mac. You pay cents per minute instead of a
        monthly subscription.
      </>
    ),
  },
  {
    q: "What does it cost?",
    a: (
      <>
        The app is free and open source (MIT). You pay only the provider for
        what you transcribe — typically fractions of a cent per minute.
      </>
    ),
  },
  {
    q: "Apple Silicon or Intel?",
    a: (
      <>
        Both. Signed and notarized DMGs are published for{" "}
        <code className="font-mono text-xs">arm64</code> (Apple Silicon) and{" "}
        <code className="font-mono text-xs">x64</code> (Intel). The download
        button above picks the right one for your Mac.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-[var(--container-content)] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
            FAQ
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            Common questions
          </h2>
        </div>

        <div className="mt-12 divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {faqs.map((item, i) => (
            <details
              key={i}
              className="group [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-6 px-6 py-5 text-sm font-medium tracking-tight text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]">
                <span>{item.q}</span>
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--color-text-muted)] transition-transform group-open:rotate-45"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <div className="px-6 pb-5 text-sm leading-relaxed text-[var(--color-text-muted)]">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
