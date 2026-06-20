/**
 * G100b: regression check against French strings leaking into the English
 * i18n section of `frontend/src/i18n/index.js`.
 *
 * Background: the i18n file holds `fr:` and `en:` blocks in a single
 * object. Copy-paste while adding new keys is the usual way a French
 * phrase ends up under `en:` — the bug is invisible until a user toggles
 * to English and sees "Connexion" in the navbar.
 *
 * This script reads the file, splits at the `en:` marker, and greps the
 * English half for known French-only words. It exits non-zero on a hit
 * so `npm run lint` (and CI) catches the regression before merge.
 *
 * Adding new tokens: append to FRENCH_ONLY below. Pick words that have
 * no English homograph — "menu" appears in both languages, "compte"
 * doesn't.
 *
 * Run: node frontend/scripts/check-i18n-leaks.mjs
 * Wire-up: see frontend/package.json scripts.lint chain.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_PATH = resolve(__dirname, "..", "src", "i18n", "index.js");

// French-only signal words — none of these are English homographs.
// Add more whenever a real leak slips through. Lower-case; matching
// is case-insensitive on string values.
//
// DELIBERATELY NOT FLAGGED — these are French loanwords or game
// terminology that the project keeps in French even in the English UI:
//   - bistro / bistrot (brand)
//   - partie / parties (game cycle term, kept untranslated by design)
//   - manche / manches (game cycle term, kept untranslated by design)
//   - elo (rating; both languages)
const FRENCH_ONLY = [
  "compte",
  "connexion",
  "déconnexion",
  "inscription",
  "s'inscrire",
  "se connecter",
  "mot de passe",
  "veuillez",
  "joueur",
  "joueurs",
  "chargement",
  "votre",
  "êtes",
  "déjà",
  "réessayer",
  "actualiser",
  "paramètres",
  "tableau de bord",
  "rejoindre",
  "créer",
  "annuler",
  "supprimer",
  "envoyer",
];

const src = readFileSync(I18N_PATH, "utf8");

// Split at the `  en: {` marker. The fr section is everything before;
// the en section everything after. Anchors guard against false positives.
const enMarker = src.search(/^\s+en:\s*\{/m);
if (enMarker === -1) {
  console.error("Couldn't find `en:` section in i18n file. Aborting.");
  process.exit(2);
}
const enHalf = src.slice(enMarker);

// Scan only value strings (between quotes). Comments / keys can legitimately
// contain French words.
const stringValues = enHalf.matchAll(/"((?:\\.|[^"\\])*)"/g);

const leaks = [];
for (const match of stringValues) {
  const value = match[1].toLowerCase();
  for (const word of FRENCH_ONLY) {
    // \b doesn't work cleanly with French accents — use a manual boundary.
    const re = new RegExp(`(?:^|[^a-zà-ÿ])${word}(?:$|[^a-zà-ÿ])`, "i");
    if (re.test(value)) {
      leaks.push({ word, value: match[1] });
    }
  }
}

if (leaks.length > 0) {
  console.error("French strings detected in the English i18n section:\n");
  for (const { word, value } of leaks) {
    console.error(`  • "${word}" found in: "${value}"`);
  }
  console.error(
    "\nFix: replace these with English equivalents in `frontend/src/i18n/index.js` " +
      "under the `en:` block. If a flagged word is a false positive (e.g. " +
      "a brand name or technical term), add an allowlist entry to this script.",
  );
  process.exit(1);
}

console.log("i18n leak check passed — no French strings in the English section.");
