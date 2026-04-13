import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import { parseMavenLog } from './parser';
import {
  getChangedLines,
  buildReviewComments,
  postReviewComments,
} from './commenter';

async function run(): Promise<void> {
  try {
    const context = github.context;

    if (!context.payload.pull_request) {
      core.info('Not a pull request event — skipping.');
      return;
    }

    const token = core.getInput('token', { required: true });
    const logFile = core.getInput('log-file');
    const mavenOutput = core.getInput('maven-output');
    const onlyChanged = core.getInput('only-changed-lines') !== 'false';

    // Read Maven log
    let log: string;
    if (logFile) {
      if (!fs.existsSync(logFile)) {
        core.setFailed(`Log file not found: ${logFile}`);
        return;
      }
      log = fs.readFileSync(logFile, 'utf-8');
    } else if (mavenOutput) {
      log = mavenOutput;
    } else {
      core.setFailed(
        'Either "log-file" or "maven-output" input must be provided.',
      );
      return;
    }

    // Parse warnings
    const warnings = parseMavenLog(log);
    core.info(`Found ${warnings.length} warning(s) in Maven output.`);

    if (warnings.length === 0) {
      core.info('No warnings found — nothing to comment.');
      return;
    }

    const octokit = github.getOctokit(token);
    const { owner, repo } = context.repo;
    const pullNumber = context.payload.pull_request.number;
    const commitSha = context.payload.pull_request.head.sha;
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

    // Get changed lines
    const changedLines = await getChangedLines(
      octokit,
      owner,
      repo,
      pullNumber,
    );
    core.info(
      `PR #${pullNumber} has changes across ${new Set(changedLines.map((c) => c.file)).size} file(s).`,
    );

    // Build and filter comments
    const comments = buildReviewComments(
      warnings,
      changedLines,
      workspace,
      onlyChanged,
    );
    core.info(
      `Posting ${comments.length} comment(s) on changed lines (filtered from ${warnings.length} total warnings).`,
    );

    if (comments.length === 0) {
      core.info('No warnings matched changed lines — nothing to comment.');
      return;
    }

    // Post review
    await postReviewComments(
      octokit,
      owner,
      repo,
      pullNumber,
      commitSha,
      comments,
    );

    core.info('Review comments posted successfully.');
    core.setOutput('comments-posted', comments.length.toString());
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
