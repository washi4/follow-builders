# Copilot instructions for Follow Builders

This repository is an AI Builders Digest skill. The core flow is:
`scripts/generate-feed.js` builds the central feed JSON files, `scripts/prepare-digest.js` assembles the digest payload from user config + prompts, and `scripts/deliver.js` sends the final digest to stdout, Telegram, or email.

## Commands

- `cd scripts && npm install`
- `cd scripts && node generate-feed.js`
- `cd scripts && node generate-feed.js --tweets-only`
- `cd scripts && node generate-feed.js --podcasts-only`
- `cd scripts && node generate-feed.js --blogs-only`
- `cd scripts && node prepare-digest.js`
- `cd scripts && node remix-digest.js`
- `cd scripts && node build-pages.js`
- `cd scripts && node deliver.js --file /tmp/fb-digest.txt`

## Architecture

- `config/default-sources.json` is the source of truth for tracked podcasts, X accounts, and blogs.
- `scripts/generate-feed.js` fetches content, deduplicates it with `state-feed.json`, and writes `feed-x.json`, `feed-podcasts.json`, and `feed-blogs.json`.
- `.github/workflows/generate-feed.yml` runs the feed job on Node 20 once daily at 06:17 UTC and also supports manual `all` / `tweets-only` / `podcasts-only` / `blogs-only` runs.
- `scripts/prepare-digest.js` reads `~/.follow-builders/config.json`, loads prompts with precedence `user override > GitHub > local`, and outputs one JSON blob for the LLM to remix.
- `scripts/remix-digest.js` turns the prepared JSON into a final digest using Bailian CLI (`bl text chat`).
- `scripts/build-pages.js` turns the same digest into a static GitHub Pages archive under `docs/`.
- `scripts/deliver.js` reads `~/.follow-builders/.env` and routes delivery by `config.delivery.method`.
- `.github/workflows/digest-delivery.yml` prepares config, remixes the digest with Bailian, sends it to Telegram, and publishes the archive to GitHub Pages on a daily schedule.
- Prompt behavior lives in `prompts/*.md`; user-specific overrides belong in `~/.follow-builders/prompts/`.

## Conventions

- Keep feed generation deterministic; do not fetch content in `prepare-digest.js`.
- Preserve the existing dedup and lookback behavior in `state-feed.json` and `generate-feed.js`.
- When adding a new source, update `config/default-sources.json` and the matching parser/extractor in `scripts/generate-feed.js`.
- Keep prompt files as plain-English instructions, not code.
- Preserve ESM (`type: module`) and the existing JSON formatting style.
