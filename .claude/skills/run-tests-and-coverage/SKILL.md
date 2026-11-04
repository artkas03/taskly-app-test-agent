---
name: run-tests-and-coverage
description: Run unit tests, typecheck and coverage for frontend/ or backend/ through the single allowed script, and interpret failures. Use after writing or changing any test, and before reporting.
---

# Run tests and coverage

Every check goes through one script. In CI it is the only command the permission policy lets you run, and every other shell command is denied:

```bash
bash .claude/skills/run-tests-and-coverage/scripts/run-tests.sh <frontend|backend> <action> [test files]
```

| Action | What it does |
|---|---|
| `test [files]` | Runs Vitest for the given test files (paths from the repo root), or for the whole package if none are given |
| `typecheck` | Runs `tsc --noEmit` for the package, which also checks the test files |
| `coverage [files]` | Runs Vitest with coverage, prints a text summary and writes `coverage/coverage-summary.json` |

Examples:
```bash
bash .claude/skills/run-tests-and-coverage/scripts/run-tests.sh frontend test frontend/src/lib/http.test.ts
bash .claude/skills/run-tests-and-coverage/scripts/run-tests.sh backend typecheck
```

## Loop

1. Run only the file you just wrote, with `test <file>`, so you get results quickly.
2. When it fails, read the error and decide what is wrong:
   - a selector, async timing or the shape of a mock: fix the test;
   - an assertion that contradicts what the code clearly intends: fix the test, then read the code again;
   - the code itself behaves wrongly (an off-by-one, a branch it does not handle): leave the source alone, keep or drop the case as the agent prompt says, and record a `suspected_bug`.
   Make at most 3 fix attempts per file. After that, remove the failing cases and list them in the report.
3. When the target files pass, run the whole package with `test` (no files) and `typecheck`. If a test that passed before now fails, your change broke it, so fix it.
4. If you want to confirm that the changed lines are exercised, run `coverage <files>`.

Note the final results (passed and failed counts) for the report. The pipeline runs everything again on its own afterwards, so report only results you actually saw.
