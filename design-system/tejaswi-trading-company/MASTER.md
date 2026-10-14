# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/tejaswi-trading-company/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. If not, follow the rules below.
>
> Started from `ui-ux-pro-max --design-system` (Inventory & Stock Management, density 7), then corrected
> to the decisions already made for this app on 2026-10-14. Live example of every component: `/design` in `apps/web`.

**Project:** Tejaswi Trading Company EMS: internal app for a wholesale rice business
**Users:** owner, accountant, staff, mostly on phones in a godown or shop counter
**Stack:** Next.js 16, Tailwind v4, shadcn (`base-luma` preset, `olive` base), lucide icons, next-intl
**Languages:** English, Kannada (ಕನ್ನಡ), Hindi (हिन्दी)

---

## Source of truth for tokens

Colors, radius and fonts live in `apps/web/app/globals.css` (`:root`, `.dark`, `@theme inline`).
Use semantic utilities only (`bg-primary`, `text-muted-foreground`, `bg-brand-surface`, …).

| Role | Token | Use |
|------|-------|-----|
| Primary (green) | `primary` | the one main action per screen, active nav tab, money-in |
| Destructive (red) | `destructive` | delete, low stock, errors |
| Muted | `muted`, `muted-foreground` | secondary text, quiet surfaces |
| Brand surface / ink | `brand-surface`, `brand-ink` | the cream and black of the printed logo |
| Hero gradient | `brand-surface` → `hero-via` → `hero-to` | photo placeholders until real images exist |

**Never** write hex or Tailwind palette colors (`#f6f2e8`, `bg-amber-100`) in components; add a token instead.

## Typography

- Sans: Inter (`--font-sans`); headings: `--font-heading` (set in `app/layout.tsx`).
- Kannada and Devanagari fall back to Noto Sans Kannada / Noto Sans Devanagari (not preloaded).
  Latin fonts don't contain these scripts; never pick a font without checking script support.
- Minimum text size **12px** (`text-xs`); body 14–16px; inputs 16px on mobile so iOS doesn't zoom.
- Brand wordmark stays in English in every language.

## Style

**Flat.** Clean lines, light borders, little or no shadow (`shadow-xs` at most on pills), no 3D, no decorative gradients
(the hero placeholder is the only gradient and it is replaced by a photo). Transitions 150–200ms on color/opacity only.

## Layout

- Mobile first. Check every page at 375–390px, 768px, 1024px, 1440px. No horizontal page scroll.
- Content width `max-w-5xl`, side padding `px-4`.
- Shell on every signed-in page: sticky header (brand left; search, notifications, profile right) + fixed bottom nav
  (Home, Products, Orders, Accounts, Inventory; never more than 5). Content gets bottom padding so nothing hides behind it.
- Grids start with `grid-cols-1` so long content can't widen a column on phones.

## Touch & interaction

- Tap targets **≥ 44×44px** on everything interactive (`size-11` icon buttons, `h-11` inputs and chips), **≥ 8px** apart.
- Every icon-only button has an `aria-label`. Focus rings stay visible.
- Feedback for every action: pressed state (`active:translate-y-px`), loading state on submit, toast on result.
- Respect `prefers-reduced-motion` (global rule in `globals.css`).

## Component patterns

| Pattern | Build with | Notes |
|---------|-----------|-------|
| Primary CTA | `Button` default, `size="lg"` full width on mobile | one per screen |
| Transaction pill | rounded-full row: icon, label, green `+` | home page actions |
| Info card | `Card` + `CardTitle` + `CardDescription` + paragraph + footer button | summaries |
| Product card | image → name/category/badge → pack-size chips → price (tax details collapsible) → price & quantity → godown allocation slider + chips → CTA | sale page spec |
| Rows of data | `Item` list on phones; `Table` only from `md` up | ledgers, carts, staff |
| Status label | `Badge` (default / secondary / outline / destructive) | |
| Field | visible `Label` above input, hint below, error next to the field | never placeholder-only labels |
| OTP | 6 separate bordered boxes (`InputOTP`) | |
| Empty / coming soon | `Empty` with icon, title, one-line description | |

## Pre-delivery checklist

- [ ] Semantic tokens only; no hex or palette colors in components
- [ ] Every screen text goes through `next-intl` (`messages/en.json`, `kn.json`, `hi.json`)
- [ ] Tap targets ≥ 44px, ≥ 8px apart; icon buttons labelled
- [ ] No text under 12px; contrast ≥ 4.5:1
- [ ] Works at 390px with no horizontal scroll; content clear of header and bottom nav
- [ ] Loading, empty and error states exist
- [ ] Focus visible; reduced motion respected
- [ ] Lucide icons only; no emoji as icons
