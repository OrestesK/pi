# Changelog

## 0.1.4-ok.2 - 2026-07-18

- Install `@earendil-works/pi-ai` as the `pi-ai-runtime` dependency alias so direct extension loading resolves API subpath imports without Pi rewriting them through its compatibility alias.
- Lock patched `protobufjs` and `ws` transitive versions for the local production install.
- Close websocket sessions owned by the aliased Codex provider during Pi shutdown.

## 0.1.4-ok.1 - 2026-07-18

- Resolve global configuration through `PI_CODING_AGENT_DIR`, with Pi's default directory as fallback.
- Enable Priority processing by default.
- Add GPT-5.6 Sol, Terra, and Luna to the default OpenAI Codex allow-list.
- Update imports and peer dependencies to the `@earendil-works` Pi packages.

## 0.1.4 - 2026-05-03

- Make npm the primary install path in the README.
- Add package/gallery image metadata.
- Add social preview assets for GitHub and sharing.

## 0.1.3 - 2026-05-03

- Add `scale` as a supported `openai-responses` service tier, matching OpenAI SDK response types.
- Keep `openai-codex-responses` priority-only.

## 0.1.2 - 2026-05-03

- Avoid sending unsupported service tiers to OpenAI Codex Responses.
- Treat `openai-codex-responses` as `priority`-only; `flex`, `default`, and `auto` are left unset for Codex requests.
- Document provider-specific tier support.

## 0.1.1 - 2026-05-03

- Polish README with clearer install, config, update, uninstall, compatibility, and security notes.
- Add `npm run check` and `npm run pack:dry-run` scripts.
- Add GitHub Actions CI.
- Add issue tracker/homepage package metadata.
- Add contributing/security docs, issue templates, PR template, and CODEOWNERS.

## 0.1.0 - 2026-05-03

- Initial cost-correct OpenAI service tier extension.
- Add `/fast`, `/openai-tier`, and `--fast` support.
- Wrap Pi OpenAI/OpenAI-Codex providers with Pi's internal `serviceTier` option.
