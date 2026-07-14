# Domain docs

This is a single-context repository. Engineering skills use the root domain
glossary and system-wide architecture decisions to understand it.

## Before exploring

- Read `CONTEXT.md` for BioModals' canonical domain language.
- Read the files in `docs/adr/` that touch the area being changed.
- If either location does not exist, proceed silently. Domain-modeling skills
  create documentation only when a term or decision has actually been resolved.

## Consumer rules

- Use glossary terms in issues, specifications, hypotheses, tests, and code.
  Do not drift to a synonym that `CONTEXT.md` explicitly avoids.
- If a needed concept is missing, reconsider whether it belongs to this domain.
  If it does, note the gap for domain modeling instead of silently inventing a
  competing term.
- Surface any conflict with an existing ADR explicitly. Do not silently
  override a recorded decision.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── agents/
└── src/
```

Do not add `CONTEXT-MAP.md` or context-scoped glossaries unless the repository
is deliberately split into multiple bounded contexts.
