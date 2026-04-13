import * as github from '@actions/github';
import { MavenWarning } from './parser';
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
export declare function parsePatchHunks(filename: string, patch: string): ChangedLine[];
/**
 * Fetches the list of changed line ranges from a PR diff.
 */
export declare function getChangedLines(octokit: ReturnType<typeof github.getOctokit>, owner: string, repo: string, pullNumber: number): Promise<ChangedLine[]>;
/**
 * Builds review comments from warnings, filtered to only changed lines.
 */
export declare function buildReviewComments(warnings: MavenWarning[], changedLines: ChangedLine[], workspace: string, onlyChanged: boolean): ReviewComment[];
/**
 * Posts review comments to a PR. Uses a single review to batch all comments.
 */
export declare function postReviewComments(octokit: ReturnType<typeof github.getOctokit>, owner: string, repo: string, pullNumber: number, commitSha: string, comments: ReviewComment[]): Promise<void>;
export {};
