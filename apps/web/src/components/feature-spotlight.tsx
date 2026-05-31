import { DemoPlaceholder } from "./demo-placeholder";

type FeatureSpotlightProps = {
  badge: string;
  title: string;
  body: string;
  points?: string[];
  demoLabel: string;
  /** Flip the layout so the demo sits on the left. */
  reverse?: boolean;
};

export function FeatureSpotlight({
  badge,
  title,
  body,
  points,
  demoLabel,
  reverse,
}: FeatureSpotlightProps) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div className={reverse ? "lg:order-2" : undefined}>
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
          {badge}
        </span>
        <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
          {title}
        </h3>
        <p className="mt-4 leading-relaxed text-[var(--color-text-muted)]">
          {body}
        </p>
        {points && points.length > 0 && (
          <ul className="mt-5 flex flex-col gap-2.5">
            {points.map((point) => (
              <li
                key={point}
                className="flex items-start gap-2.5 text-sm text-[var(--color-text-muted)]"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-accent)]"
                />
                {point}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>
        <DemoPlaceholder label={demoLabel} />
      </div>
    </div>
  );
}
