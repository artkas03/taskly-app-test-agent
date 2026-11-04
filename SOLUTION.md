# Unit test agent and agentic PR workflow

For every pull request, a GitHub Actions workflow runs a custom Claude Code agent (`unit-test-engineer`) with five skills. The agent decides which changed files need tests and writes or updates them. A separate job then runs the tests again, and the results go back to the PR as a commit with the tests, a comment that is updated on each run, and the job summary.

## 1. Main technical decisions

| Decision | Why |
|---|---|
| Claude Code CLI in headless mode (`claude -p --agent … --settings …`) | The agent, its skills and its permissions are plain files in `.claude/`, versioned and reviewed like code. `scripts/test-agent/run-agent.sh` starts the agent the same way locally and in CI. |
| The LLM only makes judgement calls | Diffing, path filtering, policy checks, test runs, coverage and the PR comment are Node scripts in `scripts/test-agent/` with no dependencies. The agent decides whether and what to test, and writes the tests. This keeps runs cheaper and easier to reproduce and audit. |
| Independent verification | The agent runs tests while it works, but the pipeline does not rely on what it reports. The `verify` job has no LLM key: it applies the agent's patch, checks it against the policy, then runs typecheck, both full suites and coverage before and after. The PR comment also compares the agent's report with the actual patch. |
| Filters for generated tests, modelled on Meta's TestGen-LLM | A generated test is kept only if it compiles (typecheck), passes, and passes again in 5 more runs of the new test files; one failed repetition marks it flaky and fails the run. The comment lists files whose line coverage did not go up even though the agent wrote tests for them. |
| Four jobs, each with the least privilege it needs | `analyze` (read-only token, no secrets), `generate` (read-only token and the LLM credential, outputs only a patch artifact), `verify` (read-only token, no secrets), `publish` (write token, no LLM credential, never runs PR code). The agent never holds a token that can write to the repository. |
| `pull_request` trigger, same-repository PRs only | `pull_request_target` would give workflows run from fork PRs access to secrets. Fork PRs get no secrets on `pull_request`, so the workflow skips them explicitly. |
| Agent configuration comes from the base branch | `generate` restores `.claude/`, `CLAUDE.md` and `scripts/test-agent/` from the PR's base commit and deletes `CLAUDE.local.md`, `.mcp.json` and `.claude.json` if the base branch does not have them. A PR therefore cannot change the agent's prompt, skills, memory, MCP servers or permissions for its own run. `anthropics/claude-code-action` restores the same paths. `verify` and `publish` also run the pipeline scripts from the base commit. |
| Credentials hidden from the code the agent runs | The tests the agent writes and runs are arbitrary code. With `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` and bubblewrap, Claude Code removes the LLM credential and Actions tokens from every subprocess environment and isolates the processes, so a prompt-injected test cannot read the token. The job fails if the isolation cannot start. |
| Allow-list permissions (`.claude/ci-settings.json`, mode `dontAsk`) | The agent can read and search the repo, write `*.test.ts(x)`, `frontend/src/test/*Fixture.ts`, `backend/tests/**` and `.test-agent/report.json`, and run one script, `run-tests.sh`, which validates its own arguments. It has no network tools, cannot read `.env`, and cannot push or install packages. Anything not on the list is denied. |
| Policy gate in code (`guard.mjs`) | The run fails if anything outside test paths changed, a test was deleted, or a test contains `.only`, `.skip`, `.todo`, a real network call or a reference to a CI secret. The gate runs in `generate`, again in `verify`, and once more before the push. |
| Structured agent output (`report.json`, validated by `schema.mjs`) | The report lists the decision for each file, the test cases, the skills used, suspected bugs and warnings. It is validated and rendered into the PR comment with HTML, Markdown control characters and `@mentions` escaped. |
| Results in the PR | Verified tests are committed to the PR branch if its head has not moved since the run started. The PR gets one comment that is updated on later runs, and the same text goes to the job summary. The transcript, patch and reports are uploaded as artifacts. |
| Limits on cost and time | At most 15 source files per run, `--max-budget-usd` (default 3), `maxTurns: 60` and job timeouts. A newer push cancels the running workflow, PRs that do not touch app code are skipped by a `paths` filter, and the `skip-test-agent` label turns the agent off for a PR. |

## 2. Running the PR workflow

Prerequisites:

1. One repository secret, either:
   - `ANTHROPIC_API_KEY` from console.anthropic.com, or
   - `CLAUDE_CODE_OAUTH_TOKEN`, created with `claude setup-token` on a Claude Pro or Max subscription.
