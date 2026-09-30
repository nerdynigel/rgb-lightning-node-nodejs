# Release workflow: manual-only trigger (THE-405)

Repository: `nerdynigel/rgb-lightning-node-nodejs`.
Branch: `infra/the-400-ci-optin` (continues THE-400 / PR #1).
Base: `main` @ `d7cadef35406bffa6bec83a50ceda2f0bb9eaebd`.
Branch head before this change: `f4927bd21ce845b9aac2ec59b7e3cbcee32a9593`.
Scope: `.github/workflows/release.yml` trigger + dead-branch cleanup, plus this
doc. No product/test semantics, dependency pins, secrets, Actions spending
settings, runners, npm/GitHub releases or shared services were touched.

## 1. Change

`release.yml` previously declared two inbound triggers:

```yaml
on:
  repository_dispatch:
    types: [rln-release]
  workflow_dispatch:
    inputs:
      rln_version: { required: true, type: string }
```

The `repository_dispatch` trigger is removed. The workflow is now **manual-only**,
started exclusively by `workflow_dispatch` with the required `rln_version` string
input. The three `Resolve RLN version` steps lost their unreachable
`github.event_name == "repository_dispatch"` branch and now resolve the version
directly from `inputs.rln_version`:

```yaml
run: echo "rln=${{ inputs.rln_version }}" >> "$GITHUB_OUTPUT"
```

For the only remaining trigger (`workflow_dispatch`) this resolves the identical
value as before, so build/publish behaviour is unchanged.

### Preserved (not modified)

- All jobs and steps: `build-native` (darwin-arm64, darwin-x64, linux-x64-gnu,
  linux-arm64-gnu), `build-musl` (linux-x64-musl), `release`.
- Build/publish safety: `permissions: contents: write` on `release`, npm publish
  with `NPM_TOKEN`, `gh release create/upload`, prerelease version bump, the
  `check:types` and smoke-test (`npm test`) steps.
- Outbound product wiring: the final `peter-evans/repository-dispatch@v3` step
  that notifies `UTEXO-Protocol/wdk-rgb-lightning` after a successful publish.

## 2. Manual release invocation

The release is now started only by an authenticated actor. From a checkout with a
token that can dispatch workflows:

```
gh workflow run release.yml \
  --repo nerdynigel/rgb-lightning-node-nodejs \
  --ref infra/the-400-ci-optin \
  -f rln_version=v0.11.0-beta.3
```

Equivalent UI path: Actions → "Build and Release (Node)" → Run workflow → enter
`rln_version` → Run. `rln_version` is the `UTEXO-Protocol/rgb-lightning-node` tag
whose C-FFI surface the build targets; it is required and has no default.

Watch / confirm:

```
gh run list --repo nerdynigel/rgb-lightning-node-nodejs \
  --workflow release.yml --limit 5
```

Note: GitHub-hosted runners are opt-in (Board, 2026-09-30). This workflow uses
paid runners (macOS + WarpBuild), so it must only be dispatched deliberately, not
on every push; it is never started by push, pull request, or inbound
`repository_dispatch`.

## 3. Validation

Performed on the Paperclip host with Python 3.11 + PyYAML 6.0.2. **No GitHub
runner was dispatched, no `ci:run` label was applied, no `repository_dispatch`
was sent, nothing was merged, and no paid minutes were spent.** Proof is static
parse + event/job simulation.

### 3.1 YAML parse

```
$ python3 -c "import yaml; [print(f, 'parsed ok; jobs=', list(yaml.safe_load(open(f))['jobs'])) for f in ['.github/workflows/release.yml','.github/workflows/ci.yml']]"
.github/workflows/release.yml parsed ok; jobs= ['build-native', 'build-musl', 'release']
.github/workflows/ci.yml parsed ok; jobs= ['contract']
```

### 3.2 Event / job simulation

A validator parses both workflow files, maps every `on:` trigger and job `if:`
gate, and simulates the events below. Result:

```
== trigger maps ==
  release.yml triggers: ['workflow_dispatch']
  ci.yml triggers:      ['pull_request', 'workflow_dispatch']

== release.yml trigger assertions ==
  [ok] release.yml has no repository_dispatch trigger
  [ok] release.yml has no push trigger
  [ok] release.yml has no pull_request trigger
  [ok] release.yml retains workflow_dispatch
  [ok] workflow_dispatch.rln_version input present
  [ok] rln_version input is required: true

== release.yml event simulation (jobs that would start) ==
  push to main                       -> jobs: []
  PR opened                          -> jobs: []
  PR synchronize                     -> jobs: []
  PR reopened                        -> jobs: []
  PR labeled ci:run                  -> jobs: []
  PR labeled bug                     -> jobs: []
  repository_dispatch rln-release    -> jobs: []
  workflow_dispatch                  -> jobs: ['build-native', 'build-musl', 'release']

== ci.yml contract path preserved (control) ==
  PR opened                          -> jobs: []
  PR labeled ci:run                  -> jobs: ['contract']
  PR labeled bug                     -> jobs: []
  workflow_dispatch                  -> jobs: ['contract']
  push to main                       -> jobs: []

PASS: all trigger/job assertions hold
```

Interpretation:

- `release.yml` starts **no** job for push, any ordinary PR activity, a
  non-`ci:run` label, or an inbound `repository_dispatch rln-release` event.
- `release.yml` starts all three jobs only for `workflow_dispatch` (manual).
- The `ci:run` contract path in `ci.yml` is unchanged and still gated on
  `github.event_name == 'workflow_dispatch' || github.event.label.name == 'ci:run'`.

The validator is reproduced inline in the commit's validation run; it is not
committed to keep this change to a scoped diff (workflow + doc).

## 4. Rollback

Revert the release trigger only (fast, targeted):

```
git checkout f4927bd21ce845b9aac2ec59b7e3cbcee32a9593 -- .github/workflows/release.yml
```

or revert the commit entirely once merged:

```
git revert <THE-405 commit>
```

`release.yml` triggers become `repository_dispatch: [rln-release]` +
`workflow_dispatch` again. No repo/service state needs reversing: no release was
published and no dispatch was sent during this task.

## 5. Limitations

- Task-branch publication only. Default-branch runner policy is unchanged until
  the Board merges PR #1; branch delivery is not adopted policy.
- Validation is static (YAML parse + trigger/job simulation). No workflow run was
  executed by design (no paid minutes); runtime behaviour of the build matrix is
  not claimed here.
- `docs/THE-400-CI-TRIGGER-AUDIT.md` previously classified the
  `repository_dispatch` inbound trigger as compliant and left `release.yml`
  unchanged; §"`repository_dispatch` review" of that doc is superseded by this
  task and has been annotated accordingly.
- Outbound dispatch to `UTEXO-Protocol/wdk-rgb-lightning` is intentionally
  retained as product/publish wiring; it is not an inbound trigger for this
  repository's workflows.
- This repository has no `AGENTS.md`; no repo-specific CI doc policy applied.
