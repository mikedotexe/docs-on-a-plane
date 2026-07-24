const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GENERATED_NEARCORE_SOURCE_JSON = path.resolve(ROOT, 'shared', 'generatedNearcoreSource.json');
const NEARCORE_REPO_URL = 'https://github.com/near/nearcore';
const PLAIN_SEMVER_TAG_PATTERN = /^\d+\.\d+\.\d+$/;
const V_SEMVER_TAG_PATTERN = /^v\d+\.\d+\.\d+$/;

function toPosixRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function tryExecGit(gitCwd, args) {
  try {
    const output = execFileSync('git', ['-C', gitCwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || null;
  } catch (_error) {
    return null;
  }
}

function tryExecGitLines(gitCwd, args) {
  const output = tryExecGit(gitCwd, args);
  return output ? output.split('\n').map((line) => line.trim()).filter(Boolean) : [];
}

function pickPreferredNearcoreTag(tags) {
  const normalizedTags = Array.from(new Set((tags || []).filter(Boolean)));
  const plainSemverTag = normalizedTags.find((tag) => PLAIN_SEMVER_TAG_PATTERN.test(tag));
  if (plainSemverTag) {
    return plainSemverTag;
  }

  const vSemverTag = normalizedTags.find((tag) => V_SEMVER_TAG_PATTERN.test(tag));
  if (vSemverTag) {
    return vSemverTag;
  }

  return normalizedTags[0] || null;
}

function resolveNearcoreRepoRoot(specPath) {
  const gitCwd = fs.statSync(specPath).isDirectory() ? specPath : path.dirname(specPath);
  const repoRoot = tryExecGit(gitCwd, ['rev-parse', '--show-toplevel']);
  return repoRoot ? path.resolve(repoRoot) : null;
}

function resolveNearcoreSourceMetadata(specPath) {
  const absoluteSpecPath = path.resolve(specPath);
  const repoRoot = resolveNearcoreRepoRoot(absoluteSpecPath);
  const exactTags = repoRoot ? tryExecGitLines(repoRoot, ['tag', '--points-at', 'HEAD']) : [];
  const exactTag = pickPreferredNearcoreTag(exactTags);
  const nearestTag =
    repoRoot
      ? pickPreferredNearcoreTag([
          tryExecGit(repoRoot, ['describe', '--tags', '--match', '[0-9]*.[0-9]*.[0-9]*', '--abbrev=0', 'HEAD']),
          tryExecGit(repoRoot, ['describe', '--tags', '--match', 'v[0-9]*.[0-9]*.[0-9]*', '--abbrev=0', 'HEAD']),
          tryExecGit(repoRoot, ['describe', '--tags', '--abbrev=0', 'HEAD']),
        ])
      : null;
  const tag = exactTag || nearestTag || null;
  const tagSource = exactTag ? 'exact' : nearestTag ? 'nearest' : null;

  return {
    branch: repoRoot ? tryExecGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) : null,
    commitSha: repoRoot ? tryExecGit(repoRoot, ['rev-parse', 'HEAD']) : null,
    dirty: repoRoot ? Boolean(tryExecGit(repoRoot, ['status', '--porcelain'])) : false,
    generatedAt: new Date().toISOString(),
    releaseUrl: tag ? `${NEARCORE_REPO_URL}/releases/tag/${encodeURIComponent(tag)}` : null,
    repoRoot: repoRoot ? toPosixRelative(repoRoot) : null,
    repoUrl: NEARCORE_REPO_URL,
    specPath: toPosixRelative(absoluteSpecPath),
    tag,
    tagSource,
  };
}

function readGeneratedNearcoreSourceJson() {
  if (!fs.existsSync(GENERATED_NEARCORE_SOURCE_JSON)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(GENERATED_NEARCORE_SOURCE_JSON, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function writeGeneratedNearcoreSourceJson(specPath) {
  const metadata = resolveNearcoreSourceMetadata(specPath);
  fs.mkdirSync(path.dirname(GENERATED_NEARCORE_SOURCE_JSON), { recursive: true });
  fs.writeFileSync(
    GENERATED_NEARCORE_SOURCE_JSON,
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );
  return metadata;
}

module.exports = {
  GENERATED_NEARCORE_SOURCE_JSON,
  readGeneratedNearcoreSourceJson,
  resolveNearcoreSourceMetadata,
  writeGeneratedNearcoreSourceJson,
};
