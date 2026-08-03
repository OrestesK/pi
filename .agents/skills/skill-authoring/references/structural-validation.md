# Structural validation

Structural validation checks whether a skill package has a coherent local shape. It does not judge instruction quality or replace Pi's resource loader.

## Package shape

Required:

```text
skill-name/
  SKILL.md
```

Add only reached supporting material:

```text
skill-name/
  references/   # optional detail loaded when needed
  scripts/      # deterministic repeated operations
  tests/        # behavior owned by helper scripts
  assets/       # output inputs or templates, when consumed
```

Keep the operational workflow in `SKILL.md`. Move optional detail one reference level deep. Avoid chains of references that require repeated discovery.

A helper script is justified only when:

- a current consumer reaches it
- the operation is deterministic and repeated
- the script reduces ambiguity or manual error
- its output and failure contract can be tested

## Local validator

Resolve `scripts/validate_skill.py` from this skill directory, then run:

```bash
python3 /absolute/path/to/validate_skill.py /absolute/path/to/candidate-skill
```

The validator requires `yq` on `PATH` and checks:

- required `SKILL.md` and frontmatter fences
- YAML mapping syntax
- Agent Skills name and description limits
- relative Markdown links that must stay inside the package and exist
- warning-only directory-name mismatch, which Pi permits
- warning-only root-size recommendation for progressive disclosure

Exit codes:

- `0`: structurally valid, including warning-only results
- `1`: validation errors
- `2`: missing `yq` dependency or invalid CLI usage

The validator is read-only. It does not install dependencies, mutate the candidate, score prose, execute a model, or prove effective Pi precedence. After local validation, use `runtime-maintenance` to verify placement and Pi's merged discovery diagnostics. Use `agent-evaluation` only when behavioral activation evidence is required and authorized.
