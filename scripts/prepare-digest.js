#!/usr/bin/env node

// ============================================================================
// Follow Builders — Prepare Digest
// ============================================================================
// Gathers everything the LLM needs to produce a digest:
// - Fetches the central feeds (tweets + podcasts)
// - Fetches the latest prompts from GitHub
// - Reads the user's config (language, delivery method)
// - Outputs a single JSON blob to stdout
//
// The LLM's ONLY job is to read this JSON, remix the content, and output
// the digest text. Everything else is handled here deterministically.
//
// Usage: node prepare-digest.js
// Output: JSON to stdout
// ============================================================================

import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');

// Hybrid feed strategy:
// - Your fork generates feeds it can (e.g. blogs) via its own GitHub Actions.
// - For sources your fork doesn't run (e.g. X without a token), fall back to
//   the upstream repo so the digest still has content.
// Set FB_FORK_REPO=yourname/follow-builders to point at your own fork.
// Per-feed fallback: try fork first, then upstream.
const UPSTREAM_REPO = 'zarazhangrui/follow-builders';
const FORK_REPO = process.env.FB_FORK_REPO || UPSTREAM_REPO;
const RAW_BASE = (repo) => `https://raw.githubusercontent.com/${repo}/main`;

const FEED_X_URL_PRIMARY = `${RAW_BASE(FORK_REPO)}/feed-x.json`;
const FEED_X_URL_FALLBACK = `${RAW_BASE(UPSTREAM_REPO)}/feed-x.json`;
const FEED_PODCASTS_URL_PRIMARY = `${RAW_BASE(FORK_REPO)}/feed-podcasts.json`;
const FEED_PODCASTS_URL_FALLBACK = `${RAW_BASE(UPSTREAM_REPO)}/feed-podcasts.json`;
const FEED_BLOGS_URL_PRIMARY = `${RAW_BASE(FORK_REPO)}/feed-blogs.json`;
const FEED_BLOGS_URL_FALLBACK = `${RAW_BASE(UPSTREAM_REPO)}/feed-blogs.json`;

const PROMPTS_BASE =
  process.env.FB_PROMPTS_BASE ||
  'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/prompts';
const PROMPT_FILES = [
  'summarize-podcast.md',
  'summarize-tweets.md',
  'summarize-blogs.md',
  'digest-intro.md',
  'translate.md'
];

// -- Fetch helpers -----------------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// Try the fork's feed first; if missing/empty, fall back to upstream.
async function fetchJSONWithFallback(primary, fallback) {
  let data = await fetchJSON(primary);
  if (data && !data.errors?.length) {
    return { data, source: 'fork' };
  }
  data = await fetchJSON(fallback);
  return { data, source: data ? 'upstream' : null };
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

// -- Main --------------------------------------------------------------------

async function main() {
  const errors = [];

  // 1. Read user config
  let config = {
    language: 'en',
    frequency: 'daily',
    delivery: { method: 'stdout' }
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
      errors.push(`Could not read config: ${err.message}`);
    }
  }

  // 2. Fetch all three feeds (each prefers your fork, falls back to upstream)
  const [feedXResult, feedPodcastsResult, feedBlogsResult] = await Promise.all([
    fetchJSONWithFallback(FEED_X_URL_PRIMARY, FEED_X_URL_FALLBACK),
    fetchJSONWithFallback(FEED_PODCASTS_URL_PRIMARY, FEED_PODCASTS_URL_FALLBACK),
    fetchJSONWithFallback(FEED_BLOGS_URL_PRIMARY, FEED_BLOGS_URL_FALLBACK)
  ]);
  const feedX = feedXResult.data;
  const feedPodcasts = feedPodcastsResult.data;
  const feedBlogs = feedBlogsResult.data;
  const feedSources = {
    x: feedXResult.source,
    podcasts: feedPodcastsResult.source,
    blogs: feedBlogsResult.source
  };

  if (!feedX) errors.push('Could not fetch tweet feed');
  if (!feedPodcasts) errors.push('Could not fetch podcast feed');
  if (!feedBlogs) errors.push('Could not fetch blog feed');
  if (feedX?.errors?.length) {
    errors.push(
      ...feedX.errors.map((error) => `Tweet feed problem: ${error}`)
    );
  }
  if (feedPodcasts?.errors?.length) {
    errors.push(
      ...feedPodcasts.errors.map((error) => `Podcast feed problem: ${error}`)
    );
  }
  if (feedBlogs?.errors?.length) {
    errors.push(
      ...feedBlogs.errors.map((error) => `Blog feed problem: ${error}`)
    );
  }

  // 3. Load prompts with priority: user custom > remote (GitHub) > local default
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that (they personalized it — don't overwrite with remote updates).
  // Otherwise, fetch the latest from GitHub so they get central improvements.
  // If GitHub is unreachable, fall back to the local copy shipped with the skill.
  const prompts = {};
  const scriptDir = decodeURIComponent(new URL('.', import.meta.url).pathname);
  const localPromptsDir = join(scriptDir, '..', 'prompts');
  const userPromptsDir = join(USER_DIR, 'prompts');

  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);
    const localPath = join(localPromptsDir, filename);

    // Priority 1: user's custom prompt (they personalized it)
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      continue;
    }

    // Priority 2: latest from GitHub (central updates)
    const remote = await fetchText(`${PROMPTS_BASE}/${filename}`);
    if (remote) {
      prompts[key] = remote;
      continue;
    }

    // Priority 3: local copy shipped with the skill
    if (existsSync(localPath)) {
      prompts[key] = await readFile(localPath, 'utf-8');
    } else {
      errors.push(`Could not load prompt: ${filename}`);
    }
  }

  // 4. Build the output — everything the LLM needs in one blob
  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),

    // User preferences
    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' }
    },

    // Content to remix
    podcasts: feedPodcasts?.podcasts || [],
    x: feedX?.x || [],
    blogs: feedBlogs?.blogs || [],

    // Stats for the LLM to reference
    stats: {
      podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
      xBuilders: feedX?.x?.length || 0,
      totalTweets: (feedX?.x || []).reduce((sum, a) => sum + a.tweets.length, 0),
      blogPosts: feedBlogs?.blogs?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || feedPodcasts?.generatedAt || feedBlogs?.generatedAt || null,
      // Provenance: which repo each feed came from ('fork' = your repo, 'upstream' = author's)
      feedSources
    },

    // Prompts — the LLM reads these and follows the instructions
    prompts,

    // Non-fatal errors
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
