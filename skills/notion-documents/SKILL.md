---
name: notion-documents
description: Write, edit, and format Notion documents. Use when creating or revising Notion pages, turning notes into a Notion document, or improving a page's structure and readability. Covers document composition and existing embedded views, not database or workflow design
---

# Notion Documents

Keep Notion documents clear, concise, and easy to maintain. Use judgment for ordinary formatting choices within these preferences

## Edit an existing page

- Read the current page before editing, including the content and formatting in the affected sections
- Preserve the user's wording, hierarchy, underlines, badges, colors, and layout outside the requested change
- If the page uses a different style, identify the difference and ask whether to apply these preferences
  - Make the proposed reformatting scope explicit and preserve the existing style unless the user approves the change
- Prefer targeted edits over replacing the whole page, retaining existing block structure rather than flattening it into plain text
- Fetch the page after editing and check the intended change and preservation of surrounding content and formatting
  - A fetched representation does not prove visual rendering or persistent UI state

## Compose the document

- For internal design and working notes, default to a compact working outline rather than an explanatory report
  - Let headings and parent bullets carry the shared subject. Use short values, actions or questions beneath them instead of restating that context in complete sentences
  - Keep the main outline focused on intended behavior, scope and reader decisions. Put supporting investigation and implementation evidence in notes beside the affected topic; keep consequential qualifications visible where needed
    - Use shared notes when an investigation genuinely spans topics
  - Express uncertainty locally with a question or brief qualifier. Do not expand it into repeated explanations that something is tentative or undecided
  - Use prose when it explains a relationship more clearly. Do not add an introduction that merely paraphrases the outline
  - Choose the structure from the content, not a fixed set of fields. Adapt this default when the document’s purpose calls for narrative or fuller explanation
- Select source material for the document’s purpose and the audience’s knowledge and vocabulary, rather than reproduce a fact inventory by default. Include familiar facts when their consequences matter to this reader
- Bold useful short lead-ins in explanatory bullets without forcing a label onto every bullet
- Omit final periods from prose paragraphs and bullets, keeping periods between sentences
- Choose descriptive link labels or full URLs according to clarity, using full URLs when short or when the address matters
- Keep page titles plain, without custom page icons unless requested or already established
- Reread the main text once for repeated points, relevance to this reader and purpose, and whether main and supporting information are in the right places

### Illustrative example

Fictional proposal; the labels illustrate relationships, not a required set of fields

**Before**

> Procurement proposes budget-owner approval followed by director approval for purchases of $10,000 or more. Which purchases, if any, are exempt remains undecided. Director routing is supported, but the group mapping has not been verified

**After**

```markdown
## Purchase approvals
**Proposed**

- **Requested by:** Procurement
- **Applies to:** Purchases of $10,000+
	- **Exceptions:** Which purchases, if any?
- **Order:** Budget owner → director

<details>
<summary>Implementation notes</summary>
	- Director routing supported
	- Group mapping unverified
</details>
```

## Choose layout and emphasis

- Use toggles to put secondary detail behind a collapsed presentation by default
  - Main sections may also be toggles when that makes the document cleaner
  - Do not promise initial or persistent collapsed state without verifying the current tool and client behavior
- Use native tabs for suitable groups of sections
  - Choose tabs, toggles, or ordinary sections according to document purpose and readability
- Use compact simple tables when they improve comparison, keeping long explanations outside cells
- Default to a single column
  - Use columns when they materially improve the document and retain a sensible reading order when stacked on narrow screens
- Rely on Notion's built-in outline by default, adding an in-page table of contents only when it offers a clear benefit
- Use ordinary headings and text for warnings, constraints, and notes, not callouts
- Keep colors restrained and consistent within the document and reuse established meanings for the same concepts across related pages
  - Choose colors for new categories as needed
- Prefer compact colored monospace category labels when labels help scanning
  - Use equal-width padding only when alignment makes the document cleaner

## Add useful supporting material

- Include diagrams, code examples, or screenshots when they explain better than prose, not for decoration
- Prefer diagram-only presentation and show diagram source when it helps the reader
  - Do not claim that a Mermaid block hides its source or sets a persistent preview mode unless the current tool and client behavior establish it
- Use appropriate existing embedded views as document content
- Propose new database or workflow design separately from the document-writing task

## Use Notion's document toolkit

- Read the current tool descriptions and Notion enhanced-Markdown specification for the operation being used
  - Do not treat enhanced Markdown as ordinary Markdown or assume editor controls are exposed by an API
- Use native structures where suitable: heading levels 1–4, toggle headings, nested toggles, `<tabs>` / `<tab>`, simple tables, and columns
- Use rich-text annotations for color, underline, and code, including combined colored monospace labels
