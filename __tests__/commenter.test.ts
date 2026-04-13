import { buildReviewComments, parsePatchHunks } from '../src/commenter';
import { MavenWarning } from '../src/parser';

describe('parsePatchHunks', () => {
  it('correctly parses line numbers when hunk header has function context', () => {
    const patch = [
      '@@ -343,7 +343,7 @@ public void updateModelVendorData(final RepositoryMetadata metadata, final Strin',
      '     }',
      ' ',
      '     public String getManufacturerData(final String uri) {',
      '-        RepositoryMetadata manufacturerMetaData = MetadataManager.getInstance().readMetaData(uri);',
      '+        RepositoryMetadata manufacturerMetaData = MetadataManager.getInstance().readMetaData(uri); // HERE !!!',
      '         if (!manufacturerMetaData.getMap().isEmpty()) {',
      '             String manufacturer = manufacturerMetaData.getValue("MANUFACTURER");',
      '             if (StringUtils.isNotEmpty(manufacturer)) {',
    ].join('\n');

    const changed = parsePatchHunks('src/main/java/com/ubiqube/api/server/repository/ContentManager.java', patch);
    expect(changed).toHaveLength(1);
    expect(changed[0].startLine).toBe(346);
    expect(changed[0].file).toBe('src/main/java/com/ubiqube/api/server/repository/ContentManager.java');
  });

  it('correctly parses multiple hunks', () => {
    const patch = [
      '@@ -10,6 +10,7 @@ import java.util.List;',
      ' class Foo {',
      '     int x;',
      '+    int y;',
      '     void method() {}',
      ' }',
      '@@ -50,4 +51,5 @@ class Bar {',
      '     void bar() {',
      '+        doSomething();',
      '     }',
      ' }',
    ].join('\n');

    const changed = parsePatchHunks('Foo.java', patch);
    expect(changed).toHaveLength(2);
    expect(changed[0].startLine).toBe(12);
    expect(changed[1].startLine).toBe(52);
  });

  it('handles hunk header without function context', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' line1',
      '+added',
      ' line2',
      ' line3',
    ].join('\n');

    const changed = parsePatchHunks('test.txt', patch);
    expect(changed).toHaveLength(1);
    expect(changed[0].startLine).toBe(2);
  });
});

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

  it('matches warnings via suffix when workspace prefix differs', () => {
    // Simulates: Maven outputs /home/runner/work/repo/repo/module/src/...
    // but normalizeFilePath with wrong workspace falls back to src/...
    // while PR diff has module/src/...
    const multiModuleChangedLines = [
      { file: 'msa-api/src/main/java/com/example/ContentManager.java', startLine: 346, endLine: 346, side: 'RIGHT' as const },
    ];
    const warnings: MavenWarning[] = [
      {
        file: '/home/runner/work/msa/msa/msa-api/src/main/java/com/example/ContentManager.java',
        line: 346,
        message: 'deprecated and marked for removal',
        severity: 'warning',
      },
    ];

    // Workspace matches, so normalizeFilePath strips it correctly
    const comments = buildReviewComments(warnings, multiModuleChangedLines, '/home/runner/work/msa/msa', true);
    expect(comments).toHaveLength(1);
    expect(comments[0].path).toBe('msa-api/src/main/java/com/example/ContentManager.java');
  });

  it('matches via suffix when workspace does NOT match Maven path', () => {
    // Simulates: GITHUB_WORKSPACE doesn't match Maven output prefix at all
    // normalizeFilePath falls back to src/main/... but PR has module/src/main/...
    const multiModuleChangedLines = [
      { file: 'msa-api/src/main/java/com/example/ContentManager.java', startLine: 346, endLine: 346, side: 'RIGHT' as const },
    ];
    const warnings: MavenWarning[] = [
      {
        file: '/some/completely/different/path/msa-api/src/main/java/com/example/ContentManager.java',
        line: 346,
        message: 'deprecated and marked for removal',
        severity: 'warning',
      },
    ];

    const comments = buildReviewComments(warnings, multiModuleChangedLines, '/wrong/workspace', true);
    expect(comments).toHaveLength(1);
    // Should use the PR file path, not the normalized warning path
    expect(comments[0].path).toBe('msa-api/src/main/java/com/example/ContentManager.java');
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
