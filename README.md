# Maven Warning PR Commenter

A GitHub Action that parses Maven compiler warnings from build logs and posts **inline review comments** on the exact PR lines that introduced them.

## How it works

1. Your Maven build runs and logs output to a file (or captures it as a string).
2. This action parses `[WARNING]` and `[ERROR]` lines that contain file paths and line numbers.
3. It fetches the PR diff to determine which lines were actually changed.
4. Only warnings on **changed lines** get posted as inline review comments.

## Usage

```yaml
name: Maven Warnings on PR

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  build-and-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Build with Maven
        run: mvn compile 2>&1 | tee maven-output.log
        continue-on-error: true

      - name: Report Maven warnings on PR
        uses: your-org/maven-warning-gha@v1
        with:
          log-file: maven-output.log
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `token` | No | `${{ github.token }}` | GitHub token for posting review comments |
| `log-file` | No | — | Path to a Maven build log file |
| `maven-output` | No | — | Raw Maven output as a string (alternative to `log-file`) |
| `only-changed-lines` | No | `true` | Only comment on lines changed in the PR |

Either `log-file` or `maven-output` must be provided.

## Outputs

| Name | Description |
|------|-------------|
| `comments-posted` | Number of review comments posted |

## Supported warning formats

The parser recognizes these Maven/javac output patterns:

```
[WARNING] /path/to/File.java:[42,15] unchecked cast
[WARNING] /path/to/File.java:[42] deprecated method usage
[ERROR] /path/to/File.java:[10,5] cannot find symbol
/path/to/File.java:42:8: warning: [deprecation] old method
/path/to/File.java:55:12: error: cannot find symbol
```

## Development

```bash
npm install
npm test
npm run build
```

The `dist/` folder must be committed since GitHub Actions runs it directly.

## License

MIT
