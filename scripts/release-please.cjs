const { execFileSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');

const CHANNELS = {
  master: { config: 'release-please-config.json', manifest: '.release-please-manifest.json' },
  develop: { config: 'release-please-config.beta.json', manifest: '.release-please-manifest.beta.json' },
};

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function readJson(cwd, file) {
  return JSON.parse(git(cwd, 'show', `HEAD:${file}`));
}

// release-please stops reading history at the release commit in date order, which drops commits
// written before a release but merged after it. Read the exact tag..HEAD range from git instead.
function commitsSinceRelease(cwd, { config, manifest }) {
  const tag = `v${readJson(cwd, manifest)['.']}`;
  const since = git(cwd, 'tag', '--list', tag)
    ? git(cwd, 'rev-list', '-n1', tag)
    : readJson(cwd, config)['bootstrap-sha'];
  if (!since) throw new Error(`No tag ${tag} and no bootstrap-sha in ${config}`);
  git(cwd, 'merge-base', '--is-ancestor', since, 'HEAD');

  const log = git(cwd, 'log', '--no-merges', '--topo-order', '-z', '--format=%H%n%B', `${since}..HEAD`);
  const commits = log.split('\0').filter(Boolean).map(entry => {
    const split = entry.indexOf('\n');
    return { sha: entry.slice(0, split), message: entry.slice(split + 1).trim(), files: [] };
  });
  return { since, commits };
}

function useGitRange(github, { cwd, config, manifest }) {
  github.mergeCommitIterator = async function* () {
    const { since, commits } = commitsSinceRelease(cwd, { config, manifest });
    yield* commits;
    yield { sha: since, message: '', files: [] };
  };
  return github;
}

function compareVersions(a, b) {
  return a.localeCompare(b, 'en', { numeric: true });
}

// Stock Release-As sets the same exact version on both branches, so a beta would ship as stable or
// a stable as a beta. Take the base version and let the branch decide the suffix.
function resolveReleaseAs({ cwd, branch, parse }) {
  const { commits } = commitsSinceRelease(cwd, CHANNELS[branch]);
  const footer = parse(commits)
    .flatMap(({ sha, notes }) => notes.map(note => ({ sha, ...note })))
    .find(note => note.title === 'RELEASE AS');
  if (!footer) return undefined;

  const beta = readJson(cwd, CHANNELS.develop.manifest)['.'];
  const [betaBase, betaSuffix] = beta.split('-');

  // Once a beta has shipped the footer, stable follows the betas, which may have moved higher.
  if (branch === 'master' && betaSuffix) {
    const afterBeta = git(cwd, 'rev-list', `v${beta}..HEAD`).split('\n');
    if (!afterBeta.includes(footer.sha)) return betaBase;
  }

  const source = `Release-As: ${footer.text} in ${footer.sha.slice(0, 7)}`;
  const base = /^v?(\d+\.\d+\.\d+)(?:-beta(?:\.\d+)?)?$/.exec(footer.text.trim())?.[1];
  if (!base) throw new Error(`${source} is not a version like 1.5.0`);

  const stable = readJson(cwd, CHANNELS.master.manifest)['.'];
  if (compareVersions(base, stable) <= 0) {
    throw new Error(`${source} must be higher than the stable version ${stable}`);
  }
  if (betaSuffix && compareVersions(base, betaBase) < 0) {
    throw new Error(`${source} is lower than the current beta ${beta}`);
  }

  if (branch === 'master') return base;
  const number = betaSuffix && base === betaBase ? Number(betaSuffix.split('.')[1]) + 1 : 1;
  return `${base}-beta.${number}`;
}

function loadManifest(Manifest, github, branch, releaseAs) {
  const { config, manifest } = CHANNELS[branch];
  return Manifest.fromManifest(github, branch, config, manifest, {}, undefined, releaseAs);
}

async function run() {
  const { RELEASE_PLEASE_DIR, GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_OUTPUT, GITHUB_SHA, RELEASE_TOKEN } = process.env;
  if (!RELEASE_TOKEN) throw new Error('RELEASE_TOKEN is not set');
  if (!CHANNELS[GITHUB_REF_NAME]) throw new Error(`No release channel for ${GITHUB_REF_NAME}`);

  const load = createRequire(join(RELEASE_PLEASE_DIR, 'package.json'));
  const { GitHub, Manifest } = load('release-please');
  const { parseConventionalCommits } = load('release-please/build/src/commit.js');
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  const github = await GitHub.create({ owner, repo, token: RELEASE_TOKEN, defaultBranch: GITHUB_REF_NAME });
  const cwd = process.cwd();

  const releases = (await (await loadManifest(Manifest, github, GITHUB_REF_NAME)).createReleases()).filter(Boolean);
  if (releases.length) {
    appendFileSync(GITHUB_OUTPUT, `tag=${releases[0].tagName}\n`);
    git(cwd, 'fetch', '--tags', 'origin');
  }

  // A newer push has its own run, and only that run has tested the branch tip.
  git(cwd, 'fetch', 'origin', GITHUB_REF_NAME);
  if (git(cwd, 'rev-parse', 'FETCH_HEAD') !== GITHUB_SHA) return;

  if (GITHUB_REF_NAME === 'develop') {
    const unmerged = git(cwd, 'tag', '--list', 'v*', '--no-merged', 'HEAD').split('\n').filter(tag => tag && !tag.includes('-'));
    if (unmerged.length) {
      console.log(`::warning::Merge master into develop before the next beta (missing ${unmerged.join(', ')})`);
      return;
    }
  }

  useGitRange(github, { cwd, ...CHANNELS[GITHUB_REF_NAME] });
  const releaseAs = resolveReleaseAs({ cwd, branch: GITHUB_REF_NAME, parse: parseConventionalCommits });
  await (await loadManifest(Manifest, github, GITHUB_REF_NAME, releaseAs)).createPullRequests();
}

module.exports = { CHANNELS, useGitRange, loadManifest, resolveReleaseAs };

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
