import { parseMavenLog, normalizeFilePath } from '../src/parser';

describe('parseMavenLog', () => {
  it('parses standard Maven [WARNING] lines', () => {
    const log = `
[INFO] Compiling 42 source files
[WARNING] /home/user/project/src/main/java/com/example/App.java:[15,10] unchecked cast
[WARNING] /home/user/project/src/main/java/com/example/App.java:[23] deprecated method usage
[INFO] BUILD SUCCESS
    `;

    const warnings = parseMavenLog(log);
    expect(warnings).toHaveLength(2);

    expect(warnings[0]).toEqual({
      file: '/home/user/project/src/main/java/com/example/App.java',
      line: 15,
      column: 10,
      message: 'unchecked cast',
      severity: 'warning',
    });

    expect(warnings[1]).toEqual({
      file: '/home/user/project/src/main/java/com/example/App.java',
      line: 23,
      column: undefined,
      message: 'deprecated method usage',
      severity: 'warning',
    });
  });

  it('parses [ERROR] lines with file paths', () => {
    const log = `[ERROR] /home/user/project/src/main/java/Foo.java:[10,5] cannot find symbol`;
    const warnings = parseMavenLog(log);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('error');
    expect(warnings[0].line).toBe(10);
  });

  it('parses raw javac output format', () => {
    const log = `
/home/user/project/src/main/java/Bar.java:42:8: warning: [deprecation] oldMethod() in OldClass has been deprecated
/home/user/project/src/main/java/Bar.java:55:12: error: cannot find symbol
    `;
    const warnings = parseMavenLog(log);
    expect(warnings).toHaveLength(2);
    expect(warnings[0].severity).toBe('warning');
    expect(warnings[0].line).toBe(42);
    expect(warnings[1].severity).toBe('error');
    expect(warnings[1].line).toBe(55);
  });

  it('ignores non-warning Maven lines', () => {
    const log = `
[INFO] Scanning for projects...
[WARNING] Some general warning without file reference
[INFO] BUILD SUCCESS
    `;
    const warnings = parseMavenLog(log);
    expect(warnings).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(parseMavenLog('')).toEqual([]);
  });
});

describe('normalizeFilePath', () => {
  it('strips workspace prefix', () => {
    expect(
      normalizeFilePath(
        '/home/runner/work/repo/repo/src/main/java/App.java',
        '/home/runner/work/repo/repo',
      ),
    ).toBe('src/main/java/App.java');
  });

  it('handles trailing slash in workspace', () => {
    expect(
      normalizeFilePath(
        '/home/runner/work/repo/repo/src/main/java/App.java',
        '/home/runner/work/repo/repo/',
      ),
    ).toBe('src/main/java/App.java');
  });

  it('falls back to src/ matching for unknown paths', () => {
    expect(
      normalizeFilePath(
        '/some/other/path/src/main/java/App.java',
        '/workspace',
      ),
    ).toBe('src/main/java/App.java');
  });

  it('returns original path when no match is possible', () => {
    expect(normalizeFilePath('App.java', '/workspace')).toBe('App.java');
  });
});
