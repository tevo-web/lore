# Lore feature backlog

Source: planning conversation with the owner (Thanh, Tevo). Positioning, moat and agent safety rules are in the project brief (`CLAUDE.md`, kept out of the public repository). This file is a prioritized backlog, not a committed scope. Priorities are proposals; confirm with the owner before building anything marked P2 or later.

## How to use this file
- Every feature must pass one gate: **does it make personal memory or the agent better, or does it protect the user visibly?** If not, defer it.
- IDs are stable. Reference them in issues and commits (e.g. `MEM-01`).
- Priority: **P0** = MVP (Android, months 2-5), **P1** = Beta (months 5-8), **P2** = after iOS/desktop (months 7-14), **P3** = long term.
- Platform column: A = Android, I = iOS, D = desktop. iOS is limited by WebKit (no Chromium, narrower extension and blocking APIs); flag any feature that cannot ship on iOS.
- Anything touching browsing history or page content must run **on device** unless the row says otherwise.

## 1. Memory and agent (moat)

| ID | Feature | Behavior | Pri | Platform | Notes and dependencies |
|---|---|---|---|---|---|
| MEM-01 | Ask about what I read | Natural-language search over visited pages by meaning ("hôm qua tôi đọc bài nào nói về lãi suất?"). Returns pages with date and snippet. | P0 · **Done (desktop)** | A I D | Local SQLite + on-device embeddings. Start collecting from first launch. Needs encrypted storage. |
| MEM-02 | Auto collections | Cluster related pages into topics (travel, shopping) without manual saving. | **Done (desktop)** | A I D | Depends on MEM-01 embeddings. Replaces bookmarks as primary organizer. Topics: pages are grouped by words their titles share (three or more pages), shown as chips in Memory; pressing one narrows the list. No model needed. Not yet: naming a topic with a model, or collections saved as bookmark folders. |
| MEM-04 | Ask across everything I read | One question answered from **many** pages in memory, each claim cited [1][2] back to the page it came from. Extends to "compare these tabs". | **Done (desktop)** | D (then A I) | Reuses MEM-01 and the cited-answer code. Best quality needs the local embedding model; without it, keyword search only. Market note: others do this in the cloud; Lore can do it on device. Ask in the intent bar ("tìm lại bài báo tuần trước về xe điện"): a model answers from the best pages with numbered citations that link to them; citations that point to nothing are dropped, and with no valid citation no answer is shown. Verified with a stand-in model; real model quality not measured. |
| MEM-05 | Daily digest | End-of-day summary on device: what you read, what is worth keeping, loose ends. Saved into memory. | **Done (desktop)** | D (then A I) | Replaces EXP-03. No server. Opt-in. "Summarize today" in Memory: titles and sites of the last day, a short note from a model (or a plain count without one). On demand only; not saved, no scheduled digest yet. |
| MEM-06 | Pick up where you left off | The New tab page offers a short "resume" strip: the groups you had open yesterday, pages read recently, loose ends from the daily digest. One click reopens a group. | **Done (desktop)** | D (then A I) | Dia's "Morning Brief" pulls in calendar and inbox; Lore does the useful part with only what is on the device (session, memory, bookmarks). No account connections. Builds on tab groups and MEM-05. The New tab page lists the last three sites from Memory (last three days). Not yet: reopening a whole group, loose ends from the digest. |
| MEM-03 | Memory review and delete | User can see, search, and delete anything stored; per-site and time-range delete; export. | P0 · **Done (desktop)** | A I D | Required for trust. Ship together with MEM-01. |
| AGT-01 | Confirmed agent tasks | Agent performs multi-step web tasks and **always stops for explicit confirmation** before payment, send, delete, settings changes, terms acceptance, or personal-data submission. | P1 · Partly (engine and a local demo only) | A I D | See agent safety rules in `CLAUDE.md`. Confirmation card shows exact item and amount. |
| AGT-02 | Smart form fill | Fill forms (passenger, address, contact) from on-device profile data. Never auto-fill passwords or card numbers; use the platform credential manager. | P1 | A I D | Needs form-field understanding (page parsing, may use cloud tier with redacted values). |
| AGT-03 | Price and change watching | "Báo tôi khi vé này dưới 700k" or "báo khi trang này đổi". Checks while the browser is open, desktop notification. | P1 | D (then A I) | Desktop: **local checks only, no server**. Mobile background limits apply; decide before building. |
| AGT-04 | Recurring tasks | "Mỗi đầu tháng đóng tiền điện, nước, internet." Always confirms before paying. | P1 · Partly done (desktop) | A I D | Depends on AGT-01 and a local scheduler. Menu > AI > Automations: a list of prepared texts posted on a schedule (every N minutes, daily or weekly, from a start to an end) while Lore is open. Nothing runs until the person approves the exact texts; changing any text, the site or the schedule removes the approval; at most one run at a time; three failures in a row pause it; a failed post leaves its window open and the text on the clipboard. Ready-made use case: eight posts introducing a Lore feature, one an hour today, on Facebook. Tested end to end only against stand-in composer pages on this computer, never against the real Facebook, LinkedIn or X, whose pages change often and may refuse automation. Not done: reading and watching pages (AGT-03), summaries on a schedule, running while Lore is closed. |
| AGT-05 | Workflow library (first 10-20) | Narrow, reliable workflows for Vietnamese services: utility bills, flights/trains, e-commerce, public services. | P1 | A I D | Quality over quantity. Track per-workflow success rate. |
| AGT-06 | Learn a workflow by demonstration | User does a task once, Lore records and replays it. | P3 | A D | High risk; needs strong sandboxing. Basis for a future skill marketplace. |
| AGT-07 | Skill marketplace | Third parties publish workflows; revenue share. | P3 | A I D | Needs review, signing, permission model. |