2. GitHub Actions enabled for the repository. The default workflow permissions can stay read-only, because each job declares the scopes it needs.
3. Optional repository variables: `TEST_AGENT_MODEL` (default `sonnet`) and `TEST_AGENT_MAX_BUDGET_USD` (default `3`).

The workflow runs when a non-draft PR from a branch of this repository is opened, updated, reopened or marked ready for review, and it changes `frontend/src/**` or `backend/src/**`. The `skip-test-agent` label opts a PR out.

To run it locally with the same agent, skills and permission policy:

```bash
cd frontend && npm ci && cd ../backend && npm ci && cd ..
npm i -g @anthropic-ai/claude-code
export ANTHROPIC_API_KEY=...             # or CLAUDE_CODE_OAUTH_TOKEN
# PR-like run against main:
node scripts/test-agent/detect-changes.mjs --base "$(git merge-base origin/main HEAD)" --head "$(git rev-parse HEAD)"
bash scripts/test-agent/run-agent.sh
node scripts/test-agent/guard.mjs && node scripts/test-agent/schema.mjs .test-agent/report.json
# Coverage sweep over all source files without a test file:
node scripts/test-agent/detect-changes.mjs --sweep && bash scripts/test-agent/run-agent.sh
```

## 3. Where the agent and skills live and how they are used

```
CLAUDE.md                                   project context loaded by every session
.claude/agents/unit-test-engineer.md        the agent: role, procedure, rules, tools, model, maxTurns, preloaded skills
.claude/skills/
  analyze-pr-changes/SKILL.md               reads plan.json and the diff, decides create, update or skip per file
  write-frontend-unit-tests/SKILL.md        Vitest + RTL conventions: design-system mocks, TanStack Query wrapper, fetch stubs, fake timers
  write-backend-unit-tests/SKILL.md         Vitest + Supertest conventions: router with a fake store, Prisma delegate spies, env stubs, lifecycle
  run-tests-and-coverage/SKILL.md           run one test file, fix it (up to 3 attempts), then the full suite and typecheck
  run-tests-and-coverage/scripts/run-tests.sh   the only command the agent may execute
  report-test-results/SKILL.md              report.json format
.claude/ci-settings.json                    CI permission policy (allow-list, dontAsk)
.claude/settings.json                       local defaults (deny reading .env)
scripts/test-agent/                         pipeline scripts: rules, detect-changes, guard, schema, verify, render-comment, run-agent
.github/workflows/pr-test-agent.yml         the PR workflow
.github/workflows/ci.yml                    typecheck, tests and coverage for both packages on every push and PR
```

One PR run goes through four jobs:

1. `analyze`: `detect-changes.mjs` diffs `base...head` and keeps the source files that count toward coverage (the same include and exclude rules as both Vitest configs). It looks up existing tests and writes `plan.json` and `changes.diff`. If no source file changed, the workflow stops here.
2. `generate`: `run-agent.sh` starts `claude --agent unit-test-engineer`. The skills `analyze-pr-changes`, `run-tests-and-coverage` and `report-test-results` are preloaded. The agent loads `write-frontend-unit-tests` or `write-backend-unit-tests` for the package it is working on, writes tests, runs them through `run-tests.sh` and writes `report.json`. The job then validates the report, runs the policy gate and saves the diff as `agent.patch`.
3. `verify`: checks out the PR head again, measures coverage, applies the patch, runs the gate, then typecheck, both full suites and coverage (`verify.json`).
4. `publish`: commits the verified patch to the PR branch, creates or updates the PR comment and writes the job summary.

## 4. Example run

Demo PR: "feat: task statistics" in this repository, with its workflow run.

The PR adds these files with no tests:
- backend: `src/features/todos/stats.ts` (`summarizeTodos`) and the route `GET /api/todos/stats` in `router.ts`;
- frontend: `summarizeTodos` in `features/todos/utils/stats.ts` and a `TodoStats` component rendered by `TodosPage`.

The "Unit Test Agent" comment on the demo PR shows what happened in the run: the agent's decision for each file (`create` for the new modules, `update` for `router.ts` and `TodosPage.tsx`), the skills it used, the verification table (typecheck, tests, coverage before and after) and the commit with the generated tests.

### Initial coverage pass (part 1 of the task)

The tests for existing code were written in an interactive Claude Code session that followed the `unit-test-engineer` procedure and the same skills. I reviewed them and ran both suites three times to check for flaky tests.

| Package | Lines before → after | Statements | Branches | Tests |
|---|---|---|---|---|
| frontend | 47.7% → 97.4% | 46.4% → 96.4% | 43.8% → 91.2% | 18 → 95 |
| backend | 33.0% → 100% | 30.2% → 99.2% | 33.3% → 97.9% | 37 → 95 |

