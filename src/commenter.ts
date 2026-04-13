import * as core from '@actions/core';
import * as github from '@actions/github';
import { MavenWarning, normalizeFilePath } from './parser';

interface ChangedLine {
  file: string;
  startLine: number;
  endLine: number;
  side: 'RIGHT';
}

interface ReviewComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}

/**
 * Parses a unified diff patch string and extracts the changed (added) line numbers.
 */
export function parsePatchHunks(
  filename: string,
  patch: string,
): ChangedLine[] {
  const changedLines: ChangedLine[] = [];
  const hunkHeaderPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;

  while ((match = hunkHeaderPattern.exec(patch)) !== null) {
    const startLine = parseInt(match[1], 10);

    // Skip the rest of the @@ header line (optional function context label)
    const hunkStart = match.index + match[0].length;
    const headerLineEnd = patch.indexOf('\n', hunkStart);
    if (headerLineEnd === -1) continue;
    const contentStart = headerLineEnd + 1;
    const nextHunk = patch.indexOf('\n@@', contentStart);
    const hunkBody = patch.slice(
      contentStart,
      nextHunk === -1 ? undefined : nextHunk,
    );
    const hunkLines = hunkBody.split('\n');

    let currentLine = startLine;
    for (const hunkLine of hunkLines) {
      if (hunkLine.startsWith('+')) {
        changedLines.push({
          file: filename,
          startLine: currentLine,
          endLine: currentLine,
          side: 'RIGHT',
        });
        currentLine++;
      } else if (hunkLine.startsWith('-')) {
        // Removed line — doesn't advance right-side line counter
      } else if (hunkLine.startsWith('\\')) {
        // "\ No newline at end of file" — skip
      } else {
        // Context line
        currentLine++;
      }
    }
  }

  return changedLines;
}

/**
 * Fetches the list of changed line ranges from a PR diff.
 */
export async function getChangedLines(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<ChangedLine[]> {
  const changedLines: ChangedLine[] = [];

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  for (const file of files) {
    if (!file.patch) continue;
    changedLines.push(...parsePatchHunks(file.filename, file.patch));
  }

  return changedLines;
}

/**
 * Checks if two paths refer to the same file using suffix matching.
 * This handles cases where Maven outputs absolute paths that don't share
 * the same prefix as the repo-relative paths from the GitHub API.
 */
function pathsMatch(warningPath: string, prPath: string): boolean {
  if (warningPath === prPath) return true;
  // Check if one ends with the other (suffix match)
  return (
    warningPath.endsWith('/' + prPath) ||
    prPath.endsWith('/' + warningPath)
  );
}

/**
 * Finds the PR file path that matches a warning's file path.
 * Returns the PR path (needed for the GitHub API) or undefined if no match.
 */
function findMatchingPrFile(
  changedLines: ChangedLine[],
  warningPath: string,
): string | undefined {
  const prFiles = new Set(changedLines.map((cl) => cl.file));
  for (const prFile of prFiles) {
    if (pathsMatch(warningPath, prFile)) {
      return prFile;
    }
  }
  return undefined;
}

/**
 * Checks if a given file:line is within changed lines of the PR.
 */
function isLineChanged(
  changedLines: ChangedLine[],
  prFile: string,
  line: number,
): boolean {
  return changedLines.some(
    (cl) => cl.file === prFile && line >= cl.startLine && line <= cl.endLine,
  );
}

/**
 * Builds review comments from warnings, filtered to only changed lines.
 */
export function buildReviewComments(
  warnings: MavenWarning[],
  changedLines: ChangedLine[],
  workspace: string,
  onlyChanged: boolean,
): ReviewComment[] {
  const comments: ReviewComment[] = [];
  const seen = new Set<string>();
  const prFiles = [...new Set(changedLines.map((cl) => cl.file))];

  core.debug(`PR files: ${prFiles.join(', ')}`);

  for (const warning of warnings) {
    const relativePath = normalizeFilePath(warning.file, workspace);
    core.debug(`Warning: ${warning.file} -> normalized: ${relativePath}`);

    // Find the matching PR file path (suffix match)
    const prFile = findMatchingPrFile(changedLines, relativePath);

    if (!prFile) {
      core.debug(`  No matching PR file for: ${relativePath}`);
      if (onlyChanged) continue;
      // When not filtering, use the normalized path as-is
      const key = `${relativePath}:${warning.line}:${warning.message}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const icon = warning.severity === 'error' ? '🔴' : '⚠️';
      comments.push({
        path: relativePath,
        line: warning.line,
        side: 'RIGHT',
        body: `${icon} **Maven ${warning.severity}**: ${warning.message}`,
      });
      continue;
    }

    core.debug(`  Matched PR file: ${prFile}`);

    if (onlyChanged && !isLineChanged(changedLines, prFile, warning.line)) {
      core.debug(`  Line ${warning.line} not in changed lines, skipping`);
      continue;
    }

    // Use the PR file path (not normalized path) — GitHub API requires it
    const key = `${prFile}:${warning.line}:${warning.message}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const icon = warning.severity === 'error' ? '🔴' : '⚠️';
    comments.push({
      path: prFile,
      line: warning.line,
      side: 'RIGHT',
      body: `${icon} **Maven ${warning.severity}**: ${warning.message}`,
    });
  }

  return comments;
}

/**
 * Posts review comments to a PR. Uses a single review to batch all comments.
 */
export async function postReviewComments(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  comments: ReviewComment[],
): Promise<void> {
  if (comments.length === 0) {
    return;
  }

  // GitHub API limits to 50 comments per review
  const batchSize = 50;
  for (let i = 0; i < comments.length; i += batchSize) {
    const batch = comments.slice(i, i + batchSize);

    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      event: 'COMMENT',
      comments: batch,
    });
  }
}
