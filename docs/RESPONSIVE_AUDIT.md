# Responsive UX Audit (G63)

**Date:** 2026-05-30
**Scope:** code-level review of every `/frontend/src/pages/` component plus shared layout components that influence multiple pages.
**Method:** static analysis of inline styles, CSS-in-JS grids, and existing media queries in `styles.css`. No browser-driving tests run — findings should be verified live against the suspected viewport widths.

---

## Breakpoint contract (proposed)

To stabilise the audit's vocabulary, this doc uses four named breakpoints. Current code uses an inconsistent mix (560 / 600 / 640 / 700 / 720 / 820 / 880 / 900 / 980 / 1180 px). [[G63]]'s follow-up implementation work should land on this contract:

| Name      | Range            | Layout intent                                                |
|-----------|------------------|--------------------------------------------------------------|
| `mobile`  | ≤ 640 px         | Single column, burger nav, stacked panels                    |
| `tablet`  | 641 – 959 px     | Compact desktop or wide mobile depending on page             |
| `laptop`  | 960 – 1439 px    | Full desktop layout, side rails compress                     |
| `desktop` | ≥ 1440 px        | Full layout with breathing room                              |

The current TopBar burger flips at **880 px** (`styles.css:687`). Most page grids collapse at one of **640 / 700 / 720 / 820 / 900 px**. There is **no breakpoint targeting the 960 – 1180 px laptop band** outside the game room, so several two-column layouts feel cramped right above their 900 px collapse point.

No page enforces a viewport-aware `min-height` / `overflow` plan for the "100 %-zoom-too-tall" problem — that pattern lives only in `Game.jsx` and is broken there too (see [[G62]]).

---

## Per-page findings

### AdminDashboard.jsx
- **HIGH** — Summary grid hard-codes `repeat(6, 1fr)` with only one breakpoint at 900 px (`AdminDashboard.jsx:92, 107`). Between 900 – 1100 px each cell drops below ~140 px and the `0.58rem` eyebrow label wraps awkwardly under a 2-digit count.
- **MED** — Eyebrow label `fontSize: 0.58rem` (`AdminDashboard.jsx:99`) is well below the 14 px comfort threshold. Will be unreadable on a real 375 px phone.
- **MED** — Skips the laptop band: three `PanelStub` at `1fr 1fr 1fr` only collapse at 900 px. Between 900 – 1100 px the body copy narrows uncomfortably.
- **LOW** — Outer `maxWidth: 1100`, padding `2.5rem 1.5rem` survives mobile.

**Overall** — Holds together at 1280 / 1920 px and at 375 px. Awkward zone is 900 – 1100 px plus the 0.58 rem eyebrow on mobile.

### CompleteProfile.jsx
- **LOW** — `maxWidth: 520` centered card scales fine; `clamp(2rem, 5vw, 2.8rem)` headline does the right thing.
- **LOW** — Birthdate `<input type="date">` on iOS Safari may hit a min-height the design can't control; verify visually but no code change indicated.

**Overall** — Cleanest page in the bunch. No real issues.

### Contact.jsx
- **LOW** — Two-up name/email row collapses at 560 px. Should fire at 640 px for consistency.
- **LOW** — `<textarea rows={5}>` with `resize: vertical` and no `maxHeight` is fine on mobile.

**Overall** — Solid. Raise the row breakpoint to 640 px.

### CreateRoom.jsx
- **HIGH** — `ConfigRow` uses `gridTemplateColumns: '1fr 1.2fr'` (`CreateRoom.jsx:126`) and only collapses at 720 px. At 768 px tablet the hint column is ~200 px while "Comment la banque (11 fiches)…" wraps to 3+ lines; the Stepper / toggle has slack on the right — bad rhythm in the tablet band.
- **MED** — `Stepper` + `afk_bot` toggle row uses `flexWrap: 'wrap'`. At 375 px the inline label "L'ordi prend la main" risks pushing below the Stepper. Acceptable; verify visually.
- **LOW** — `maxWidth: 920` wastes desktop real estate but doesn't cause issues.