New frontend tests cover `lib/http`, all TanStack Query hooks, `utils/todos` (validation, sorting, overdue dates with a fake clock), `TodoItem`, `TodoList`, `TodoEmptyState`, `DeleteTodoDialog`, how `TodosPage` wires its dialogs and notices, `AppProviders`, `todosApi.update` and `remove`, and the `useNotice` timer. New backend tests cover `config` (URL building and escaping, missing variables), `database.initialize`, `health`, the app `factory` (404, 422 for invalid JSON, 413, 500 without leaking error details, OpenAPI and docs), `lifespan` (startup order, graceful shutdown, forced exit, cleanup after failures), `main`, and the router paths that had no tests (get, patch, delete, 404s, invalid ids, invalid patches).

## 5. Assumptions

- Unit tests should not need PostgreSQL, network access or `.env`, so Prisma calls are mocked as in the existing tests.
- Design-system components, stories, types, barrel files and generated code are out of scope. The original Vitest configs already exclude them from coverage, and the agent uses the same rules.
- PR authors are repository collaborators working on branches of this repository. The default branch is protected and reviewed, so configuration from the base branch can be trusted.
- The agent may commit generated tests to the PR branch, and people review them as part of the PR.

## 6. Limitations

- PRs from forks are not processed: `pull_request` gives them no secrets, and `pull_request_target` is avoided on purpose.
- LLM output varies between runs, so two runs on the same diff can produce different tests. Verification proves that the tests compile and pass. It does not prove that they are the best tests possible.
- A passing test can still assert very little. The skills and rules push against that, but nothing measures it (there is no mutation testing).
- GitHub does not start other workflows for a commit pushed with `GITHUB_TOKEN`, so CI does not run on the agent's commit. The `verify` job has already run the same checks on that exact patch.
- If the PR head moves while the agent works, the result is reported but not committed. The new push starts a new run.
- A run handles at most 15 source files. In bigger PRs the remaining files are listed as over the file limit.
- When a source file is deleted, the agent reports it but cannot delete the tests that still import it.
- Prompt injection is reduced by several measures: the prompt tells the agent to treat code and diffs as data, contains no PR text, the tools are allow-listed, the configuration is pinned to the base branch, subprocesses run without credentials, the output goes through the policy gate, and the comment is escaped. No setup can fully exclude it for an LLM.
- Network egress from the `generate` job is not restricted. A prompt-injected test cannot read the credentials, but it could still send repository content out; the repository is public, so this exposes nothing new.
- `npm ci` in `generate` and `verify` runs install scripts from the PR's lockfile. This is acceptable because PR authors are collaborators (see Assumptions), and those steps have no secrets.

## 7. Changes for a production version

- Run the agent as a GitHub App with short-lived tokens scoped to the repository. Open a separate PR with the tests (or post suggested changes) instead of pushing to the author's branch, so CI runs on it normally.
- Add mutation testing (Stryker) on changed files as a quality gate for generated tests, and a coverage threshold on changed lines.
- Restrict runner network egress, for example with harden-runner, to the LLM API and the npm registry.
- Support fork PRs with two stages: `pull_request` builds artifacts, then `workflow_run` uses the secrets without running PR code.
- Track cost, duration, flaky tests and how often generated tests are kept or reverted.
- Use a cheaper model for the skip decision and a stronger one only for files that need tests.
- Cache npm and Prisma client generation, and run the frontend and backend agents in parallel on large PRs.
- Keep a fixed set of diffs with expected decisions and run it as an eval whenever `.claude/` changes.

## 8. References

The solution was checked against these sources:

- GitHub, [Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions): least-privilege `GITHUB_TOKEN`, actions pinned to full commit SHAs, untrusted input passed through environment variables, no `pull_request_target` with a PR checkout.
- GitHub, [Workflow syntax: `permissions`](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions): scopes that are not listed are set to `none`, and write access is downgraded to read for fork PRs.
- Anthropic, [claude-code-action security](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md): restore Claude configuration from the base branch, subprocess credential scrubbing with bubblewrap, keep workflow permissions minimal and validate all outputs.
- Anthropic, [Claude Code sandboxing](https://code.claude.com/docs/en/sandboxing): child processes of sandboxed commands inherit the environment unless credentials are removed.
- OWASP, [Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/): LLM01 prompt injection, LLM05 improper output handling, LLM06 excessive agency, LLM10 unbounded consumption.
- Alshahwan et al., [Automated Unit Test Improvement using Large Language Models at Meta](https://arxiv.org/abs/2402.09171): generated tests must build, pass, pass on every one of five runs, and increase coverage.
- Testing Library, [Guiding principles](https://testing-library.com/docs/guiding-principles/): tests should resemble how the software is used.
