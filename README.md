# CineVault — Official Download Website

The official landing page for **CineVault by SNSR**, the Android app for movies, series,
anime and live TV.

**Live site:** https://itzsnsr.github.io/CineVaultDownload/

Plain HTML, CSS and JavaScript. No framework, no build step, no API keys.

## Android download

Every Android button links to the app repository's stable latest release:

```
https://github.com/itzSNSR/CineVault/releases/latest/download/CineVault.apk
```

Because GitHub resolves `latest` to the newest stable (non-prerelease) release, the
website needs no change when a new version ships — only `version.json` in the app
repository has to be updated, and the version badge follows it.

- **Android Mobile** — available
- **Android TV** — coming soon (no download link)
- **Web Streaming** — coming soon (no player)

## Files

```
├── .nojekyll                 # serve files as-is (no Jekyll processing)
├── index.html                # page, SEO and Open Graph metadata
├── styles.css                # Midnight Amethyst theme and breakpoints
├── script.js                 # version badge, mobile nav, FAQ accordion
└── assets/
    ├── cv-mark.svg           # CV monogram
    ├── favicon.svg           # tile favicon
    ├── apple-touch-icon.png  # 180 × 180 iOS icon
    ├── cinevault-icon.png    # app icon used in the install panel
    └── og-image.png          # 1200 × 630 social preview
```

Every asset path is relative, so the page works under `/CineVaultDownload/` as well as
from any other subdirectory or a local static server.

## Local preview

```bash
python -m http.server 8000
```

Open <http://localhost:8000/>. The version badge reads `version.json` from the app
repository over HTTPS; without network access it falls back to the static `v4.6` text.

## Motion

The page carries a small, dependency-free motion system applied from the
[LottieFiles motion-design-skill](https://github.com/lottiefiles/motion-design-skill):
a staggered hero entrance (40–320 ms), scroll reveals with 50–70 ms stagger, gentle
ambient drift on the glows and floating cards, and press/hover feedback. Personality is
Premium — signature easing `cubic-bezier(.4,0,.2,1)`, durations 140/380/620 ms.

Only `translate`, `scale` and `opacity` animate, so nothing shifts layout. Reveal classes
are added by JavaScript alone and all motion sits behind
`@media (prefers-reduced-motion: no-preference)`, so reduced-motion and no-JS visitors get
the static page.

## GitHub Pages

Repository **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/ (root)`

Publishing is served at https://itzsnsr.github.io/CineVaultDownload/. No custom domain
and no Actions workflow are required.

## Theme

The page matches the app's Midnight Amethyst palette (`app/src/main/java/com/example/ui/theme/Color.kt`):
`#090A10` background, `#181422` cards, `#8B5CF6` primary purple, `#C4B5FD` glass
highlight, `#F5F5F7` primary text and `#B8ABC9` secondary text.

CineVault is an independent, open-source client and is not affiliated with any streaming
service. Availability depends on third-party providers and your region.
