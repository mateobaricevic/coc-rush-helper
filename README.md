# Rush Helper

A small, static Clash of Clans strategic rush planner based on [CallMeTee’s Strategic Rush Bible](https://docs.google.com/document/d/1zP792qWKVN14hVX_RW4Mui65yRTqqtHaEaj_jwUY-us/edit), as read on October 12, 2026 (guide header: August 24, 2026).

## Run

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:5173. Or use `npm run dev` when Node is installed. Deploy the `dist/` folder with any static host. There are no production dependencies or API keys.

## Deploy free with GitHub Pages

[GitHub Pages is free for public repositories on GitHub Free](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). This project uses GitHub Actions to test and publish only `dist/`.

1. Create a **public** repository on GitHub and push this project to its `main` branch.
2. In the repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Open **Actions → Deploy to GitHub Pages → Run workflow** on `main`. Future pushes to `main` deploy automatically; pull requests run checks without publishing.
4. The deployment links to your site, usually `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

The assets use relative URLs, so repository names and Pages subdirectories work without editing a base URL. The workflow installs Node 22 and development dependencies for validation; the deployed site is plain HTML, CSS, JavaScript, fonts, and the bundled game data. No ChatGPT Sites setup is needed.

[GitHub’s Pages setup instructions](https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically) cover enabling the deployment source.

## Use

In Clash, open **Settings → More Settings → Export village data in JSON format → Copy**. Paste the JSON or upload a file. A sample village is included. All village analysis runs in the browser; saving to local storage is optional and off by default. Clear removes the saved snapshot. This app makes no village-data network requests.

The site opens in dark mode. The header theme button switches between dark and light and remembers your choice on this browser. Clearing a village keeps the theme preference.

The parser accepts the real export (`data`, `lvl`, `cnt`, `timer`), named arrays/objects, and partial official player API responses. Home Village buildings, heroes, traps, troops, spells, pets, and equipment are supported. Builder Base is not scheduled; B.O.B’s Hut is used to detect a sixth builder. Unknown IDs produce a visible data note. Partial profiles cannot verify building priorities or Town Hall readiness.

Recommendations follow one continuous hero builder, offensive capacity, required placements and merge sources, relevant research unlocks, pets, and storage. At TH18, multiple hero upgrades and core defenses become priorities. Equipment choices are explicit user selections, rather than a hard-coded claim about the current meta. Costs/times are base values from the bundled data, adjusted only by the chosen Gold Pass discount. Active timers are seconds remaining **at export**, not a live sync.

Town Hall weapon requirements and storage affordability need an in-game check. The app does not claim to certify all prerequisites, simulate ore/chests/events, or calculate a completion date. The guide contains some historical and conflicting advice; this implementation follows its main Rushing Guidelines, Hero Upgrade Strategy, and Tee Rush sections and exposes that judgment in each recommendation.

## Source and checks

- `dist/engine.js`: normalization and deterministic recommendation rules.
- `dist/app.js`: import, sample, optional persistence, plan views, and text download.
- `dist/theme.js` and `dist/theme.css`: dark/light themes and independent theme persistence.
- `.github/workflows/pages.yml`: validation and deployment to GitHub Pages.
- `dist/game-data.json`: compact snapshot of [ClashKingAssets game data](https://github.com/ClashKingInc/ClashKingAssets), fetched October 12, 2026; Town Halls 1–18. The data source can contain unknown/zero upgrade costs or timers, displayed as “check in game.”
- `npm install` then `npm test` tests parser compatibility, important recommendation decisions, imports, settings, tabs, persistence, equipment selection, and downloads. The DOM test library is a development dependency only.
- `node scripts/check.mjs` validates static assets and JavaScript syntax.

Independent fan tool, not affiliated with Supercell. The linked guide and original game data belong to their respective authors/owners.
