"use client";

import { useEffect, useState } from "react";
import { DOWNLOAD_ARM64, DOWNLOAD_X64, RELEASES_URL } from "@/lib/constants";

type Arch = "arm64" | "x64";

function detectArch(): Arch {
  if (typeof navigator === "undefined") return "arm64";
  const ua = navigator.userAgent;
  // Apple Silicon Macs commonly report "Intel Mac OS X" — that's a Safari/Chrome
  // quirk and not a reliable Intel signal. We only treat as Intel if we have an
  // additional hint; otherwise default to Apple Silicon (the modern majority).
  const isMac = /Mac OS X|macOS/i.test(ua) || /Mac/i.test(navigator.platform);
  if (!isMac) return "arm64";

  // Newer Chromium exposes a real arch via UA-CH (high entropy) — but that needs
  // an async call. Skip it for now and use the simple default.
  return "arm64";
}

export function DownloadButton() {
  const [arch, setArch] = useState<Arch>("arm64");

  useEffect(() => {
    setArch(detectArch());
  }, []);

  const primaryUrl = arch === "arm64" ? DOWNLOAD_ARM64 : DOWNLOAD_X64;
  const secondaryUrl = arch === "arm64" ? DOWNLOAD_X64 : DOWNLOAD_ARM64;
  const primaryLabel =
    arch === "arm64" ? "Download for Apple Silicon" : "Download for Intel Mac";
  const secondaryLabel = arch === "arm64" ? "On Intel?" : "On Apple Silicon?";
  const secondaryArchLabel = arch === "arm64" ? "x64" : "arm64";

  return (
    <div className="flex flex-col items-center gap-3 sm:items-start">
      <a
        href={primaryUrl}
        className="group relative inline-flex items-center gap-2.5 rounded-lg bg-[var(--color-text)] px-5 py-3 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_30px_-8px_rgba(139,156,255,0.6)] transition-transform hover:scale-[1.02] active:scale-100"
      >
        <AppleIcon className="h-4 w-4" />
        <span>{primaryLabel}</span>
        <span className="hidden text-[var(--color-text-dim)] sm:inline">·</span>
        <span className="hidden font-mono text-xs text-[var(--color-text-muted)] sm:inline">
          .dmg
        </span>
      </a>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <a
          href={secondaryUrl}
          className="underline decoration-[var(--color-border-strong)] underline-offset-4 transition-colors hover:text-[var(--color-text)]"
        >
          {secondaryLabel} Download {secondaryArchLabel}
        </a>
        <span aria-hidden className="text-[var(--color-text-dim)]">
          ·
        </span>
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--color-border-strong)] underline-offset-4 transition-colors hover:text-[var(--color-text)]"
        >
          All releases on GitHub
        </a>
      </div>

      <p className="font-mono text-[11px] text-[var(--color-text-dim)]">
        Signed &amp; notarized · macOS 11+ · Free, open source
      </p>
    </div>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.05 12.04c0-2.86 2.34-4.23 2.45-4.3-1.34-1.96-3.42-2.23-4.16-2.26-1.77-.18-3.45 1.04-4.35 1.04-.9 0-2.28-1.02-3.76-.99-1.93.03-3.71 1.12-4.7 2.85-2.01 3.49-.51 8.65 1.43 11.49.95 1.38 2.07 2.94 3.55 2.88 1.43-.06 1.97-.92 3.7-.92 1.72 0 2.21.92 3.72.89 1.54-.03 2.51-1.41 3.44-2.8 1.09-1.6 1.54-3.16 1.56-3.24-.04-.02-2.97-1.14-3-4.54M14.4 3.78c.78-.95 1.31-2.27 1.17-3.58-1.13.05-2.5.76-3.31 1.71-.72.83-1.36 2.18-1.19 3.46 1.27.1 2.56-.65 3.33-1.59" />
    </svg>
  );
}
