#!/usr/bin/env node

import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

function buildSystemPrompt(prepared) {
  const parts = [
    prepared.prompts?.digest_intro,
    prepared.prompts?.summarize_tweets,
    prepared.prompts?.summarize_blogs,
    prepared.prompts?.summarize_podcast,
    prepared.prompts?.translate
  ].filter(Boolean);

  return [
    'You are generating the final digest from the prepared Follow Builders JSON.',
    'Follow the instructions below exactly.',
    'Return only the digest text, with no preamble, explanation, or code fences.',
    '',
    ...parts
  ].join('\n\n');
}

function buildUserPrompt(prepared) {
  const language = prepared.config?.language || 'en';
  const timezone = prepared.config?.timezone || 'UTC';
  const generatedAt = prepared.generatedAt || new Date().toISOString();

  return [
    `Digest language: ${language}`,
    `Timezone: ${timezone}`,
    `Generated at: ${generatedAt}`,
    '',
    'Use only the facts, URLs, and text present in the JSON below.',
    'Do not invent quotes, sources, or links.',
    '',
    JSON.stringify(
      {
        config: prepared.config,
        stats: prepared.stats,
        podcasts: prepared.podcasts,
        x: prepared.x,
        blogs: prepared.blogs
      },
      null,
      2
    )
  ].join('\n');
}

async function main() {
  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    throw new Error('No prepared digest JSON received on stdin');
  }

  const prepared = JSON.parse(rawInput);
  const tmpDir = await mkdtemp(join(tmpdir(), 'follow-builders-'));
  const messagesPath = join(tmpDir, 'messages.json');

  const messages = [
    { role: 'system', content: buildSystemPrompt(prepared) },
    { role: 'user', content: buildUserPrompt(prepared) }
  ];

  await writeFile(messagesPath, JSON.stringify(messages, null, 2));

  try {
    const result = spawnSync(
      'bl',
      [
        'text',
        'chat',
        '--model',
        process.env.FB_MODEL || 'qwen3.7-max',
        '--messages-file',
        messagesPath,
        '--output',
        'text',
        '--non-interactive',
        '--quiet'
      ],
      {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        env: process.env
      }
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim();
      throw new Error(stderr || `bl exited with code ${result.status}`);
    }

    process.stdout.write((result.stdout || '').trim() + '\n');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`Digest remix failed: ${err.message}`);
  process.exit(1);
});