**Overall** — Mostly fine; the 720 px collapse is too low — should fire at 900 px so tablets get the stacked layout.

### ForgotPassword.jsx
- **MED** — `fontSize: 2.8rem` headline (`ForgotPassword.jsx:31`) is hard-coded, not `clamp()`. At 375 px the line break "Pas de panique, / cher client" is tight.

**Overall** — Trivially fixable — swap to `clamp(2rem, 7vw, 2.8rem)`.

### Game.jsx
- See **[[G62]]** in `docs/ROADMAP.md` for piste overflow, off-screen action bar, PlayerStrip dice/name overlap, and "⚙ Room rules" button width.
- **EXTRA — MED** — Main game grid `gridTemplateColumns: '260px 1fr 320px'` (`Game.jsx:119`) has no inline breakpoints in this file's style; the rail-collapse breakpoints (~980 / 1180 px noted in the codebase) must live in `styles.css` or be absent. Confirm during G62 implementation.
- **EXTRA — LOW** — `maxWidth: 640` and `maxWidth: 900` summary states (`:522, :563, :634`) are fine.

**Overall** — Covered by [[G62]]. Recommend G62 explicitly add `@media (max-width: 1180px)` (collapse right rail) and `@media (max-width: 980px)` (collapse left rail).

### Home.jsx
- **MED** — Hero grid `1.2fr 1fr` only collapses at 900 px. Between 900 – 1180 px the right-hand "piste" illustration competes with the form column; H1 `clamp(3.5rem, 8vw, 5.5rem)` hits ~7.5 rem at 1024 px — verify "JOUEZ AU 421" doesn't wrap badly.
- **MED** — Option cards `repeat(3, 1fr)` jump straight to `1fr` at 900 px — no 2-up intermediate. At 768 px tablet you get a single tall column for three small cards.
- **MED** — Rules teaser `2fr 3fr` collapses at 900 px; the `ticket` wrapper has no `overflow-x: auto`. If `ComboTable` has its own min-width this can overflow on phones.
- **LOW** — Game-code input row uses `flex` with `gap: 10` and no `flex-wrap`; at very narrow widths the "Rejoindre" button could push below — confirm at 375 px.
- **LOW** — `stamp` at `top: 6%, right: -2%` (negative offset) could clip if container hits viewport edge on narrow phones.

**Overall** — Fine on desktop and 375 px; soft spots are the 900 – 1180 px band and the missing 2-up option-card step.

### HowToPlay.jsx
- **MED** — `VocabRow` uses `gridTemplateColumns: 'minmax(140px, 1fr) 3fr'` (`HowToPlay.jsx:166`). At 375 px the 140 px term column eats 40 % of screen width and definition gets ~200 px.
- **LOW** — `rules-2col` collapses at 640 px. Adequate.
- **LOW** — Long page but `maxWidth: 900` + normal scroll, no fixed elements.

**Overall** — Generally solid. `VocabRow` should stack `<dt>` / `<dd>` below ~640 px.

### Lobby.jsx
- **HIGH** — Room table grid `'1fr auto auto auto auto'` for header (`Lobby.jsx:84`) and `'1fr auto auto auto'` for rows (`Lobby.jsx:98`) — **column count mismatch**. The "Banque" header column has no row content beneath it; columns will not align. Below ~640 px the auto columns force horizontal scroll on the parent `card` with no `overflow-x` strategy.
- **MED** — No mobile media query collapses the table to cards. At 375 px the auto columns + truncated host name + "Rejoindre" button needs ~360 px just for fixed-width content.
- **LOW** — Refresh button `padding: 0.5rem 1rem` with no enforced min height — likely OK via `.btn` defaults.

**Overall** — Header/row mismatch is a real bug; mobile lacks a card-view fallback.

### Login.jsx
- **MED** — Auth grid `1fr 1fr` collapses at 900 px. Between 900 – 1100 px the branding column gets a tall headline and the right `ticket` form competes for breath — typical tablet awkwardness.
- **LOW** — Labels at `fontSize: 0.9rem` — close to the 0.875 rem floor; acceptable.
- **LOW** — Long `RegisterForm` gives mobile a multi-screen scroll with no anchor links — acceptable for a registration flow.
- **LOW** — Google SSO button from `@react-oauth/google` has its own min width; can overflow at 375 px depending on locale. Verify visually.

