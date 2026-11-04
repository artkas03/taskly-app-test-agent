---
name: analyze-pr-changes
description: Decide which changed source files in a PR need new or updated unit tests. Use at the start of every PR test-automation run, before writing any test.
---

# Analyze PR changes

The pipeline has already run the git diff, filtered the paths and written `.test-agent/plan.json`. This skill covers the decision the pipeline cannot make: whether a change needs tests.

## 1. Read the plan

```jsonc
{
  "mode": "pr",                       // "pr" or "sweep"
  "base": "<sha>", "head": "<sha>",
  "packages": {
    "frontend": { "sources": [ { "path": "frontend/src/x/Foo.tsx", "status": "M",
                                 "existingTest": "frontend/src/x/Foo.test.tsx" | null,
                                 "linesAdded": 12, "linesRemoved": 3 } ],
                  "changedTests": ["frontend/src/x/Bar.test.tsx"] },
    "backend":  { ... }
  },
  "skipped": [ { "path": "README.md", "reason": "not a source file" } ]
}
```

Then read `.test-agent/changes.diff`, and for every source file read the whole current file and its existing test if there is one. In sweep mode there is no diff, so the whole file is in scope.

## 2. Classify each source file

| Decision | When |
|---|---|
| `create` | No test file exists and the file has logic: branches, data transformation, validation, side effects, user interaction or error handling. |
| `update` | A test file exists, but the diff adds or changes behaviour it does not cover, or existing assertions contradict the new behaviour and would fail. |
| `skip` | Only formatting, comments, renames that keep behaviour, type-only edits, re-exports, or markup without conditions changed, or existing tests already run the changed lines. |

A change probably needs tests when it adds an exported function, component or route, a new `if`, `switch` or ternary, a new error path, different validation rules, a different request or response shape, or different query-cache logic.

If a source file was deleted and a test still imports it, that test has to be updated or removed. You may not delete tests, so add a warning and let a person decide.

Files excluded from coverage (see "Coverage scope" in `CLAUDE.md`) are always `skip`.

## 3. Decide what to test

For each `create` or `update` file, list the behaviours to test, for example "rejects a title longer than 120 characters" or "PATCH /todos/:id returns 404 when the task is missing". These go into the report's `cases`. Cover the success path, each new branch, the boundaries and the error handling. Use the diff to stay on what changed and leave tests for unchanged behaviour as they are.

## 4. Load the writing skill

- `frontend/**`: `write-frontend-unit-tests`
- `backend/**`: `write-backend-unit-tests`

Record every skill you load in the report's `skillsUsed`.
