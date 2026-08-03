# Activation contract

A skill description is a routing contract, not a summary of every instruction in the package. Pi places each discovered skill's name, description, and path in the model-visible catalog; the full `SKILL.md` loads only when the model selects or explicitly reads it.

## Define the boundary first

Before writing the description, identify:

- the behavior this skill alone owns
- a current task or consumer that needs it
- direct natural-language triggers
- common synonyms and adjacent phrasings
- near misses that belong to another owner
- requests that must not activate the skill

Do not create a skill when an existing owner can absorb the behavior cleanly or when no current consumer reaches it.

## Write a precise description

A useful description states both capability and trigger:

```yaml
description: Extract text and tables from PDF files. Use when reading, converting, or inspecting PDF documents.
```

Prefer concrete user language over internal taxonomy. Include exclusions or handoffs only when they prevent a plausible routing collision. Keep detailed procedure, setup, and examples out of the description because it is always present in context.

Avoid:

- vague claims such as "helps with development"
- an inventory of every possible feature
- trigger phrases unrelated to the skill's real behavior
- universal activation for a narrow specialist workflow
- negative-only descriptions
- references to tools or files that the package does not provide

## Check the contract

Prepare a small activation profile with:

- direct trigger
- synonym or paraphrase
- near miss
- negative control
- fresh-context case

`skill-authoring` defines these cases but does not judge model behavior. Hand comparative activation evidence to `agent-evaluation`. Structural discovery only proves that the catalog exposes the description; it does not prove that a model will load the skill.
