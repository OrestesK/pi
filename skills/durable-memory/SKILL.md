---
name: durable-memory
description: |-
  Curate durable Markdown memories. Use when proposing, reviewing, or applying a durable memory change
  not for lookup or session history
---

# Durable Memory

## Ownership

`AGENTS.md` owns proactive memory triggering and approval. A proposal is not permission to write. Ask separately before synchronization

This skill owns candidate review, content quality, placement, tags, operation choice, and approved Markdown changes

## Choose durable candidates

Save a candidate only when it is:
- useful across future sessions
- costly or non-obvious to rediscover
- specific and clearly scoped
- supported by a direct user statement, current source, or verified result

Do not save temporary task state, raw chat summaries, guesses, facts easily recovered from Git, or unrelated topics bundled together

One memory has one retrieval purpose or reason to change. It does not need to be one sentence

## Check existing memory first

1. Inspect only the smallest relevant Tape or session context when recent intent matters
2. Use `memory_check` to resolve and verify the absolute memory directory. Record it as `<memory-dir>`
3. Use `memory_search` with the subject, scope, identifiers, and likely aliases
4. Read the closest existing record from its verified absolute path inside `<memory-dir>` before proposing a change

Keep proposed paths relative to `<memory-dir>`. Before using a native file tool, join `<memory-dir>` and the approved relative path, normalize the result, and confirm that it remains inside `<memory-dir>`. Never pass a memory-relative path directly to a native file tool

If the directory, target placement, absolute target, or containment is missing or unclear, stop and ask. Do not initialize memory in this workflow, and do not write until the absolute target has been verified

## Choose the operation

- **Create** when no existing memory covers the same claim, scope, and retrieval purpose
- **Update** when the same active memory needs clearer or more complete current content
- **Supersede** when a previously valid fact, decision, or procedure has been replaced but remains useful as history
- **Merge** when records are true duplicates:
  - Similarity alone is not enough
  - compare scope, qualifiers, dates, and retrieval purpose
- **Skip** when the candidate is already covered, transient, unsupported, or easy to rediscover

## Write the memory

Make the body standalone, compact, and complete. Start with the shortest useful working model: what it is, how it behaves, and what it means in practice

For a system or workflow, show the main flow or map before details. Keep connected facts together under short Markdown headings. Use direct, plain language and literal names as retrieval cues. Explain necessary jargon once

Include defaults, real exceptions, and time-sensitive topology with its date only when they matter to future work

Separate intended direction from current reality

When details matter, preserve exact names, commands, dates, conditions, and where each fact applies

Do not turn memory into condensed technical documentation. Omit chat chronology, temporary research, implementation trivia, source indexes, and procedures already owned by repository documentation, skills, source, tests, ADRs, or runbooks

Use the shape that fits the content:
- **Preference:** preference, applicability, and exceptions
- **Decision:** context, decision, rationale, consequences, and current status
- **Procedure or runbook:** only when no canonical repository owner exists and the procedure is a durable, costly-to-rediscover need:
  - include the use condition, prerequisites, steps, expected result, and recheck trigger
- **Project fact:** fact, scope, source, and freshness condition

## Use tags deliberately

Use the minimum sufficient tags. Each tag must serve a distinct retrieval or filtering role. Reuse existing vocabulary. Avoid vague labels and duplicate synonyms. Do not target a numeric tag count

## Frontmatter

Use this default frontmatter:
```yaml
---
description: "Human-readable description"
tags:
  - "tag"
updated: "YYYY-MM-DD"
---
```

Add no other frontmatter by default. Add a field only for a concrete need the user approved. Put important sources, uncertainty, limits, and qualifications naturally in the body. The file path identifies the memory:
- Git preserves revision history

## Place the file

- Put always-needed context under `core/`
- Put project-specific auto-delivered memory under `core/project/`
- Put non-core material under `docs/`, `archive/`, `research/`, or `references/`
- Never create a root-level `project/`:
  - use `core/project/`

## Propose the change

Show enough for the user to judge the exact change:
```markdown
## <Create | Update | Supersede | Merge | Skip>

- Path: <path relative to `<memory-dir>` or unresolved placement>
- Proposed memory: <title, statement, or compact body outline>
- Description: <description>
- Tags: <tags>
- Scope or source: <only when material>
- Reason: <why this operation is correct>
```

Group multiple items by operation. Skip items need no approval. End with one focused question: `Proceed with these memory changes?`

## Apply an approved change

Write only the approved content, path, and operation using native file tools. User-facing paths stay relative to `<memory-dir>`, but every file tool must receive a normalized, contained absolute target:
- For a create, resolve and verify `<target>`, then use `write` on `<target>` with complete YAML frontmatter and body
- For an update, resolve and verify `<target>`, read `<target>` first, use a targeted `edit` on `<target>`, preserve existing frontmatter and comments, and refresh `updated`
- For supersession, resolve and verify both absolute targets, then change only the approved old and new records
- For a merge, resolve and verify the absolute source and canonical targets, then require approval for any archive or deletion action

Add optional metadata only when it was approved and is useful. If the content, path, or operation must change materially during execution, stop and propose the revised change

After writing, read the affected files and inspect the path, frontmatter, content, and effective diff. Do not run a behavioral evaluation unless the user asks for one
