# Modularity

How this codebase stays modular. The map is `docs/module-ownership.md`; the enforced
numbers are in `scripts/arch.ts`; the test is `test/architecture.test.ts` (SPEC §2.5).

## The golden rule

**One concern, one owner.** Before code is written, find its owner in the map. If no
row owns it, the new row is the decision — made before the code, recorded as a
receipt in `docs/placement-receipts.md`. Placement is never decided mid-task by the
agent shipping the feature.

## The flow — which stage owns a concern

```
input (PWA form / push action / cron)
  → route: authenticate, validate against vocab.ts            src/worker/routes/*
  → rules: pure decision — engine, recurrence, time, holidays  src/shared/*
  → persist: write rows, D1 batch per fire                     routes/* and the persist owners named in docs/module-ownership.md
  → deliver: push sender, house speaker (HA via Tunnel+Access)  push.ts, house.ts
  → render: prepared state on screen, capture intent           frontend/src/*
```

- **Rules own decisions.** Whether a fire rings, what an action does, which dates an
  event occurs on: `src/shared/`. It is pure — `now` is a parameter, no I/O.
- **Routes validate and persist; they do not decide.** A route that grows an `if` about
  alert behavior is putting a rule in the wrong stage.
- **The PWA renders and captures intent.** It never re-derives what the server decides
  (it may call the same shared module, e.g. `recurrence.ts`, so the two cannot disagree).
- **Delivery moves messages.** `push.ts` and `house.ts` send, classify and record; they
  never decide whether to alert.
- **Cross-cutting client state** lives in `frontend/src/state.tsx`, never in a module
  global (the test bans top-level `let`/`var`).

Every code change asks the placement-advisor first (CLAUDE.md step 2), and changes that
touch rules, schema, the House (Home Assistant) contract or the push contract get its
closest look.

## Ceilings, the warning band, and the two verdicts

Every source file has a line cap: `GLOBAL_FILE_CAP`, or an individually pinned ceiling
in `CEILINGS` (size when pinned + `WORKING_BUFFER`). A cap is a smoke detector for god
files, not a target.

`npm run arch:audit` marks files at **≥ 90 %** of their cap. That band is a signal to
the **coordinating session after merging**, never to the agent that wrote the code,
and never a test failure. Each file in it gets one of two verdicts, equal in standing:

- **Extract** — a real seam exists → `reorganizer` opens it in its own commit
  (behavior-preserving, tests green), then the cap is re-pinned **down**.
- **Bless-and-raise** — the file is one cohesive concern that legitimately grew →
  re-pin at current size + `WORKING_BUFFER`, with a receipt saying why.

Judge by cohesion and coupling, not line count. Splitting a cohesive file to satisfy a
number is classitis. A test failure at 101 % leaves only one answer; the band exists so
the decision is made earlier, calmly.

## Roles

| Who | Does | Never |
|---|---|---|
| Coordinating session | Spec first, asks placement-advisor, dispatches, merges, verifies, runs `arch:audit` | Hands a structural decision to a worker mid-task |
| `placement-advisor` | Names the one owner (or a new row) before code is written | Decides UI layout — that is MojoSOGO's |
| `reorganizer` | Opens a seam behavior-preservingly, own commit, re-pins cap down | Adds a feature |
| Worker | Builds to the spec, inside the named owner | Moves code to a new home on its own |
| `code-steward` | After every feature release (each minor version, once live): audits the whole tree, returns a ranked backlog | Refactors, or invents churn |

The three agents are defined in `.claude/agents/` (adapted from SogoTable's).

There is no light path that skips the advisor: an obvious owner just makes its verdict
quick. Every verdict leaves a receipt in `docs/placement-receipts.md`, and the commit
message names the owner.
