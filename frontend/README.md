# Frontend — 421 Bistro

React/Vite single-page application for the 421 multiplayer dice game. Served as static files by the FastAPI backend in production; runs as a dev server with proxy during local development.

## Tech stack

| | |
|---|---|
| Framework | React 19, react-router-dom v7 |
| Build tool | Vite 8 |
| Styling | Plain CSS (design tokens in `src/styles.css`) |
| i18n | Custom lightweight system (`src/i18n/index.js`) |
| HTTP | `fetch` via `src/api/` — no external HTTP library |
| Real-time | Native `WebSocket` via `src/hooks/useGame.js` |
| Linting | ESLint 10 (react-hooks, react-refresh plugins) |

## Scripts

```bash
npm run dev      # dev server on :3000, proxies /api /auth /ws to localhost:8421
npm run build    # production build → ../static/dist/
npm run lint     # ESLint check
npm run preview  # preview the production build locally
```

The dev server (`vite.config.js`) proxies:

| Prefix | Target |
|---|---|
| `/api`, `/auth` | `http://localhost:8421` |
| `/ws` | `ws://localhost:8421` (WebSocket upgrade) |

## Directory structure

```
src/
├── api/
│   ├── auth.js          # Auth endpoints (register, login, me, reset)
│   └── game.js          # Room create/join, rankings, profile
├── assets/              # Static images and SVG icons
├── components/
│   ├── layout/
│   │   ├── Footer.jsx   # Site footer (links, GDPR, lang)
│   │   └── PageLayout.jsx
│   └── shared/
│       ├── Avatar.jsx   # Initials-based player avatar
│       ├── ChipStack.jsx
│       ├── ComboTable.jsx
│       ├── Die.jsx      # Animated pip die (paper & mini variants)
│       ├── Segment.jsx
│       ├── ShareButtons.jsx
│       ├── Stepper.jsx
│       └── TopBar.jsx   # Sticky header — responsive burger menu on mobile
├── context/
│   ├── LangContext.jsx  # Active language + setLang, persisted to localStorage
│   └── ThemeContext.jsx # light/dark theme toggle, persisted to localStorage
├── hooks/
│   ├── useAuth.js       # JWT storage, user state, login/logout helpers
│   └── useGame.js       # WebSocket lifecycle, game state machine
├── i18n/
│   └── index.js         # All translation strings (FR + EN) and useT() factory
├── pages/
│   ├── CreateRoom.jsx
│   ├── ForgotPassword.jsx
│   ├── Game.jsx
│   ├── Home.jsx
│   ├── HowToPlay.jsx
│   ├── Lobby.jsx
│   ├── Login.jsx
│   ├── Privacy.jsx
│   ├── Profile.jsx
│   ├── Rankings.jsx
│   ├── ResetPassword.jsx
│   ├── TermsAndConditions.jsx
│   └── Waiting.jsx
├── styles.css           # Design tokens + all shared CSS classes
├── App.jsx              # Router and top-level layout
└── main.jsx             # Entry point
```

## Translations (i18n)

All UI strings live in `src/i18n/index.js` as a plain JS object keyed by locale (`fr`, `en`). There is no external dependency.

### Adding or editing a key

1. Add the key to **both** `fr` and `en` objects in `src/i18n/index.js`:

```js
// src/i18n/index.js
fr: {
  my_new_key: "Texte en français",
},
en: {
  my_new_key: "Text in English",
},
```

2. Use it in a component via the `useLang` context hook:

```jsx
import { useLang } from '../context/LangContext.jsx'

function MyComponent() {
  const { t } = useLang()
  return <p>{t('my_new_key')}</p>
}
```

### Parameterised strings

Use `{placeholder}` syntax in the value and pass a params object as the second argument:

```js
// definition
log_charge_takes: "{name} takes {n} chip(s) · Pool: {pool}",

// usage
t('log_charge_takes', { name: 'Alice', n: 3, pool: 8 })
// → "Alice takes 3 chip(s) · Pool: 8"
```

### Fallback behaviour

- Missing key in the active language → falls back to `fr`
- Missing key in both languages → returns the key string as-is and logs a `console.warn` in dev mode

### After editing translations

The app is served from the compiled bundle — changes to `src/i18n/index.js` only take effect after a build:

```bash
npm run build
```

## Theme system

Light/dark mode is toggled via `ThemeContext`. The active theme is written as `data-theme="light|dark"` on the `<html>` element and persisted to `localStorage`.

All colours are CSS custom properties defined in `src/styles.css` under `:root` (light defaults) and `[data-theme="dark"]` (overrides). To add a new colour token:

```css
/* src/styles.css */
:root               { --my-token: #abc; }
[data-theme="dark"] { --my-token: #xyz; }
```

Then reference it anywhere with `var(--my-token)`.

## Design tokens

| Token | Role |
|---|---|
| `--paper` / `--paper-soft` / `--paper-deep` | Page and surface backgrounds |
| `--ink` / `--ink-soft` / `--ink-mute` / `--ink-fade` | Text hierarchy (dark → faded) |
| `--rouge` / `--rouge-deep` / `--rouge-soft` | Bistro red — CTAs, active states, errors |
| `--brass` / `--brass-deep` / `--brass-soft` | Warm gold — chips, accents |
| `--felt` / `--felt-deep` / `--felt-soft` | Table felt green — game surface |
| `--rule` | Borders and dividers |

## Responsive layout

The `TopBar` shows a burger menu on viewports ≤ 640 px. The drawer contains all nav links, the lang toggle, the theme toggle, and the login/logout action. No CSS framework is used — all breakpoints are plain `@media` queries at the bottom of `styles.css`.

## Production build

```bash
npm run build
```

Outputs to `../static/dist/` (the `static/` directory at the project root). The FastAPI backend serves this directory at the root path. The multi-stage `Dockerfile` builds the frontend automatically inside Docker — no manual build step is needed for container deployments.
