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

    // Parse the unified diff hunks to find added/modified line ranges
    const hunkHeaderPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let match: RegExpExecArray | null;

    while ((match = hunkHeaderPattern.exec(file.patch)) !== null) {
      const startLine = parseInt(match[1], 10);
      const lineCount = match[2] ? parseInt(match[2], 10) : 1;

      // Now parse individual lines within this hunk to find actual additions
      const hunkStart = match.index + match[0].length;
      const nextHunk = file.patch.indexOf('\n@@', hunkStart);
      const hunkBody = file.patch.slice(
        hunkStart,
        nextHunk === -1 ? undefined : nextHunk,
      );
      const hunkLines = hunkBody.split('\n');

      let currentLine = startLine;
      for (const hunkLine of hunkLines) {
        if (hunkLine.startsWith('+')) {
          changedLines.push({
            file: file.filename,
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
  }

  return changedLines;
}

/**
 * Checks if a given file:line is within changed lines of the PR.
 */
function isLineChanged(
  changedLines: ChangedLine[],
  file: string,
  line: number,
): boolean {
  return changedLines.some(
    (cl) => cl.file === file && line >= cl.startLine && line <= cl.endLine,
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

  for (const warning of warnings) {
    const relativePath = normalizeFilePath(warning.file, workspace);

    if (onlyChanged && !isLineChanged(changedLines, relativePath, warning.line)) {
      continue;
    }

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
