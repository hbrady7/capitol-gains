import React from "react";

/**
 * A tiny, dependency-free renderer for the briefing/self-review markdown subset.
 * Supports: #/##/### headings, **bold** inline, - / "  - " bullets, and blank-line
 * paragraph breaks. Builds React elements (no dangerouslySetInnerHTML), robust to
 * arbitrary input. Everything else renders as a plain paragraph.
 */

/** Split a line into React nodes, turning **bold** into <strong>. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p !== "")
    .map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
        return (
          <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-[var(--text)]">
            {p.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={`${keyPrefix}-t${i}`}>{p}</React.Fragment>;
    });
}

export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  const src = (children ?? "").replace(/\r\n/g, "\n");
  const lines = src.split("\n");

  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 space-y-1.5 pl-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed muted">
            <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
            <span>{inline(b, `li-${key}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "") {
      flushBullets();
      continue;
    }

    const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
      continue;
    }
    flushBullets();

    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2], `h-${key}`);
      if (level === 1) {
        blocks.push(
          <h2 key={`h-${key++}`} className="mt-4 mb-1 text-lg font-semibold tracking-tight first:mt-0">
            {content}
          </h2>,
        );
      } else if (level === 2) {
        blocks.push(
          <h3 key={`h-${key++}`} className="mt-4 mb-1 text-sm font-semibold uppercase tracking-wide faint first:mt-0">
            {content}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={`h-${key++}`} className="mt-3 mb-1 text-sm font-semibold">
            {content}
          </h4>,
        );
      }
      continue;
    }

    blocks.push(
      <p key={`p-${key++}`} className="my-2 text-sm leading-relaxed muted first:mt-0">
        {inline(trimmed, `p-${key}`)}
      </p>,
    );
  }
  flushBullets();

  return <div className={className}>{blocks}</div>;
}
