export interface MavenWarning {
  file: string; // absolute or relative path from Maven output
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
export function parseMavenLog(log: string): MavenWarning[] {
  const warnings: MavenWarning[] = [];
  const lines = log.split('\n');

  // Pattern 1: [WARNING] /path/to/File.java:[line,col] message
  // Pattern 2: [WARNING] /path/to/File.java:[line] message
  // Pattern 3: [ERROR] /path/to/File.java:[line,col] message
  const mavenPattern =
    /^\[(?<severity>WARNING|ERROR)\]\s+(?<file>[^\s:]+\.\w+):\[(?<line>\d+)(?:,(?<col>\d+))?\]\s+(?<message>.+)$/;

  // Pattern 4: /path/to/File.java:[line,col] warning: message (raw javac output)
  const javacPattern =
    /^(?<file>[^\s:]+\.\w+):(?<line>\d+)(?::(?<col>\d+))?:\s+(?<severity>warning|error):\s+(?<message>.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();

    let match = trimmed.match(mavenPattern);
    if (match?.groups) {
      warnings.push({
        file: match.groups.file,
        line: parseInt(match.groups.line, 10),
        column: match.groups.col ? parseInt(match.groups.col, 10) : undefined,
        message: match.groups.message,
        severity: match.groups.severity === 'ERROR' ? 'error' : 'warning',
      });
      continue;
    }

    match = trimmed.match(javacPattern);
    if (match?.groups) {
      warnings.push({
        file: match.groups.file,
        line: parseInt(match.groups.line, 10),
        column: match.groups.col ? parseInt(match.groups.col, 10) : undefined,
        message: match.groups.message,
        severity: match.groups.severity === 'error' ? 'error' : 'warning',
      });
    }
  }

  return warnings;
}

/**
 * Normalizes a file path from Maven output to a repo-relative path.
 * Maven often outputs absolute paths; we strip the workspace prefix.
 */
export function normalizeFilePath(filePath: string, workspace: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const workspaceNorm = workspace.replace(/\\/g, '/').replace(/\/$/, '');

  if (normalized.startsWith(workspaceNorm + '/')) {
    return normalized.slice(workspaceNorm.length + 1);
  }

  // Handle /src/main/java/... paths by trying to match from src/
  const srcIndex = normalized.indexOf('/src/');
  if (srcIndex >= 0) {
    return normalized.slice(srcIndex + 1);
  }

  return normalized;
}
