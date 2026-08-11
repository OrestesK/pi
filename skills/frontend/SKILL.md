---
name: frontend
description: Use when you create, change, or review React and TypeScript components and frontend interfaces
---

# Frontend Conventions

## React behavior

- Use function components and follow the project's existing component and file-location patterns
- Use `useEffect` only to synchronize with an external system. Derive UI values during render. Handle user actions in event handlers
- Clean up subscriptions, timers, connections, and other external resources acquired by an effect
- Memoize only when an expensive computation or meaningful re-render is demonstrated, or when a consumer needs referential identity
- Keep coordinated state with one clear owner. Lift it to the nearest common owner only when needed. Make state controlled only when a consumer needs ownership
- Prefer composition when structure varies. Keep boolean props for genuinely binary behavior
- Use compound components or context only when independently composed parts need to coordinate
- Use existing component-library patterns before creating new primitives

## Accessibility

- Use native semantic HTML when it can express the required semantics. Add ARIA only when it cannot
- Make interactive controls keyboard-operable, visibly focused, and accessible by name. Give icon-only controls a programmatic label
- When a material status or error change does not move focus, announce it programmatically to assistive technology. Use a suitable live region or role when needed
- Respect reduced-motion preferences for nonessential animation

## Performance and versions

- Verify installed React and framework versions before using version-sensitive APIs
- Require measured evidence before performance-specific optimization

## TypeScript

- Use strict mode
- Model the actual contract. When an interface or type alias would both fit, follow project convention. Use unions for genuine variants
- Do not use `any`; use `unknown` when a value is genuinely unknown
- Import types with the `type` keyword

## GraphQL

- Use generated GraphQL response types rather than defining them by hand
- Use fragments for reusable field selections
