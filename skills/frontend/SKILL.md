---
name: frontend
description: React and TypeScript implementation conventions for state, effects, component APIs, accessibility, and existing project patterns. Use when creating, modifying, or reviewing .tsx/.jsx components and frontend interfaces.
---

# Frontend Conventions

## React behavior

- Prefer function components and follow the project's established component and file-placement patterns
- Use `useEffect` only to synchronize with an external system; derive UI values during render and handle user actions in event handlers
- Clean up subscriptions, timers, connections, and other external resources acquired by an effect
- Add memoization only for a demonstrated expensive computation, meaningful re-render, or referential-identity consumer
- Keep coordinated state under one clear owner; lift it only to the closest common owner and expose controlled state only when a consumer needs ownership
- Prefer composition for structural variation, but keep boolean props for genuine binary behavior
- Use compound components or context only when independently composed parts must coordinate
- Use existing component-library patterns before creating new primitives

## Accessibility

- Prefer native semantic HTML; add ARIA only when native elements cannot express the required semantics
- Ensure interactive controls are keyboard-operable, retain visible focus, and have accessible names; icon-only controls need a programmatic label
- For material status or error changes that do not move focus, make the update programmatically available to assistive technology; use a suitable live region or role when needed
- Respect reduced-motion preferences for nonessential animation

## Performance and versions

- Verify installed React and framework versions before using version-sensitive APIs
- Require measured evidence before performance-specific optimization

## TypeScript

- Use strict mode
- Model the actual contract; follow project convention when either an interface or type alias fits, and use unions for genuine variants
- Do not use `any`; use `unknown` when a value is genuinely unknown
- Import types with the `type` keyword

## GraphQL

- Use generated types instead of manually defining GraphQL response types
- Use fragments for reusable field selections
