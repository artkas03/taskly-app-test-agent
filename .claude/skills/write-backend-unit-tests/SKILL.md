---
name: write-backend-unit-tests
description: Conventions and patterns for writing Vitest + Supertest unit tests in backend/ (Express routers, Zod validators, mappers, Prisma repository, config, app factory). Use when creating or updating any backend test.
---

# Backend unit tests (Vitest + Supertest)

The environment is `node`. Tests live in `backend/tests/*.test.ts` and import sources with the `.ts` extension: `import { createApp } from '../src/factory.ts'`. Shared rows are in `tests/fixture.ts`: `record` is a Prisma row and `todo` is the API object.

Unit tests use no PostgreSQL, no `.env` and no network.

## Patterns this repo already uses

Test a router by mounting it on a bare Express app with a fake `TodoStore`:
```ts
const repository = { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn() }
const app = express(); app.use(express.json()); app.use('/api/todos', createTodosRouter(repository))
const response = await request(app).patch('/api/todos/1').send({ completed: true })
```
Assert the status, the body, and that the repository was or was not called with the exact arguments.

Test the Prisma repository with a real client built from a dummy URL, and spy on the delegate. The client never connects because every IO method is mocked:
```ts
const database = createDatabase('postgresql://test:test@localhost:5432/test')
vi.spyOn(database.todo, 'findMany').mockResolvedValue([record])
```
Restore with `afterEach(() => vi.restoreAllMocks())`.

Code that takes a `Database` but uses only a few methods (the health router, `initialize`, the app factory) gets a minimal object with a cast:
```ts
const database = { todo: { findFirst: vi.fn().mockResolvedValue(null) }, $executeRaw: vi.fn() } as unknown as Database
```

Test the app factory and its error handler over HTTP with Supertest: an unknown route returns 404 JSON, malformed JSON 422, an oversized body 413, and a thrown error 500. Silence `console.error` with `vi.spyOn(console, 'error').mockImplementation(() => {})`.

For config that reads the environment, use `vi.stubEnv('NAME', 'value')` and `vi.unstubAllEnvs()` in `afterEach`. Stub a missing variable as `''`. Never depend on the developer's own `.env`.

For Zod validators, run `it.each` over valid and invalid payloads and assert `success` and the parsed output (trimming, defaults, coercion). `validators.ts` and `mappers.ts` have a 100% per-file coverage threshold in `vitest.config.ts`, so any change to them must keep every branch covered.

For the server lifecycle (`lifespan.ts`), mock `./database.js`, `./config.js` and `../factory.js` with `vi.mock`, and use a fake app whose `listen` returns a server built on `EventEmitter`. Do not bind real ports. Capture signal handlers with a spy on `process.once` so they are not registered on the test process.

## Checklist

- One behaviour per `it`, and `it.each` for input tables.
- Cover each new branch: validation failure (422), not found (404), success, and errors passed through from the repository.
- Check that invalid input never reaches the repository (`not.toHaveBeenCalled()`).
- Comment only what a reader could not work out from the code, for example why a fake server emits `error` asynchronously or why environment variables are stubbed with `''`. No comments that narrate steps (`// send the request`, `// check the status`).

## Avoid

- Starting the real server or connecting to PostgreSQL.
- Tests for `src/generated/**` or `types.ts`.
- Changing the thresholds in `vitest.config.ts`.
