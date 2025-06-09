# Wait for Check Suites

Wait for a commit's check suites to complete.

Updated from
[jitterbit/await-check-suites](https://github.com/jitterbit/await-check-suites).

![CI](https://github.com/actions/kategengler/wait-for-check-suitess/workflows/ci.yml/badge.svg)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

## Usage

See [action.yml](action.yml)

```yaml
- uses: kategengler/wait-for-check-suitess@v1
  with:
    # The commit's repository name with owner.
    # For example, kategengler/wait-for-check-suitess.
    # Default: ${{ github.repository }}
    repository: ''

    # The commit's ref (can be a SHA, branch name, or a tag name).
    # Default: ${{ github.sha }}
    ref: ''

    # GitHub token for GitHub API requests.
    # When `repository` is modified, set to a personal access token with access to `repository`.
    # Default: ${{ github.token }}
    token: ''

    # Wait for a check suite to be created if none exist.
    # This is important to protect against race conditions
    # if you know a check suite should exist on the `ref`'s commit.
    # Default: true
    waitForACheckSuite: ''

    # Number of seconds to wait between checks.
    # Default: 15
    intervalSeconds: ''

    # Number of seconds to wait before timing out.
    timeoutSeconds: ''

    # Fail step if any of the check suites complete with a conclusion other than 'success'.
    # Default: true
    failStepIfUnsuccessful: ''

    # Filter check suites for a particular app's slug (e.g., 'github-actions').
    appSlugFilter: ''

    # Only take into account the first check suite ordered by the `created_at` timestamp.
    # If `appSlugFilter` is set, only the first check suite that matches the app's slug is taken into account.
    # This is important for scheduled workflows that only want to take into account pushed workflows.
    # Default: false
    onlyFirstCheckSuite: ''
```

## Scenarios

- [Wait for other check suites on this commit to complete](#wait-for-other-check-suites-on-this-commit-to-complete)
- [Wait for all check suites on a commit in another repository to complete](#wait-for-all-check-suites-on-a-commit-in-another-repository-to-complete)
- [Wait for the first GitHub Actions check suite on this commit to complete](#wait-for-the-first-github-actions-check-suite-on-this-commit-to-complete)

### Wait for other check suites on this commit to complete

```yaml
- uses: kategengler/wait-for-check-suitess@v1
```

### Wait for all check suites on a commit in another repository to complete

```yaml
- uses: kategengler/wait-for-check-suitess@v1
  with:
    repository: kategengler/git-ops
    ref: ${{ env.git_ops_commit_sha }}
    token: ${{ secrets.GITHUB_PAT }}
```

### Wait for the first GitHub Actions check suite on this commit to complete

```yaml
- uses: kategengler/wait-for-check-suitess@v1
  with:
    appSlugFilter: github-actions
    onlyFirstCheckSuite: true
```

## Install, Build, Lint, Test, and Package

Make sure to do the following before checking in any code changes.

```bash
npm install
npm run all
```

## License

The scripts and documentation in this project are released under the
[MIT License](LICENSE)
