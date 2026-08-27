# UI tokens (CSS)

Canonical **Institutional Ink** tokens for web portals and the guest payment page.

| Source | Role |
| --- | --- |
| [`UI-Style-Lock.md`](UI-Style-Lock.md) | Locked palette, type, glass radius |
| [`UI-Figma-Prompt.md`](UI-Figma-Prompt.md) | Motion durations / easing |
| Figma [`VjnnzGqWIo1q2aLRLdA89p`](https://www.figma.com/design/VjnnzGqWIo1q2aLRLdA89p/Untitled?node-id=14-2) page **00 Design System** | Visual source of truth |

Figma has **no published Variables collections** yet (queried 2026-08-27). CSS files are the implementation source until Variables are published.

## Files (keep in sync)

| App | Path |
| --- | --- |
| Portals (`apps/web`) | `apps/web/src/styles/tokens.css` |
| Guest pay | `apps/payment-page/public/tokens.css` |

## Token map

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0B0F14` | Page background |
| `--surface` | `#12181F` | Cards / panels |
| `--border` | `#1E2A36` | Hairlines |
| `--teal` / `--accent` | `#00D4C8` | Payment-order rail, primary CTA |
| `--teal-hover` / `--teal-pressed` | `#00F1E6` / `#00B2AA` | Button states (Figma 02) |
| `--warn` | `#FFB703` | Service-bill rail, pending badge, soft urgency |
| `--anomaly` | `#FF5A6A` | Payment Anomaly, danger button |
| `--ok` | `#00E676` | Confirmed / completed (Figma 02) |
| `--muted` / `--footer` | `#8A9BB0` / `#5A6A7A` | Secondary / footer copy |
| `--radius-card` | `12px` | Glass cards |
| `--control-h` | `40px` | Default control height (32 / 48 sm/lg) |
| `--motion-micro` | `120ms` | Icon swap, micro feedback |
| `--motion-ui` | `280ms` | QR appear, fades, drawers |
| `--motion-emphasis` | `600ms` | KPI count-up, status morph |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances |

Platform ops UI also uses `--plat-gold*` (amber gold) — not guest-pay teal.

## Components (Wave 8.3)

Aligned to Figma frame **02 — Components** (`15:4`):

| Primitive | CSS / module |
| --- | --- |
| Buttons (primary / secondary / ghost / danger + sizes + loading) | `apps/web/src/styles/components.css` |
| Status badges + verifying breathe / anomaly pulse | `components.css` + `apps/web/src/shared/StatusBadge.tsx` |
| Text focus / error | `.field input` / `.cg-input` in `components.css` |
| Toasts / banners | `.cg-toast*`, `.cg-banner*` |

Pending payment → `tone-warn`; verifying → `tone-teal`; confirmed/completed → `tone-ok`. Platform shell may still override with gold/pill chrome.

## Motion + reduced motion

Payment page (Wave 8.2): QR enter uses `--motion-ui`; scan-line and verifying pulse are disabled under `prefers-reduced-motion: reduce`. Countdown urgency classes (`.countdown--warn` / `.countdown--critical`) shift color without looping animation when reduced motion is preferred.
