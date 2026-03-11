#!/usr/bin/env node
// Set package.json version from GITHUB_REF (e.g. refs/tags/v1.4.5) in CI.
const { execSync } = require('child_process');
const ref = process.env.GITHUB_REF || '';
const version = ref.replace(/^refs\/tags\/v/, '');
if (!version) {
  console.error('GITHUB_REF missing or not a v* tag');
  process.exit(1);
}
execSync(`npm version ${version} --no-git-tag-version --allow-same-version`, { stdio: 'inherit' });
