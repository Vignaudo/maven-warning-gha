export interface MavenWarning {
    file: string;
    line: number;
    column?: number;
    message: string;
    severity: 'warning' | 'error';
}
/**
 * Parses Maven compiler output and extracts warnings/errors with file locations.
 *
 * Maven compiler warnings look like:
 *   [WARNING] /path/to/File.java:[42,15] some warning message
 *   [WARNING] /path/to/File.java:[42] some warning message
 *   [ERROR] /path/to/File.java:[42,15] some error message
 *
 * Also handles the multi-line format from maven-compiler-plugin:
 *   /path/to/File.java:[42,15] warning: some warning message
 */
export declare function parseMavenLog(log: string): MavenWarning[];
/**
 * Normalizes a file path from Maven output to a repo-relative path.
 * Maven often outputs absolute paths; we strip the workspace prefix.
 */
export declare function normalizeFilePath(filePath: string, workspace: string): string;
