import {
  GITHUB_URL,
  PRODUCT_AUTHOR,
  PRODUCT_AUTHOR_URL,
  PRODUCT_NAME,
  RELEASES_URL,
} from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg)] py-10">
      <div className="mx-auto flex max-w-[var(--container-wide)] flex-col items-center justify-between gap-4 px-6 text-sm text-[var(--color-text-muted)] sm:flex-row">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-4 w-4 rounded bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-strong)]"
          />
          <span>
            {PRODUCT_NAME} · crafted by{" "}
            <a
              href={PRODUCT_AUTHOR_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-accent)]"
            >
              {PRODUCT_AUTHOR}
            </a>
          </span>
        </div>

        <nav className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-wider">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--color-text)]"
          >
            GitHub
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--color-text)]"
          >
            Releases
          </a>
          <a
            href={`${GITHUB_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--color-text)]"
          >
            MIT
          </a>
        </nav>
      </div>
    </footer>
  );
}
