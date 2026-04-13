import { buildReviewComments } from '../src/commenter';
import { MavenWarning } from '../src/parser';

describe('buildReviewComments', () => {
  const changedLines = [
    { file: 'src/main/java/com/example/App.java', startLine: 15, endLine: 15, side: 'RIGHT' as const },
    { file: 'src/main/java/com/example/App.java', startLine: 20, endLine: 25, side: 'RIGHT' as const },
    { file: 'src/main/java/com/example/Util.java', startLine: 10, endLine: 10, side: 'RIGHT' as const },
  ];

  it('includes warnings on changed lines', () => {
    const warnings: MavenWarning[] = [
      {
        file: '/workspace/src/main/java/com/example/App.java',
        line: 15,
        message: 'unchecked cast',
        severity: 'warning',
      },
    ];

    const comments = buildReviewComments(warnings, changedLines, '/workspace', true);
    expect(comments).toHaveLength(1);
    expect(comments[0].path).toBe('src/main/java/com/example/App.java');
    expect(comments[0].line).toBe(15);
    expect(comments[0].body).toContain('unchecked cast');
  });

  it('filters out warnings on unchanged lines when onlyChanged is true', () => {
    const warnings: MavenWarning[] = [
      {
        file: '/workspace/src/main/java/com/example/App.java',
        line: 99,
        message: 'some warning on untouched line',
        severity: 'warning',
      },
    ];

    const comments = buildReviewComments(warnings, changedLines, '/workspace', true);
    expect(comments).toHaveLength(0);
  });

  it('includes all warnings when onlyChanged is false', () => {
    const warnings: MavenWarning[] = [
      {
        file: '/workspace/src/main/java/com/example/App.java',
        line: 99,
        message: 'some warning on untouched line',
        severity: 'warning',
      },
    ];

    const comments = buildReviewComments(warnings, changedLines, '/workspace', false);
    expect(comments).toHaveLength(1);
  });

  it('deduplicates identical warnings', () => {
    const warnings: MavenWarning[] = [
      {
        file: '/workspace/src/main/java/com/example/App.java',
        line: 15,
        message: 'unchecked cast',
        severity: 'warning',
      },
      {
        file: '/workspace/src/main/java/com/example/App.java',
        line: 15,
        message: 'unchecked cast',
        severity: 'warning',
      },
    ];

    const comments = buildReviewComments(warnings, changedLines, '/workspace', true);
    expect(comments).toHaveLength(1);
  });

  it('uses error icon for errors', () => {
    const warnings: MavenWarning[] = [
      {
        file: '/workspace/src/main/java/com/example/App.java',
        line: 15,
        message: 'cannot find symbol',
        severity: 'error',
      },
    ];

    const comments = buildReviewComments(warnings, changedLines, '/workspace', true);
    expect(comments[0].body).toContain('🔴');
    expect(comments[0].body).toContain('Maven error');
  });
});