## 2. AI on the page

| ID | Feature | Behavior | Pri | Platform | Notes |
|---|---|---|---|---|---|
| AI-01 | Intent bar router | One input accepts URL, question, task, memory query, download request; routes to the right handler (see `docs/ai-model-strategy.md`). | P0 · **Done (desktop)** | A I D | Works with and without Vietnamese diacritics. |
| AI-02 | Answer-first results | Direct answer with cited sources; original page one tap away. | P0 · **Done (desktop)** | A I D | Every claim linkable to a source. |
| AI-03 | Page summary and Q&A | Summarize current page, ask questions about it, quote the source passage. | P0 · **Done (desktop)** | A I D | Truncate pages before cloud calls (see cost notes in AI strategy). |
| AI-04 | In-place translation | Translate in layout; bilingual mode for long articles. | P0 · **Done (desktop)** | A I D | On-device model where quality is acceptable, otherwise cloud. |
| AI-05 | Side assistant panel | Trailing panel (desktop) or sheet (mobile) for assistant without leaving the page. | P1 · **Done (desktop)** | A I D | Already sketched in mockups. |
| AI-06 | Clean reader | Reader mode without ads, popups, cookie banners, with optional summary on top. | **Removed (desktop)** | A I D | Dropped in November 2026: people did not use it, and the page-reading code remains for the AI features. Bring it back only if users ask. |
| AI-07 | Read aloud (Vietnamese) | Text-to-speech for articles. Prefer on-device voice. | P1 | A I D | Check Vietnamese voice quality per platform. |
| AI-08 | Compare tabs | Select 2-3 product tabs, produce a comparison table. Prices and terms are quoted verbatim, never guessed. | **Done (desktop)** | A I D | Part of MEM-04. Tab menu > Compare Tabs with AI (also on a group): pick 2 to 4 pages, get a table. Figures not found on their page are marked with a warning. Verified with unit tests; not tried with a real model. |
| AI-10 | Safe reading for AI (injection shield) | Before page text reaches a model: strip hidden text (zero-size, off-screen, aria-hidden, same-colour-as-background), warn when text tries to command the assistant, and always show what was sent. | **P0 · Done (desktop)** | A I D | **Prerequisite for any agent that acts on pages.** Shipped: hidden-text removal, invisible-character stripping, fence protection, EN/VI order detection with notice; see `docs/ai-safety.md`. Still open: image-borne text, per-site allowlist. Prompt injection is the unsolved problem of AI browsers (see section 11). Builds on the existing text-extraction step. |
| AI-11 | Zero-config on-device AI | One-click setup: detect the machine, recommend a small multilingual model that handles Vietnamese, download and test it. | **Done (desktop)** | D (then A) | The privacy promise today needs a manual Ollama install. Check model licence and download size. Evaluate with the Vietnamese eval set first. Settings > AI > "Set up AI on this computer": needs Ollama installed and running (opens its download page if not), picks a Qwen 2.5 model by memory size, downloads it and the embedding model, tests an answer and switches to it. Model choice and Vietnamese quality not yet evaluated. |
| AI-12 | PDF and file questions | Drop a PDF or document, ask questions, answers cite the page. | **Done (desktop)** | D | Same as DL-06 for the viewer; this is the Q&A on top. PDF tabs work with the page assistant: text is read on this computer with pdf.js and passages carry "(page N)". Scanned PDFs (no text layer) give "not enough text". No file drop yet; no highlight in the PDF viewer. |
| AI-13 | Organize tabs with AI | Groups open tabs by what they are about (a trip, a project), names the groups, finds duplicate tabs, and shows the plan before changing anything, with undo. The same flow files loose bookmarks into folders. | **Done (desktop)** | D (then A) | Without a model, tabs are grouped by site. Page titles and addresses go to the model only when the person opens the window; the window says where they went. Sensitive sites (banks, health) are left out. Next: suggest which old tabs to close, re-group as new tabs open. |
| AI-14 | AI bookmark | When a page is starred, a model suggests a clean title, a folder (an existing one if it fits) and a one-line note. Search finds bookmarks by the note. | **Done (desktop)** | D (then A) | Runs once, only with a model set up; the page title is kept unless it is poor. Next: semantic search over bookmarks, "what was this for?" reminders. |
| AI-15 | AI in the browser's own features | Bring the same idea to other defaults: smart names for downloads, a one-line "why I opened this" on history rows, find-in-page that answers a question, a new-tab page that resumes what you were doing. | **Done (desktop)** | D | Each one runs on demand or after an explicit action, never in the background. Pick by what people use most. Done: New tab resume strip, find-in-page offers "Ask Lore" for a question, "Suggest a name" for a finished download (reads a PDF's first page). Not done: a note on history rows. History window: "What is it?" on a row writes a one-line note from the text Memory kept (on request only). |
| AI-16 | AI off for chosen sites | A switch per site (and a default list: banks, health, mail) that stops Lore from reading that page for any AI feature, and shows the shield state in the address bar. | P1 · Partly done (desktop) | D (then A I) | Dia offers this only to company admins. For Lore it is a privacy feature for everyone: the person decides what the assistant may read. Today sensitive hosts are skipped for memory, organize and bookmarks; this makes the list visible and editable. Done: a per-site switch in the shield panel stops the page assistant, compare and Memory text capture for that site. Not done: a list to manage the sites, a default list (banks, health, mail), and the shield state in the address bar. |
| AI-09 | Explain terms and contracts | Select text, get plain-language explanation and flags for unfavorable clauses. | P2 | A I D | Show disclaimer; not legal advice. |