**Overall** — Reasonable. The 900 – 1100 px band is the main risk.

### Privacy.jsx
- **LOW** — `maxWidth: 800` body, `clamp()` headline, `<code>` inline tag — all safe.

**Overall** — Clean. No code-level concerns.

### Profile.jsx
- **HIGH** — Profile header `'auto 1fr auto'` (`Profile.jsx:43`) packs avatar + name + Elo ticket on one row, collapses at 820 px. At 768 px tablet the middle column gets ~430 px but H1 `clamp(2rem, 4vw, 3rem)` is ~3 rem; the Elo ticket has `minWidth: 180` which steals room from username + admin badge + button. At 980 px laptop with an admin user this is the tightest spot.
- **MED** — Stats grid `repeat(4, 1fr)` collapses to `repeat(2, 1fr)` at 820 px. Below 820 the 2-up is good. No mobile 1-up — at 375 px two cards per row with `'2rem'` display digits feels OK but tight.
- **MED** — Combo chart row `'auto 1fr auto'` with `width: 80` label and `width: 32` count. At 375 px the bar (1fr) gets <100 px — a sliver.
- **MED** — Recent games row `'auto auto 1fr auto'` with `width: 48` date + empty `1fr` filler — wastes horizontal space without conveying info.
- **MED** — `EditProfileCard` two-up grid collapses at 600 px — should fire at 640+ for consistency.
- **MED** — `GdprCard` `'1fr 1fr'` collapses at 700 px. At 768 px tablet the two cards (Export / DELETE confirmation) squeeze and the "DELETE" input loses room.
- **LOW** — Avatar block `flexWrap: 'wrap'` and 72 px avatar — fine.

**Overall** — Most issues are tablet-band (700 – 900 px) plus the admin-row crowding in the header. Mobile acceptable.

### Rankings.jsx
- **HIGH** — Podium grid `'1fr 1.2fr 1fr'` (`Rankings.jsx:31`) has **no media query**. At 375 px three podium cards with avatars, names, Elo, badge text squeeze into ~115 px each. Almost certain to clip names or wrap badge text into 4+ lines.
- **HIGH** — Full-table grid `'60px 1fr auto auto auto'` for header (`:62`) and rows (`:75`) has **no breakpoint**. At 375 px the rank column + avatar + name + Elo + 2 numbers is impossible. Will trigger horizontal scroll inside the card — except `overflow: hidden` on the card (`:60`) means content is **silently clipped** rather than scrollable.
- **MED** — `overflow: hidden` on the card is worse than `overflow-x: auto` — users can't even pan to see what's hidden.
- **LOW** — `fontSize: 0.55rem` on the "you" tag (`:88`) is unreadable but it's small by design.

**Overall** — Weakest page on mobile. Needs both a podium stack and a table-to-card collapse below ~640 px.

### ResetPassword.jsx
- **MED** — `fontSize: 2.8rem` hard-coded headline (`ResetPassword.jsx:51`). Same issue as ForgotPassword. Two-line `<br />` "Choisissez / un nouveau mot" can crash at 375 px.

**Overall** — Same fix as ForgotPassword: use `clamp()`.

### TermsAndConditions.jsx
- **LOW** — `maxWidth: 800` with `clamp()` headline; body 1.7 line-height. Safe.

**Overall** — Clean.

### Waiting.jsx
- **MED** — Main grid `'1.2fr 1fr'` collapses at 900 px. Between 900 – 1100 px the right "Room settings" card with `height: fit-content` floats next to a tall player list — visually OK but `SummaryRow` value strings (e.g. "45s · L'ordi prend la main") at `fontSize: 1.05rem` can wrap below 360 px right-column width.
- **MED** — Game-code block `<div className="code-block">` uses large monospace text; no `overflow-wrap`. Verify long codes alongside `ShareButtons` at 375 px.
- **LOW** — `flexWrap: 'wrap'` on the code/share row is correct.
- **LOW** — Player rows have `minHeight: 44` — good tap target.

