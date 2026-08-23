# OmniSaver

A multiplatform video/reel/audio downloader. Paste a link, it auto-detects the
platform (YouTube, Instagram, Facebook, TikTok, X/Twitter), and offers MP4
(by quality) or MP3 (audio-only) downloads. Includes ad slot placeholders for
monetization.

## How it works

- **Frontend** (`public/`) — plain HTML/CSS/JS. Detects the platform
  client-side (for instant UI feedback) and calls the backend to do the
  actual work.
- **Backend** (`server/index.js`) — a small Express server that shells out to
  [`yt-dlp`](https://github.com/yt-dlp/yt-dlp), the open-source,
  actively-maintained extractor that most link-based downloader sites are
  built on under the hood. It:
  - `POST /api/resolve` — runs `yt-dlp -j <url>` to get title/thumbnail/duration
    and the list of available formats.
  - `GET /api/download` — streams `yt-dlp`'s output straight to the browser
    (`-f <format_id>` for video, `-x --audio-format mp3` for audio), so no
    file is ever written to disk on the server.

This **cannot run as a static site** — it needs a real process to run
`yt-dlp`/`ffmpeg`. Static hosts (GitHub Pages, Netlify static, etc.) won't
work; you need something that runs a Node process (Render, Railway, Fly.io,
a VPS, or the included Dockerfile).

## Local setup

```bash
# System dependencies
# macOS: brew install yt-dlp ffmpeg
# Ubuntu/Debian: sudo apt install ffmpeg && sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp

npm install
npm start
# open http://localhost:3000
```

## Docker

```bash
docker build -t omnisaver .
docker run -p 3000:3000 omnisaver
```

## Monetization / ad slots

Ad containers are already placed in `public/index.html` (look for
`class="ad-slot"`): a top leaderboard, an in-content rectangle after results,
a sticky sidebar (desktop), a footer banner, and an interstitial slot shown
for a few seconds before each download starts (`runInterstitial` in
`app.js`) — this "wait, then download" pattern is the standard revenue model
for this category of site, since the interstitial gets its own ad impression.

**Google AdSense will very likely reject or suspend a site in this niche** —
its program policies explicitly prohibit sites that facilitate unauthorized
downloading of copyrighted third-party content (this is the same reason
`ads.txt`/AdSense on the sibling `mygoldrates.com` project should **not**
be reused here — keep the two properties on separate ad accounts and,
ideally, separate domains, so an AdSense policy action on one can't affect
the other). Networks that commonly do accept downloader/converter sites:

- PropellerAds
- Adsterra
- ExoClick
- Media.net (contextual, more selective)

To wire one in, drop that network's script tag in `<head>` of
`public/index.html` and replace the placeholder `<div class="ad-slot">`
contents with that network's ad unit code/iframe.

## Legal note

This tool only fetches what the target platform's page already serves
publicly (the same thing a browser does when it plays the video) — it does
not bypass logins, paywalls, or DRM. That said, downloading and
redistributing content you don't own or have rights to can still violate
each platform's Terms of Service and copyright law in your jurisdiction.
The footer disclaimer in the UI reflects this; keep it, and don't represent
this as a bulk/commercial scraping tool.

## Known limitations

- **WhatsApp is not supported and can't be** — there's no public URL for
  media shared over WhatsApp the way there is for a YouTube/Instagram post,
  so a paste-a-link tool has nothing to fetch.
- Instagram/Facebook/TikTok regularly change their page structure; keep
  `yt-dlp` updated (`yt-dlp -U`, or rebuild the Docker image) when
  extraction starts failing for a platform.
- No rate limiting, auth, or abuse protection yet — add these before
  exposing this publicly at scale (e.g. `express-rate-limit`, a queue for
  concurrent `yt-dlp` processes, and a request timeout).