## 3. Privacy and safety (visible and measurable)

| ID | Feature | Behavior | Pri | Platform | Notes |
|---|---|---|---|---|---|
| PRV-01 | Ad and tracker blocking | Network-level blocking with `adblock-rust`, EasyList-style lists plus a Vietnam-specific list. | P0 · **Done (desktop)** | A D (I via Content Blocker) | Block counter feeds home screen and shield panel. |
| PRV-02 | Scam and phishing warning | Warn on fake bank, e-wallet, parcel and lottery pages, and risky links. | P0 · **Done (desktop)** | A I D | Highest day-one value, little dependence on LLM. Source for the list is an open question (see below). |
| PRV-03 | Cookie banner cleanup | Auto reject non-essential cookies and dismiss banners. | P0 · **Done (desktop)** | A I D | |
| PRV-04 | Weekly privacy report | Trackers blocked, top trackers, data saved. Shareable. | **Done (desktop)** | A I D | Data from PRV-01. Privacy report window (Tab menu or the shield panel): last 7 days of blocked trackers, removed tracking tags and https upgrades, top trackers, copyable summary. Counts only, kept 30 days, no addresses. |
| PRV-05 | Ephemeral tab | Self-destructing tab (after N minutes or on close), isolated from memory. | **Done (desktop)** | A I D | Tab menu > New Self-Destructing Tab: a private tab that closes itself after 5, 15 or 60 minutes (warning one minute before). |
| PRV-06 | Biometric lock | Lock private tabs and memory with biometrics. | P1 · Partly done (desktop) | A I | Touch ID on a Mac that has it, for Memory, asking about your history, private tabs, and the password manager (asked again every 5 minutes). Not available on Windows or Linux: Electron has no biometric API there, so the switch is disabled. |
| PRV-07 | Email aliases | One-time email aliases for sign-ups. | P2 · Done (desktop), untested | A I D | Needs a mail relay service; privacy and cost review first. Settings > Privacy: Addy.io or SimpleLogin with your own API key; Tab menu > Create Email Alias copies a new address. Lore runs no relay. Written to the services' documented APIs and tested with a stand-in server only, never against a real account. |
| PRV-08 | Breach check | Warn if saved credentials appear in known breach data. | **Done (desktop)** | A I D | Use k-anonymity style lookups; never send credentials. Tab menu > Check a Password, and "Check breaches" in the password list: SHA-1 prefix lookup (k-anonymity) on Pwned Passwords; the password never leaves. Not done: automatic warning when a saved login appears in a breach. Passwords window: "Check all for breaches" runs the lookup on every saved login (on request, not in the background). |
| PRV-09 | VPN | WireGuard, kill switch, split tunneling. Partner first. | P1 | A I D | Store policy and legal review required. |
| PRV-11 | HTTPS-first | Upgrade to HTTPS when possible and warn before an insecure page. | **Done (desktop)** | A I D | Parity with privacy browsers. Plain http addresses are sent to https first (not for local or home-network addresses); if https fails, a page explains and offers to open over http for this run. Switch in Settings and in the shield panel. |
| PRV-12 | Encrypted DNS | DNS over HTTPS with a visible setting. | **Done (desktop)** | A D | Parity. Mention in the privacy report. Settings > Privacy: Off, Automatic (the DNS provider's secure option when there is one), Cloudflare or Quad9. Not measured on real networks. |
| PRV-13 | Strip tracking parameters | Remove `utm_*`, `fbclid`, `gclid` and similar from links before loading. | **Done (desktop)** | A I D | Small and visible. Keep a per-site off switch. utm_*, fbclid, gclid, msclkid and similar are removed from the address of a page before it loads; other parameters are left as written. Per-site off in the shield panel. |
| PRV-14 | Profiles and site containers | Separate profiles (work, personal, one-off): their own tabs, logins, memory and AI settings; switch from the tab strip. | **Done (desktop)** | A D | Each profile has its own logins and site data, open tabs, memory, bookmarks and favicons. Switch from the avatar at the start of the tab strip (shown once there are two profiles) or the Profile menu; add, rename, recolour and delete in Settings > Profiles. Shared by all profiles: the AI model, tasks, settings, downloads. Switching closes the other profile's tabs (they come back, unloaded, when you return) and private tabs are not kept. Not yet: a different AI model per profile, a profile per window, moving a tab between profiles. |
| PRV-15 | Privacy at a glance | One small panel (from the shield) with plain switches: memory on or off, ad and tracker blocking, AI may read this page, share anything to improve Lore (off). Shows what each one did today. | **Done (desktop)** | D (then A I) | Dia's home page leads with the same five switches. Lore already has the settings; the gain is putting them where people look. Pairs with PRV-04 and AI-16. Clicking the shield opens a small panel: ads and trackers, clean links (per site), https first, Memory, AI may read this page (per site), report link. "Share data" is shown as Never. Per-site AI off is AI-16. |
| PRV-10 | Private mode wipe | Wipe cookies, cache, history on private tab close; anti-fingerprinting; block third-party cookies by default. | P0 · **Done (desktop)** | A I D | |

## 4. Downloads and media

| ID | Feature | Behavior | Pri | Platform | Notes |
|---|---|---|---|---|---|
| DL-01 | Media detection and download | Detect HLS/DASH/MP4 requests, floating download button, quality options, multi-connection, resume, ffmpeg merge. | P1 · Partly (plain files and HLS) | A D (I limited) | **Skip DRM.** Store builds must not offer downloads from YouTube/Netflix-class platforms. Keep isolatable per build. |
| DL-02 | Download queue | Wi-Fi-only option, resume after loss, auto cleanup. | P1 | A I D | |
| DL-03 | Bulk download | Download all images/documents from a page. | P2 | A D | |
| DL-04 | Background and PiP playback | Audio and video continue in background; picture-in-picture. | P1 | A I D | |
| DL-05 | Save for offline | Save a page for offline reading with AI summary. | P2 | A I D | |
| DL-06 | Built-in PDF viewer | View, annotate, summarize, ask questions about PDFs. | **Merged into BRW-17 and AI-12** | A I D | Tevo already has PDF editor work ("PDF Bench"); evaluate reuse. Do early: contracts and reports are daily office work. See AI-12. Closed: PDFs open in the tab and can be asked about. Annotating is not planned for now. |

## 5. Local advantage (Vietnam and Southeast Asia)

| ID | Feature | Behavior | Pri | Platform | Notes |
|---|---|---|---|---|---|
| VN-01 | Vietnamese language understanding | No diacritics, abbreviations, slang, mixed Vietnamese-English in intent bar and agent. | P0 · **Done (desktop)** | A I D | Core of the eval set. |
| VN-02 | Local payments and identity | VNPay, MoMo, ZaloPay, bank QR, VNeID when available. | P1 | A I D | Legal and partner review before agent-driven payments. |
| VN-03 | Public service lookup | Traffic fines, tax, insurance, administrative procedures by natural-language question. | P1 | A I D | |
| VN-04 | E-commerce price compare | On product pages, compare Shopee, Lazada, Tiki, TikTok Shop with price history. | P2 | A I D | Check each site's terms and anti-bot behavior. |
| VN-05 | Share to Zalo | Quick share sheet targets local platforms. | P1 | A I | |
| VN-06 | Vietnamese voice input | Voice query with regional accent tolerance. | P2 | A I D | Evaluate speech-to-text providers on Vietnamese accents. |

## 6. Cross-device and Tevo ecosystem

| ID | Feature | Behavior | Pri | Platform | Notes |
|---|---|---|---|---|---|
| SYN-01 | End-to-end encrypted sync | Sync bookmarks, passwords, and **memory index** across devices; server cannot read it. | P2 | A I D | Key management design is critical. Primary lock-in feature. |
| SYN-02 | Send tab to device | | P2 | A I D | Needs SYN-01 transport. |
| TEV-01 | Shared Tevo account and premium | One account, one subscription across Tevo apps. | P1 | A I D | Confirm account system with Tevo backend team. |
| TEV-02 | Open Tevo tools in browser | Quick launch of other Tevo apps and tools. | P2 | A I D | |
| EXT-01 | Extension support | Start with compatibility for popular extensions where the engine allows. | P2 | A D | Depends on Android engine decision (Chromium vs Gecko). |

## 7. Experimental (small trials only)
- **EXP-01 Conversational voice browsing:** chained requests ("tìm quán phở gần đây, mở bản đồ, gọi taxi").
- **EXP-02 Focus mode:** user states a goal ("học 1 tiếng"); Lore blocks distracting sites and opens relevant material.
- **EXP-03 Browsing journal:** on-device summary of time spent per topic. (The daily digest, MEM-05, covers the useful part.)
- **EXP-04 Shareable research session:** send a collection with summary to someone who does not use Lore.

## 7b. Everyday work tasks (added after the desktop prototype)

| ID | Feature | Behavior | Pri | Platform | Notes |
|---|---|---|---|---|---|
| WRK-01 | Tasks | Ready-made and user-built tasks (email, reply, calendar event, social post, key facts, explain, study notes, cover letter). Fields are remembered. Drafts open in the user's own webmail or calendar in a new tab. **Lore never sends, posts or books.** | **Done (desktop)** | D | Next: more built-ins from real use, share a task as a file, mobile. |
| WRK-02 | Right-click Lore AI | Rewrite, fix, shorten, expand, tone, translate, explain, summarize on selected text or in a text box. | **Done (desktop)** | D | Next: a small bar that appears on selection. |
| WRK-03 | Mail and calendar awareness | Read the open webmail message (with the user's selection) and the open calendar day, to draft replies and propose free slots. | P2 | D | Needs sign-in inside Lore, which Google may refuse in embedded browsers. Outlook and others first. |
| WRK-04 | Share a task | Export a saved task as a small file (or link to a file) and import one from someone else. No server. | P2 | D | Dia has a "Skills" gallery where people share prompts. Lore starts with files, so nothing is hosted and nothing can be tracked. A gallery (AGT-07) only after review and signing exist. |

## 7c. Quality and release (added November 2026)

| ID | Feature | Behavior | Pri | Platform | Notes |
|---|---|---|---|---|---|
| WEB-01 | Sign-in compatibility | Google, Microsoft, Apple and other OAuth sign-ins complete on popular sites (Lovable, Notion, Figma, GitHub). Pop-ups keep `window.opener` when they are sign-in windows; third-party cookies stay blocked except on a sign-in flow, with a visible per-site exception. | **P0 · Done (desktop)** | D | Today's blocking is all-or-nothing. A site that cannot sign in makes users leave, so this outranks new AI features. Test with a list of 10 real sites. Fixed: pop-up sign-ins keep their opener (verified with a local OAuth-style flow, not yet with ten real sites). |
| REL-01 | Smoke test the packaged app | CI launches the built app on each OS and checks that a window opens and a page loads, before publishing. | **P0 · Done (desktop)** | D | Would have caught the empty-window release. Fixed: `npm run smoke` and a CI step start the packaged app before a release is published. Verified on macOS arm64; Windows and Linux untested. |
| REL-02 | macOS ad-hoc signature, then Developer ID | Ad-hoc sign now so Gatekeeper's "damaged" message is avoided where possible; notarize when a certificate exists. | P1 | D | Document `xattr -cr` as the workaround meanwhile. |
| REL-03 | Auto-update | Check for a signed update and install on restart. | **Done (desktop, partly)** | D | Checks GitHub Releases after start and every six hours (a setting turns it off); Windows and Linux AppImage download and restart by themselves, macOS does so only once builds are signed, and until then shows a notice with a Download button. Checked against a local feed; a real download and restart has not been tried. See docs/release.md. |

## 7d. Browser basics (must exist before anyone switches to Lore)

Every browser has these. Their absence is why people go back to Chrome after a day, whatever the AI can do. Status is for the desktop prototype as of November 2026; checked against the code, not remembered.

| ID | Feature | Behavior | Pri | Platform | Status and notes |
|---|---|---|---|---|---|
| BRW-01 | Find in page | Cmd/Ctrl+F opens a find bar: next, previous, match count, highlight, Esc to close. | **P0 · Done (desktop)** | A I D | Cmd/Ctrl+F opens a find bar at the top right of the page: type to search, Enter and Shift+Enter move, count shown, Esc closes. Also in the right-click menu and the More menu. Not yet: match whole word, case switch. |
| BRW-02 | Bookmarks | Star button, folders, a bookmarks bar toggle, bookmarks page, search. Optional: suggest saving what Memory shows you revisit. | **P0 · Done (desktop)** | A I D | Star in the address bar (Cmd/Ctrl+D) saves or removes a page; bookmarks bar (Cmd/Ctrl+Shift+B) with one-level folders; manager window (Cmd/Ctrl+Alt+B) with search, rename, folder, delete and HTML export (opens in any browser). Stored encrypted. Not yet: import, suggestions in the address bar, nested folders, drag to reorder. |
| BRW-03 | Browsing history page | Chronological list by day, search, delete one, a range or everything. Distinct from Memory's semantic search. | **P0 · Done (desktop)** | A I D | History window (Cmd/Ctrl+Y): by day, search, remove one visit, clear the last hour, day, week, month or all. It is the same list as Memory, so clearing here clears Memory (stated in the window). Private tabs are never recorded. |
| BRW-04 | Downloads manager | Any file download (not only media): progress, pause, cancel, open, show in folder, a list with Cmd/Ctrl+J, ask-where setting. Warn on risky file types. | **P0 · Done (desktop)** | A I D | Every download is tracked: file goes to Downloads with a numbered name if taken, progress, pause, resume, cancel, open, show in folder, remove; window with Cmd/Ctrl+J and a toolbar button that appears after the first download. Programs and installers are marked and never opened without asking. Not yet: ask-where setting, list kept across restarts. |
| BRW-05 | Restore tabs on start | Reopen the previous session after a quit or crash; setting for "new tab" or "continue where I left off". Private tabs are never restored. | **P0 · Done (desktop)** | A I D | Tabs are saved (encrypted, never private tabs) and reopened next start; only the active one loads, the rest load when shown. Setting: Settings > General > On startup. Needs secure storage on the system, otherwise nothing is saved. |
| BRW-06 | Tab management | Reopen closed tab (Cmd/Ctrl+Shift+T), duplicate, close others, close to the right, pin, reorder by dragging, Ctrl+Tab and Cmd+1..9 to switch, middle-click to close. | **P0 · Done (desktop)** | A I D | Right-click a tab: reload, duplicate, pin, close, close others, close to the right, reopen. Reopen closed (Cmd/Ctrl+Shift+T, last 25), Ctrl+Tab and Ctrl+Shift+Tab, Cmd/Ctrl+1 to 9, middle-click closes, drag to reorder, pinned tabs show only the icon and stay in front. Not yet: tab groups. |
| BRW-07 | Address bar security state | Lock icon for HTTPS, a clear warning for HTTP and for certificate errors (with a proper interstitial), click to see the site's permissions and certificate. | **P0 · Done (desktop)** | A I D | A lock chip beside the address: encrypted, "Not secure" on plain http (menu offers the https version), "Certificate ignored". Certificate errors show a full-page warning with reason and a per-host, this-run-only "continue anyway". Menu also clears cookies and data for the site. Not yet: certificate details, HTTPS-first upgrade (PRV-11). |
| BRW-08 | Search engine choice | Pick the default (DuckDuckGo, Google, Bing, Brave, Coccoc), add a custom one, keywords in the address bar. | **Done (desktop)** | A I D | Fixed to DuckDuckGo today. Search-partner revenue (business model) would live here. Settings > General: DuckDuckGo, Google, Bing, Brave, Cốc Cốc or a custom https address with %s. Not done: keywords in the address bar. |
| BRW-09 | Make Lore the default browser | Register for http/https and open links from other apps in Lore; a prompt in settings. | **Done (desktop, partly)** | A I D | Offered at first run. macOS and Linux register Lore for http and https; Windows opens its own default-apps page, because only the person can choose there. Links from other apps open as a new tab in the running Lore. Only works in the installed app, not in a development run, and the Windows and Linux paths have not been tried on those systems. |
| BRW-10 | Clear browsing data | Pick data types (history, cookies, cache, passwords, site data) and a time range; clear on exit option. | **Done (desktop)** | A I D | A wipe-everything action exists; no choices. Settings > Privacy: choose history and Memory, cookies and site data, cached files; the time range applies to history only (cookies cannot be cleared by time). Not done: clear on exit, passwords as a type. |
| BRW-11 | Print and save as PDF | Cmd/Ctrl+P with preview; save the page as PDF. | **Done (desktop)** | A I D | Missing from the menu. View menu: Print (Cmd/Ctrl+P) and Save as PDF. |
| BRW-12 | Password manager | Offer to save, fill, generate, check for reuse; protected by the OS or biometrics; import and export. Never autofill without the user seeing the site. | P1 · Partly done (desktop) | A I D | Missing. Agent rules say use the platform credential manager; decide: own vault, OS keychain, or integrate with an existing manager (Bitwarden, 1Password). Also unblocks AGT-02 and PRV-08. Offers to save after you sign in (Save, Not now, Never for this site), keeps logins encrypted per profile, fills only when you choose Tab menu > Fill Password and only on the saved site, a manager window with generator, copy (cleared after 30 s), reuse and weak flags, and breach check. Not done: import and export, passkeys, filling inside frames, saving from sites that submit without a form. The save prompt was verified only through the preload and main-process path; sign-in detection on real sites is not tested. |
| BRW-13 | Autofill for addresses and contacts | Saved profiles for forms, with the same on-device storage as memory. | P1 | A I D | Shares work with AGT-02. |
| BRW-14 | Import from other browsers | Bookmarks, history and (where the OS allows) passwords from Chrome, Edge, Firefox, Safari, Cốc Cốc; HTML bookmark file. | **Done (desktop, partly)** | D | Bookmarks and history from Chrome, Edge, Brave, Vivaldi, Cốc Cốc, Arc (macOS, Windows; history only), Dia (macOS), Helium and Firefox on this computer, and from an exported bookmarks file, at first run or from the More menu. Not imported: passwords (they are encrypted with keys of each system's keychain), Safari (macOS protects its files), extensions, open tabs. Windows may need the other browser closed, because it locks its history file. |
| BRW-15 | Multiple windows | New window, drag a tab out to make one, private window. | P1 | D | Single window today. |
| BRW-16 | Page zoom per site | Zoom keys exist now; remember the level for each site and show it in the address bar. | **Done (desktop)** | A I D | Keys work on the page (November 2026). Not remembered. The zoom level is remembered for each site and shown briefly when you change it (keys or Ctrl + wheel). Not shown permanently in the address bar. |
| BRW-17 | Built-in PDF and media handling | Open PDFs in the tab, play audio and video in the tab with the usual controls, picture-in-picture. | **Done (desktop)** | A I D | PDF is DL-06; PiP is DL-04. PDFs open in the tab with the built-in viewer; audio and video play in the page. Picture-in-picture not added. Right-click a video > Picture in picture (not in private tabs). Written to the standard web API; not tried with a real video. |
| BRW-18 | Site permissions page | See and change camera, microphone, location, notifications and cookie decisions per site, with a reset. | **Done (desktop)** | A I D | Permissions ask once but cannot be reviewed or undone. Settings > Privacy lists answers given to sites for camera, microphone, location and notifications, with "Ask again" for each. Remembered per profile; private tabs forget them. |
| BRW-19 | Full-screen and presentation | Full screen for a video or the whole window with the bar shown on hover. | P2 · Done (desktop), untested | A I D | Window full screen exists; page full screen not tested. A page that goes full screen covers the whole window and leaves when the page asks. Written to Electron's documented events; not tried with a real video. |
| BRW-20 | Reading list and tab groups | Save for later; group and name tabs, collapse. | **Done (desktop)** | A I D | Groups: name, colour, collapse, drag in or out, right-click menu, kept across restarts, save a group as a bookmark folder and reopen it as a group. Reading list not started. Tab menu > Add to Reading List (Cmd/Ctrl+Shift+L) saves into a "Reading list" bookmark folder. |
| BRW-21 | Accessibility | Keyboard-only use of every control, screen-reader labels, high contrast, minimum font size, caret browsing. | P1 · Partly done (desktop) | A I D | Tooltips with shortcuts exist; a real audit has not been done. Settings > General: smallest text size. Controls have labels and focus outlines, but a full keyboard and screen-reader audit has not been done; caret browsing and a high-contrast mode are not added. |
| BRW-22 | Developer tools and view source | Open the inspector on the page (works, Alt+Cmd+I) and a View source command. | **Done (desktop)** | D | Inspector done; view source missing. View menu: View Page Source (Cmd/Ctrl+U) opens the HTML as text in a window where nothing can run. |
| BRW-23 | Context menu completeness | Open link in new tab or private tab, copy link, save image as, copy image, inspect, search the web for the selection. | **P0 · Done (desktop)** | A I D | Links: open in new tab or private tab, copy address. Images: open, save as, copy, copy address. Selection: copy, search the web, Lore AI. Page: back, forward, reload, find, inspect. |
| BRW-24 | Crash and hang recovery | A crashed tab shows a "reload" page instead of a white tab; the app offers to restore. | **Done (desktop)** | A I D | Not checked. A crashed page shows a "This page stopped working" page with Reload. Verified by crashing a page on purpose. Hangs are not handled. |
| BRW-25 | Split view | Two pages side by side in one window (a meeting and its notes, a doc and a reference), with a draggable divider; the layout is remembered per tab group. | **Done (desktop)** | D | Cmd/Ctrl+Alt+D, or "Open in split view" on a tab's menu, shows two tabs side by side with a draggable divider (double-click resets it to half). Clicking into either side makes it the tab in front; closing one side leaves the other. Not yet: more than two panes, remembering the layout per tab group, dragging a tab onto the edge to split. |
| BRW-26 | Appearance | Light, dark or follow the system, chosen in Settings > General. | **Done (desktop)** | A I D | Also sets the colour scheme that web pages see, so sites with a dark theme follow it. Mobile uses the system setting. |

Done in November 2026: all P0 basics (BRW-01 to BRW-07, BRW-23). Next, by how often people ask: BRW-14 import from other browsers, BRW-12 password manager, BRW-08 search engine choice, BRW-09 default browser, BRW-10 clear data by type, BRW-11 print, BRW-15 multiple windows.

## 8. Explicitly out of scope for now
- Social network or news feed inside the browser (content cost, conflicts with privacy positioning).
- Crypto wallet, games, pay-to-browse rewards (legal risk, brand drift).
- Shipping many features at launch. Each one must pass the gate at the top of this file.

## 9. Status snapshot (desktop prototype, November 2026)

Done: MEM-01 to MEM-06 (MEM-02 without model naming), AI-01 to AI-05, AI-08, AI-10 to AI-15, PRV-01 to PRV-05, PRV-08, PRV-10 to PRV-15, VN-01, WRK-01, WRK-02, REL-01, WEB-01, BRW-01 to BRW-11, BRW-14, BRW-16 to BRW-20, BRW-22 to BRW-26, DL-06 (merged).
Partly done: PRV-06 (Touch ID on Mac only), AI-16, BRW-12 (no import or passkeys), BRW-21 (no full audit), REL-03 and BRW-09 (see rows), AGT-01 (confirm-first engine and browser driver exist, tested against a local demo portal only; **no real service yet**), DL-01 (plain files and HLS, no DASH, resume or ffmpeg merge).
Known problems (fix before adding features):
- **REL-01** (fixed) CI now starts the packaged app and checks that a window opens and a page loads. Verified on macOS arm64 only; Windows and Linux are untested.
- **WEB-01** (fixed) Pop-up sign-ins keep their link to the opener and third-party cookies stay on for sign-in flows. Verified with a local pop-up flow; not tried against ten real sites yet.
Not started: mobile apps, Rust core, VPN, sync, extensions, multiple windows (BRW-15), address autofill (BRW-13), code signing (pipeline written, untested without certificates).

## 9b. Suggested first slice (original MVP, P0)
MEM-01, MEM-03, AI-01, AI-02, AI-03, AI-04, AI-06, PRV-01, PRV-02, PRV-03, PRV-10, VN-01. Start with PRV-02 and MEM-01: PRV-02 gives value on day one without depending on an LLM, and MEM-01 starts accumulating the moat immediately.

## 10. Open questions for the owner
- Data source and update mechanism for the scam/phishing list (own team, partner, public lists)?
- AGT-03: on desktop, checks run locally with no server. Is server-side polling acceptable at all on mobile, given the no-history-to-server promise?
- AI-11: which on-device model, and is it acceptable to ship or download it (licence, size, Vietnamese quality)?
- Which Vietnamese payment and identity partners are realistic in the first year?
- Is the mobile mockup font (currently Be Vietnam Pro and Bricolage Grotesque) to be unified with the desktop font (Google Sans)? Check license before shipping.


## 11. Market review (November 2026)

Method: a web search of roundups and news. The sources are mostly third-party blogs, not vendor documentation, so treat the details as a sketch and check before relying on any single claim.

What the market is doing:
- **AI browsers:** Perplexity Comet, Chrome with Gemini (auto browse is a paid, partly US preview), Edge (Copilot Mode folded into the browser, agent feature "Browse with Copilot"), Opera Neon (paid agent), Dia (mostly paid, macOS). One roundup reports OpenAI stopped Atlas in August 2026; verify.
- **Common pattern:** agents that act for the user, and memory across sessions.
- **Common weakness:** prompt injection. Several reports say Comet, Atlas, Dia and Copilot were exploited and that no vendor has a clean fix.
- **Brave Leo** already lets users plug in their own model, including one running locally. So "bring your own model" is no longer a differentiator.
- **Privacy browsers** (Brave, Tor, Mullvad, Firefox) win on blocking, anti-fingerprinting, HTTPS, encrypted DNS and containers. Some Firefox users reacted badly to AI features, which shows privacy-minded users distrust AI unless they control it.

Where Lore can stand apart:
1. **Reason over your own history, on the device** (MEM-04, AI-08, MEM-05).
2. **Make agents safe before making them powerful** (AI-10 first, then AGT-05 and VN-02).
3. **Make on-device AI effortless** (AI-11), so the privacy promise is true for ordinary users.
4. **Match the privacy-browser basics** (PRV-11 to PRV-14) so privacy users take Lore seriously.
5. **Keep the Vietnamese advantage** (VN-01 to VN-03) for services other browsers will not build.

## 12. Dia review (November 2026)

Source: diabrowser.com (home, apps, privacy policy effective 9 April 2026, For Work), read in November 2026. Marketing and policy text, not hands-on use; check before relying on a detail. Dia is by The Browser Company; Chromium-based; macOS and Windows; free to download, with a "Pro" tier whose price the site does not give.

What Dia offers, and what Lore does about it:

| Dia | What it is | Lore |
|---|---|---|
| Morning Brief | Calendar, inbox and key links before the day starts | Take the idea, drop the accounts: MEM-06 resumes from session, memory and bookmarks, on the device |
| Ask across Slack, Notion, Teams, G Suite | AI answers from the user's work apps | Not now. Needs connections to many services and sends that data to a server. Lore's version is MEM-04 (across pages you read). WRK-03 stays P2 |
| Profiles | Separate tabs, logins and AI for work, freelance, personal | PRV-14, widened to profiles with their own memory |
| Live Work | Tab bar shows what each work tab is (a PR, a spec) | Covered in part by group names (AI-13). Smarter tab titles are an AI-15 idea |
| Better Meetings | Opens the meeting page, agenda, notes and a countdown | Needs a calendar. Left with WRK-03 |
| Splits | Two panes side by side, layouts remembered | BRW-25, P1 |
| Decks | Slides from gathered context | Not planned. Tasks produce text; slides are a different product |
| Organized Tabs | Groups tabs with names | Done (AI-13), with a preview and undo |
| Switches: Memory, block trackers, block ads, personalize, share data | Five plain on/off controls on the home page | PRV-15, plus AI-16 for per-site control |
| Skills and a Skills gallery | User-made prompts, shared and published | Tasks already do this locally. WRK-04 shares them as files; AGT-07 (gallery) stays P3 |
| Import from all major browsers | One-step switch | BRW-14, now first of the P1 group |
| For Work: SSO, MDM, SOC 2, disable AI on chosen sites | Company controls | Out of scope today. AI-16 is the individual version. A "Lore for work" tier is a P3 note, not a plan |

Where Lore can stay different, from what Dia says about itself:
- Dia's AI requests go through its servers to partner models (the privacy policy says so; the For Work page also says data "stays on your device", and the two are worded differently). Lore's promise is narrower and testable: nothing about browsing leaves the computer, and a local model is a first-class choice.
- Dia syncs end to end encrypted when asked. Lore has no sync yet (SYN-01); do not claim parity.
- Dia is closed and US-hosted. Lore is open source and keeps Vietnamese understanding and local services (VN-01 to VN-03) as its own ground.

Done in November 2026 after the Dia review: profiles (PRV-14), split view (BRW-25), first-run welcome with import (BRW-14) and default browser (BRW-09), appearance (BRW-26).

Proposed next slice, in order: **REL-01** (smoke test of the packaged app) and the rest of **WEB-01** (sign-in on more sites) first, since a browser that cannot open or sign in is not worth new features; then PRV-15 with AI-16 (privacy switches, AI off for chosen sites), MEM-04 with AI-08, MEM-06, AI-11, BRW-25 (split view), DL-06 with AI-12, AGT-03 with MEM-05, then PRV-11 to PRV-14.
