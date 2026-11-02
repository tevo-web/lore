# Third-party components

Lore's own code is MIT-licensed. These components keep their own licences. Check upstream for the exact, current terms before you redistribute.

## Shipped with the app

| Component | Use | Licence |
|---|---|---|
| [Electron](https://www.electronjs.org/) (includes Chromium) | App shell and rendering engine | MIT (Chromium parts: BSD-style and others, see Electron's `LICENSES.chromium.html` in every build) |
| [@ghostery/adblocker](https://github.com/ghostery/adblocker) | Filter-list matching engine | MPL-2.0 |
| [@mozilla/readability](https://github.com/mozilla/readability) | Article text extraction for the AI features | Apache-2.0 |
| [EasyList and EasyPrivacy](https://easylist.to) | Bundled in `desktop/src/filters/engine.bin`, compiled at build time by `npm run filters` (the file is not committed) | Dual: GPLv3+ and CC BY-SA 3.0. Credit: easylist.to |

## Landing page only (`site/`)

| Component | Use | Licence |
|---|---|---|
| [Google Sans](https://github.com/googlefonts/googlesans) | Font of the landing page, self-hosted in `site/assets/fonts/` so visitors' browsers contact no font server | SIL Open Font License 1.1 (`site/assets/fonts/OFL.txt`) |

## Downloaded at runtime (not redistributed)

| Component | Use | Notes |
|---|---|---|
| [ABPVN](https://abpvn.com) | Vietnam-specific ad filters | Downloaded into the user's data folder, **not bundled**, because its redistribution terms are unclear. Ask ABPVN before bundling |
| [uBlock Origin filters](https://github.com/uBlockOrigin/uAssets) (filters, quick-fixes) and [Ghostery scriptlet resources](https://github.com/ghostery/adblocker) | Rules that remove ads from sites such as YouTube by editing the page's data before it is used | Downloaded into the user's data folder, **not bundled** (GPLv3 lists in an MIT app). Run in the page before its own scripts |
| [Phishing.Database](https://github.com/mitchellkrogza/Phishing.Database) | Reported phishing domains for the scam warning | Downloaded weekly into the user's data folder. Licensed MIT upstream |
| [Wikipedia](https://www.wikipedia.org) | Short excerpts for plain questions, always shown with a link to the article | Text is CC BY-SA 4.0 (and GFDL). Lore shows the article title and link as credit |

## Build tools only (not shipped)

| Component | Use | Licence |
|---|---|---|
| [electron-builder](https://www.electron.build/) | Packaging installers | MIT |

The desktop app updates the compiled filters at most once a week. That request reveals only the user's IP address to the list host.
The planned Rust core (`core/`, based on [adblock-rust](https://github.com/brave/adblock-rust), MPL-2.0) is meant to replace the JavaScript engine so desktop and mobile share one implementation.

## If you add a dependency

It must be compatible with MIT distribution. Add it to the right table above, with its licence, in the same pull request.
