# GitHub Actions trigger audit — opt-in only (THE-400)

Repository: `nerdynigel/rgb-lightning-node-nodejs` (fork of
`UTEXO-Protocol/rgb-lightning-node-nodejs`).
Base: `main` @ `d7cadef35406bffa6bec83a50ceda2f0bb9eaebd`.
Scope: trigger hygiene only. No product/test semantics, dependency pins, secrets,
Actions spending settings or shared services were changed.

Board direction (2026-09-30, THE-396): GitHub-hosted runners are **opt-in only**.
A runner job must never start from an ordinary push or PR update; a run is requested
by manually dispatching the workflow or by adding the `ci:run` label to a PR.

## 1. Trigger table (before → after)

| Workflow | Trigger before | Trigger after | Run path |
|---|---|---|---|
| `.github/workflows/ci.yml` | `pull_request` (any activity type), `push` (`main`, `iris-wallet`) | `workflow_dispatch`, `pull_request: [labeled]`; `contract` job gated on `if: github.event_name == 'workflow_dispatch' \|\| github.event.label.name == 'ci:run'` | Manual dispatch, or `ci:run` label on a PR |
| `.github/workflows/release.yml` | `repository_dispatch: [rln-release]`, `workflow_dispatch` (input `rln_version`) | `workflow_dispatch` only (manual); input `rln_version` required — **updated by THE-405** | Manual dispatch only |

### `repository_dispatch` review

`release.yml` runs the napi build matrix and the publish/release job. Its only
automatic-looking trigger is `repository_dispatch: [rln-release]`. This is **not** an
ordinary push or PR event: it fires only when an external actor makes an explicit,
token-authenticated `POST /repos/.../dispatches` call with `event_type: rln-release`.
It is an explicit opt-in path and is treated as compliant by the accepted THE-396
policy (same classification as the `repository_dispatch` bump workflows). It is
therefore left unchanged. The workflow's other entry point, `workflow_dispatch`, is
manual. No ordinary push/PR activity can start either workflow after this change.

> **Superseded by THE-405** (`docs/THE-405-RELEASE-MANUAL-TRIGGER.md`). The Board
> residual from THE-402 required the inbound `repository_dispatch: [rln-release]`
> trigger to be removed as well, so `release.yml` is now manual-only
> (`workflow_dispatch` with required `rln_version`). The paragraph above records the
> THE-400 position and is no longer the current state.

## 2. Host-side validation

Performed on the Paperclip host with Python 3 + PyYAML (no GitHub runner dispatched,
no `ci:run` label applied, no merge):

- `yaml.safe_load` parses both workflow files without error.
- Event simulation over the parsed trigger map:
  - `push` → no workflow starts.
  - `pull_request` with activity `opened` / `synchronize` / `reopened` → no workflow
    starts (only `labeled` is subscribed).
  - `pull_request` with activity `labeled` and label `ci:run` → `contract` job runs.
  - `pull_request` with activity `labeled` and any other label → `contract` job gate
    evaluates false → no job runs.
  - `workflow_dispatch` → `contract` job runs.
- `ci.yml` `contract` job carries the exact `ci:run` job gate; no `push` or
  `pull_request` (untyped) trigger remains.
- `gh api .../actions/runs` `total_count=0`: no run was created by the branch push or
  PR open.

## 3. Rollback

Restore the pre-change CI trigger from the base commit, or revert this branch's commit:

```
git checkout d7cadef35406bffa6bec83a50ceda2f0bb9eaebd -- .github/workflows/ci.yml
# or
git revert <infra/the-400-ci-optin commit>
```

`release.yml` was not modified, so no rollback is required for it.

## 4. Limitations

- Task-branch publication only. Default-branch runner policy is unchanged until the
  Board merges; branch publication is delivery, not adopted policy or SAFE TO ACCEPT.
- Independent policy acceptance is owned by THE-402; not claimed here.
- This repository has no `AGENTS.md`; no repository-specific CI doc policy applied.