**Overall** — Holds up well. Soft issues in the 900 – 1100 px band and possible value-string wrap in the right rail.

---

## Shared components

### TopBar.jsx
- **MED** — Burger flip at 880 px (`styles.css:687`). Between 835 – 880 px desktop links + user dropdown + Avatar + username can run tight (the ~835 px "quirk band" noted earlier). [[G19]] partially addressed this.

### RoomSettingsPanel.jsx
- **LOW** — Modal `maxWidth: 460, width: 100%, maxHeight: 85vh, overflow-y: auto` — exemplary modal sizing.
- **LOW** — Close button `padding: 4, fontSize: 1.4rem` — tap target is ~28 px, **below the 40 × 40 floor**. Mobile users may miss it.

### ComboTable.jsx (not opened)
- Risk noted from `Home.jsx` and `HowToPlay.jsx` usage: parent `ticket` wrappers have no `overflow-x: auto`. If `ComboTable` has fixed column widths it can overflow on phones. Worth a separate inspection during implementation.

---

## Punch list — top 10, ordered by impact

These should each become a roadmap entry (G64+) when picked up:

1. **[[G62]] (already roadmapped)** — Game.jsx: piste overflow, off-screen action bar, PlayerStrip overlap, "⚙ Room rules" width, rail-collapse breakpoints at 980 / 1180 px.
2. **Rankings.jsx full-table grid** has no breakpoint and `overflow: hidden` silently clips content (`Rankings.jsx:60, 62, 75`). Collapse to card-list below ~640 px; flip `overflow` to `auto`.
3. **Rankings.jsx podium** `1fr 1.2fr 1fr` has no breakpoint (`Rankings.jsx:31`). Stack vertically (or 1-up with #1 on top) below ~640 px.
4. **Lobby.jsx room-list column count mismatch** (`Lobby.jsx:84` vs `:98`) plus no mobile collapse. Fix the column structure (the "Banque" header column with no row content is a bug) and add a 640 px card-view collapse.
5. **AdminDashboard.jsx summary grid** `repeat(6, 1fr)` only collapses at 900 px (`AdminDashboard.jsx:92`). Add an intermediate breakpoint around 1100 px (4-up) or 760 px (3-up). Bump 0.58 rem eyebrow to 0.7+ rem.
6. **Profile.jsx header** `auto 1fr auto` squeezes admins between 820 – 1024 px (`Profile.jsx:43`). Collapse the Elo ticket below the name earlier, or wrap the admin-button cluster.
7. **Profile.jsx GdprCard** collapses too late at 700 px. Bump to 820 px so the DELETE confirmation input has room on tablet.
8. **CreateRoom.jsx ConfigRow** collapses at only 720 px (`CreateRoom.jsx:133`). Bump to 900 px for the tablet band.
9. **Home.jsx option cards** jump from `repeat(3, 1fr)` straight to `1fr` at 900 px. Add a 2-up step between 560 – 900 px.
10. **ForgotPassword.jsx & ResetPassword.jsx** hard-coded `fontSize: 2.8rem` headlines. Convert to `clamp()` for parity with other pages.

**Bonus (lower priority but cheap):**
- `RoomSettingsPanel.jsx` close button tap target (~28 px → 40 px).
- `ComboTable.jsx` horizontal-overflow wrappers on Home / HowToPlay.

---

## What this audit does NOT cover

- Actual browser rendering at each breakpoint (this is a code-level analysis — verify findings live, especially for `iOS Safari` quirks on `<input type="date">` and the `@react-oauth/google` button width).
- Performance (CLS, LCP, hydration cost). Out of scope.
- Print stylesheets, RTL layout, very-large-screen (4K+) behaviour.
- Accessibility beyond tap-target size — colour contrast, focus indicators, keyboard navigation should get their own audit.

Verify each high-impact finding live before opening the follow-up fix PR — code-level analysis catches structural issues but misses what *looks* fine vs *feels* fine in actual use.
