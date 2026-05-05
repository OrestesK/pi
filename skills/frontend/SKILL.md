---
name: frontend
description: React/TypeScript conventions — no unnecessary memoization, component patterns. Use when creating or modifying React components, working with .tsx/.jsx files, or building frontend interfaces.
---

# Frontend Conventions

## React
- No unnecessary useMemo/useEffect — only memoize when there's a real performance reason
- Prefer function components
- Co-locate related files (component + styles + tests)
- Use existing component library patterns before creating new components

## TypeScript
- Strict mode
- Prefer interfaces over types for object shapes
- No `any` — use `unknown` if type is genuinely unknown
- Import types with `type` keyword

## GraphQL
- Use codegen types — don't manually define GraphQL response types
- Fragments for reusable field selections
