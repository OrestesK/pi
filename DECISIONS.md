# Pi Config Decision Registry

This registry is the permanent repository-local history of material user decisions about this Pi configuration's behavior, workflows, approvals, orchestration, proof, and output contracts.

## Use

- The user is the behavior authority and source of truth.
- Consult relevant entries before proposing or changing global Pi config behavior or workflow policy.
- Preserve the exact question and answer. `Normalized intent` aids application but does not replace the answer.
- A later answer or direct correction supersedes conflicting earlier guidance. Keep superseded entries for provenance and link the replacement.
- Ask the user when entries conflict, scope is unclear, or a proposed interpretation would materially change observable behavior.
- This is config-only provenance. Do not add unrelated project/session facts, benchmark decisions, debugging answers, or every `ask_user` response.
- Add material config intent decisions manually; do not auto-ingest conversations.
- `AGENTS.md`, canonical skills, agents, and prompts remain the executable behavior owners. This registry does not override them silently; inconsistency is a defect to surface.

## Authority, materiality, and approval

### CFG-001 — User is the behavior authority

- Status: current
- Force: MUST
- Scope: global config behavior
- Question: Should workstream 1 be strictly behavior-preserving consolidation, with no intentional change to approval, safety, routing, delegation, testing, or verification outcomes?
- Answer: "You can ask me what I want. I am the source of truth for beahvior, and you cna laso advise"
- Normalized intent: Do not infer desired behavior from existing text alone. Ask the user about material behavior and provide evidence-backed recommendations or pushback.
- Provenance: `.scratch/research/2026-07-23-kernel-ask-user-decisions.md` entry 1.

### CFG-002 — Ask only about material choices

- Status: current
- Force: MUST
- Scope: decision routing
- Question: When should the agent stop and ask you before acting?
- Answer: "Only material choices (recommended)"
- Follow-up question: Should this define a material choice requiring your decision?
- Answer: "Use this materiality definition (recommended)"
- Normalized intent: A choice is material when it changes observable behavior, API/schema/protocol, architectural ownership, dependencies, a demonstrated compatibility or trust/data boundary, external effects, or an approval boundary. Verify factual/routine questions with tools; ask only when such a choice remains unresolved.
- Provenance: kernel ledger entry 3; all-session ledger entry 58.

### CFG-003 — Simplify approval routing

- Status: current
- Force: MUST
- Scope: task classification
- Question: Should the global kernel retain Tier 1/2/3, or simplify approval routing?
- Answer: "Simplify to trivial vs nontrivial/material (recommended)"
- Normalized intent: Classify by behavioral and decision risk, not file or line count.
- Provenance: kernel ledger entry 19.

### CFG-004 — Nontrivial plan approval remains mandatory

- Status: current
- Force: MUST
- Scope: pre-mutation planning
- Question: Before tracked/source/config edits, should nontrivial but non-material work still require a decision-ready plan approval?
- Answer: "Keep nontrivial plan approval (recommended)"
- Normalized intent: Before nontrivial mutation, present and review a decision-ready plan, then obtain approval.
- Provenance: post-audit ledger entry 14.

### CFG-005 — Plan approval UX must be complete and direct

- Status: current
- Force: MUST
- Scope: plan presentation
- Question: How should planning work for nontrivial tasks when no material user decision is unresolved?
- Answer: "i thikn it should ask me for aproval. but that is not jus tit. it shold list all the assumpto, amke it great UX for me to review, also never point me to just a plan file, it shold epxlai nto me, ask me waht decision i would like to make, recommendations it gives, what other ideas it explored, if its the simplest and best one, etc"
- Normalized intent: Present the complete proposal in chat with assumptions, recommendation, alternatives, simplicity rationale, risks, evidence, proof, boundaries, and one focused decision. A file is supporting evidence, never the presentation.
- Provenance: kernel ledger entry 14.

### CFG-006 — Plan review is visible-draft-first

- Status: current
- Force: MUST
- Scope: proposal review
- Question: Should plan review use a visible-draft-first workflow?
- Answer: "Visible draft, async review, revised approval (recommended)"
- Normalized intent: Show the complete draft, review it asynchronously while it remains inspectable, synthesize findings, then show the complete revised plan and material deltas before approval.
- Provenance: post-audit ledger entry 18.

### CFG-007 — Approval is behavioral, not file-bound

- Status: current
- Force: MUST
- Scope: authorization boundary
- Question: What should user approval bind to: the approved behavior or exact implementation files?
- Answer: "Behavior approval; internal file ownership (recommended)"
- Normalized intent: Approval covers outcome, non-goals, material risks, protected boundaries, and stops. Files guide canonical ownership and writer isolation; necessary in-behavior files do not require renewed approval.
- Provenance: all-session ledger entry 81.

### CFG-008 — Earlier major-stage pauses

- Status: superseded
- Force: superseded
- Superseded by: CFG-009, CFG-010, CFG-019
- Scope: post-approval stage flow
- Question: After approving a nontrivial plan, how far may the agent proceed autonomously?
- Answer: "Pause after each major stage — I thkn it shold pause becaue it shold tell me wahts happeningand if were on the right track. im still someone who steres it and als, it might mfind thing staht hcnag eth directoin during impementation or it might want toask me questin asbout asusmptions and such"
- Normalized intent: The underlying need is stage visibility and user control. Later decisions replaced automatic stage waits with automatic review/fix and safe verification while retaining stage reports and stops for new material choices.
- Provenance: kernel ledger entry 26.

## Planning, execution, review, and verification

### CFG-009 — Automatic review and eligible local fixes

- Status: current
- Force: MUST
- Scope: post-implementation stage flow
- Question: After an approved implementation batch, what should happen before final verification?
- Answer: "Automatic review + local fixes (recommended) — yes uatomatic, but again, please make sure the review it good and doesn tintruce more stuff or stuf i dont want, etc. I thikn the reviewr is the most importnat agent in a config"
- Normalized intent: Continue automatically into strong independent review. Apply only validated, mechanically local, non-material fixes inside approved behavior; preserve simplicity and scope; re-review.
- Provenance: post-audit ledger entry 4.

### CFG-010 — Run safe verification automatically

- Status: current
- Force: MUST
- Scope: final verification
- Question: Should the agent still pause after review/fix before running final verification or live validation?
- Answer: "Run safe verification automatically — yes, but make sure its like: presnt the  plan, dispatches swarn, i can still look at the plan, whne swarm returns it makes cahgnes and shows me plan agian, so im never just waiting wihtout beign able to look at the plan"
- Normalized intent: Safe, bounded, local, non-mutating, non-expensive claim-bound verification is automatic. Live, external, expensive, effectful, credentialed, destructive, deployment, Git, or other protected validation remains separately authorized. Keep work inspectable while async review runs.
- Provenance: post-audit ledger entry 17.

### CFG-011 — Review/fix loops terminate by evidence and progress

- Status: current
- Force: MUST
- Scope: review, fix, re-review, and debugging loops
- Question: What should terminate an automatic review/fix/re-review loop?
- Answer: "Evidence/progress termination (recommended) — yes, but again, our review agent must be really good. its the most improtant agent, it shold be aligen dwith eveyrying i said. all agnets shold. all skills should"
- Normalized intent: Continue while validated primary findings produce material progress. Stop clean, incidental-only, repeated/stalled, blocked, or at a new material/protected boundary. Never stop from an arbitrary round or fix-attempt count.
- Provenance: all-session ledger entry 84.

### CFG-012 — Parent normally writes

- Status: current
- Force: SHOULD
- Scope: implementation ownership
- Question: Who should normally perform implementation writes on nontrivial tasks?
- Answer: "Parent normally writes (recommended)"
- Normalized intent: The parent owns normal implementation, fixes, integration, and verification. Write children are exceptional concurrent writers with exclusive internal ownership while the parent owns another independent area.
- Provenance: kernel ledger entry 5.

### CFG-013 — Automatically fix and re-review only in scope

- Status: current
- Force: MUST
- Scope: reviewer finding disposition
- Question: Should the parent automatically fix review findings that remain inside the approved plan?
- Answer: "Fix and re-review in scope (recommended) — yes but pelase please make sure it  doesnt add any non simple and non clean and out of scope code before aksing me"
- Normalized intent: Validate findings first. Automatically fix only primary, mechanically local, non-material issues within approved behavior; do not add complexity or expand scope; re-review after fixes.
- Provenance: kernel ledger entry 23.

### CFG-014 — Reviewer is the primary quality boundary

- Status: current
- Force: MUST
- Scope: reviewer agents and review workflows
- Question: How should review depth and reviewer fanout be chosen by default?
- Answer: "my methodlogy is, since the verieer are in apralle, you sohld run miniium 3 (as was staed in the pormpt before), and all 3 shold be different angles/directions. do you udnestand the idea? we are pitmzing for time and quality here, not nubmer of subagents or low resource use"
- Normalized intent: Every nontrivial review uses at least three fresh parallel reviewers with genuinely distinct evidence targets. Optimize for quality and elapsed time, not minimum calls.
- Provenance: post-audit ledger entry 5.

### CFG-015 — Three reviewers; evidence-sized elsewhere

- Status: current
- Force: MUST
- Scope: fanout sizing
- Question: Which minimum-fanout rule should be final?
- Answer: "Three reviewers; evidence-sized elsewhere (recommended)"
- Normalized intent: The three-agent minimum applies to nontrivial review. Reconnaissance, research, planning advice, validation, and other fanout are sized by distinct useful evidence needs.
- Supersedes: the broader answer "All nontrivial fanout" in post-audit ledger entry 6.
- Provenance: post-audit ledger entry 7.

### CFG-016 — Subagents are mandatory for nontrivial work

- Status: current
- Force: MUST
- Scope: nontrivial orchestration
- Question: What should the default rule for subagent use be?
- Answer: "Mandatory for nontrivial work"
- Normalized intent: Use advisory/recon/research/planning/review/validation subagents unless concretely unavailable or prohibited. This does not make workers the default implementation path.
- Provenance: kernel ledger entry 4.

### CFG-017 — Readiness-relevant work blocks readiness; background work does not

- Status: current
- Force: MUST
- Scope: async result classification
- Question: When may the agent finish while additional nonblocking scouts are still running?
- Answer: "Wait only for readiness-relevant work (recommended) — well yes, but tehres tow thing here, this is for the final/ready hceck, but for just normal ongoing work, it doesn thave to wait. a case should be like this: it deploys some expaorat ina ndreiew, arrives at some conclusion, and then, just becase (it doenst need to), diapthce a bacjgournd agent to see if it afinds anything weird or jsut to see more i ngenral i the background. i also want my agent to be fast and be able ot paralleize its work"
- Normalized intent: Inspect all readiness-relevant outputs before the dependent claim. Background exploration may continue during ordinary work only with a concrete novel angle and must not delay the primary path.
- Provenance: kernel ledger entry 22.

### CFG-018 — Quality-first, evidence-bounded resources

- Status: current
- Force: SHOULD
- Scope: tools and subagents
- Question: What resource posture should guide tools and subagents?
- Answer: "Quality-first, evidence-bounded (recommended) — yes, but it can also have more suganet just runign ater it decides to see if it finds anything else you know, like it does some, then continue, and has some nonblocking additional things that may or may not finds more?"
- Normalized intent: Do not under-use tools or subagents to save cost. Every child still needs a distinct useful evidence target; optional background work cannot drive readiness silently.
- Provenance: kernel ledger entry 21.

## Async work, reflection, and continuity

### CFG-019 — Report distinct work groups and stages

- Status: current
- Force: MUST
- Scope: progress visibility
- Question: When should the agent proactively report progress?
- Answer: "not very x tools calls, but every time it's doing some groups of work, advanced a stage, doing something. that something cna involve a lot of tool calls, but if its like: implmenting this, then dspathcing swarm to review it, thats 2 quick reports"
- Normalized intent: Report the start of each distinct material work group or stage, material discoveries/blockers, approval/final boundaries, and requested updates. Never report by tool-call/time/token cadence.
- Provenance: kernel ledger entry 12.

### CFG-020 — Mandatory pre-yield Reflection search

- Status: current
- Force: MUST
- Scope: waiting and intended yields
- Question: What should the agent do while waiting for async work or external results?
- Answer: "Always find reflection work — i thikn it should always try to find owkr, but it might not find work, which if fine, but we shold stil tell it to try, but not to like nit or repeat stuff you know, i tihk that rule was there before"
- Normalized intent: Before every intended yield, actively search for concrete valuable, novel, bounded, authorized, non-interfering work. Immediately execute admitted work. Candidate lists, intention statements, healthy-child polling, duplicate work, invented nits, and activity theater do not count. Yield only when nothing qualifies.
- Ownership: `AGENTS.md` carries the concise mandatory trigger and yield condition; `pi-subagents` owns the detailed scan and admission rules.
- Reinforced by: post-audit ledger entry 10 and the user's direct force-strength correction during implementation.
- Provenance: kernel ledger entry 13; post-audit ledger entry 10; `TODO-90634934`.

### CFG-021 — TODO normally; scratch state only when complex

- Status: current
- Force: MUST
- Scope: task continuity
- Question: How mandatory should persistent progress state be for nontrivial work?
- Answer: "TODO normally; scratch only when complex (recommended) — aso always tel me preivous behvaior when asking quetsions"
- Normalized intent: Claim a native TODO for work that may outlive the turn; update only material objective/blocker/next-action changes; close only when complete. Add one ignored scratch session record only for complex mutable state. State previous behavior when asking behavior questions.
- Provenance: post-audit ledger entry 15.

### CFG-022 — Lightweight TODO lifecycle

- Status: current
- Force: MUST
- Scope: task routing cards
- Question: What lifecycle should a TODO follow once one is created?
- Answer: "Restore lightweight lifecycle (recommended)"
- Normalized intent: Claim when active, update on material state changes, close only when actually complete; do not turn TODOs into rigid state machines or transcripts.
- Provenance: all-session ledger entry 82.

### CFG-023 — Complex work must remain recoverable

- Status: current
- Force: MUST
- Scope: continuation and compaction
- Question: What should trigger the nontrivial plan-and-approval gate?
- Answer: "Behavior/risk complexity (recommended) — Also, when doing complex hanges, make sur eto tell it to keep track of its progress and etc (add more stuff to this i cant thkn of more right now, maybe look at the sesion wher eI imeplmented the valkyrie deployemnt system, that was good structuring of progress as it went) so that it doenst jsut get lost in context. also dont ever meiti things like 'beccause it frees up your context' in the prompt, that is like, internal stuff"
- Normalized intent: Preserve objective, approved plan, assumptions, blockers, evidence pointers, child state, and next action. Recover them after continuation/compaction. Explain continuity behavior directly, never with internal context-pressure rationale.
- Provenance: kernel ledger entry 15.

## Evidence, code quality, and completion

### CFG-024 — Behavioral proof is model-selected

- Status: current
- Force: MUST
- Scope: proof strategy
- Question: What testing obligation should the global kernel enforce?
- Answer: "Behavioral proof, model-selected method (recommended)"
- Normalized intent: Select evidence from the observable claim. Test-first, characterization, reproduction, existing coverage, integration/live/manual evidence, or non-behavioral checks are options; no universal TDD/baseline/build/live ritual.
- Reinforced by: "Keep model-selected proof (recommended)" in post-audit ledger entry 13.
- Provenance: kernel ledger entry 6; post-audit ledger entry 13.

### CFG-025 — Rename the proof owner

- Status: current
- Force: MUST
- Scope: skill ownership
- Question: What should replace the canonical `test-driven-development` skill?
- Answer: "Rename to `behavioral-proof` (recommended)"
- Normalized intent: `behavioral-proof` owns claim-selected evidence; remove mandatory-TDD routing.
- Provenance: kernel ledger entry 28.

### CFG-026 — Completion categories are relevance-gated

- Status: current
- Force: MUST
- Scope: readiness assessment
- Question: How should the global completion categories apply across tasks?
- Answer: "Relevance-gated categories (recommended)"
- Follow-up question: What should be mandatory before a nontrivial completion claim?
- Answer: "Parent evidence plus independent review (recommended)"
- Placement question: Where should the missing relevance-gated completion categories be enforced?
- Answer: "Thin root + detailed verification owner (recommended)"
- Normalized intent: The root carries the mandatory relevance-gated trigger; `verification-before-completion` owns the detailed categories. Before a nontrivial completion claim, the parent inspects fresh claim-bound evidence and independent review, assessing requested behavior, canonical ownership/reachable consumers, real boundaries/failures, simplicity, public representations, and final effective change/delegated-work disposition only when materially relevant.
- Provenance: kernel ledger entry 2; post-audit ledger entry 9; all-session ledger entries 35, 40, and 70.

### CFG-027 — Do not turn completion categories into defensive/security theater

- Status: current
- Force: MUST NOT
- Scope: completion and review
- Question: Should this be the global relevance-gated completion category set?
- Answer: "Use this category set (recommended) — this, but after i answer all these quetsinos, also review all the thing syou are saying. because if you say 'security' or like 'data', it will try to over secure and data clean and sanitizem whcih it exactly waht we dont want"
- Normalized intent: Security, privacy, data, error, and trust-boundary work applies only when the affected path reaches a demonstrated boundary. Never invent hardening or sanitation work to fill a checklist.
- Provenance: kernel ledger entry 20.

### CFG-028 — Semantic understanding is mandatory; tool groups are relevance-gated

- Status: current
- Force: MUST
- Scope: code intelligence
- Question: Should AST, LSP, ownership/navigation, and diagnostics groups be mandatory on every material code task or relevance-gated?
- Answer: "Relevance-gated required groups (recommended)"
- Normalized intent: Semantic understanding is required when code structure/behavior/types/diagnostics matter. Use each ownership, LSP, AST, or diagnostics group when it answers a material question; do not mechanically invoke irrelevant groups or silently omit relevant ones.
- Context answer: "requirerequire semantic unetanding, but still force groups like AST, LSP, etc"
- Provenance: kernel ledger entries 8-9; post-audit ledger entry 8.

### CFG-029 — No defensive coding without demonstrated need

- Status: current
- Force: MUST NOT
- Scope: implementation and tests
- Question: What trust-boundary rule should remain globally mandatory?
- Answer: "i do not like defnesive coding. if really needed, then can add no defensive coding fist, and the nif data has evidecne of need, the can do it. My main thing whn lveoping code, is simplciity, cleanilienss, elegance, good, clean code. agents shold not add complecity to address things taht they have assumed, isnetad they can just ask or really thing if its worth"
- Normalized intent: Verify real producers and reachable boundaries. Do not add validation, fallbacks, coercion, malformed-internal-state tests, or complexity for impossible assumed states.
- Provenance: kernel ledger entry 10.

### CFG-030 — Compatibility requires demonstrated consumers

- Status: current
- Force: MUST
- Scope: compatibility, migration, and backfill
- Question: When should agents add compatibility paths, shims, migrations, or backfills?
- Answer: "Only with demonstrated consumers (recommended)"
- Normalized intent: Preserve compatibility only with evidence of released, deployed, persisted, or externally consumed behavior; otherwise do not add a shim by default.
- Provenance: kernel ledger entry 11.

### CFG-031 — Reviewer findings use three partitions

- Status: current
- Force: MUST
- Scope: reviewer output and fix authority
- Question: Is that three-category reviewer output rule correct?
- Answer: "Yes: three separate categories (recommended) — yes, but the main one is the focus, dont speicifcally have anyoen look for the other 2, its only if its finds something"
- Normalized intent: Separate primary in-scope required findings, incidental material adjacent risks, and incidental optional cleanup/polish. Reviewers actively target only the primary category unless another category is explicitly primary. Only primary findings can block or drive automatic fixes.
- Supporting answer: "Report material adjacent risks separately (recommended) — it can alsao include the clneai pand posisj stuff, just seprate from the also separate part"
- Provenance: post-audit ledger entries 11-12.

### CFG-032 — Preserve comments and least diff

- Status: current
- Force: MUST
- Scope: source mutation
- Question: How should agents handle existing comments and commented-out code?
- Answer: "never touch unless activey hcangin that behavior. we sohld follow htepparohc of LEAST DIFF when doing things. don't touhc stuff around the tinhs we're doing. be aware that his of course odenst apply to like, refactorign afunction to add something to make our feature slceaner or simpler and the code better, you know"
- Normalized intent: Do not touch unrelated comments or surrounding code. A behavior-preserving refactor is allowed when it is necessary for a cleaner, simpler implementation of the approved change.
- Provenance: kernel ledger entry 17.

### CFG-033 — Push back on material framing

- Status: current
- Force: SHOULD
- Scope: advice and collaboration
- Question: How proactively should the agent challenge or expand your framing?
- Answer: "Proactive, material advice only (recommended) — this, but it shold also push basck. the agnet is osmeonto bounce ideas off, it bounces ideas off of me too, etc."
- Normalized intent: Challenge unsupported premises and surface useful material alternatives, risks, or simplifications; do not manufacture optional polish.
- Provenance: kernel ledger entry 18.

### CFG-034 — Avoid tables in persisted Markdown

- Status: current
- Force: MUST
- Scope: output formatting
- Question: What should the global output rule for tables be?
- Answer: "Avoid tables by default (recommended) — avoid, but tables are fine to show me in the UI if its good UX, just not in markdown files or in things that are not directly printed to me"
- Normalized intent: Do not use tables in generated/persisted Markdown. Direct chat/UI may use one when it materially improves clarity.
- Provenance: all-session ledger entry 80.

## Configuration ownership and propagation

### CFG-035 — Update every active conflicting surface atomically

- Status: current
- Force: MUST
- Scope: config policy changes
- Question: Should the thin-kernel behavior change update every active conflicting prompt/skill/agent contract atomically?
- Answer: "Atomic active-surface update (recommended)"
- Normalized intent: Inventory and align every effective owner, fallback, prompt, skill, agent, workflow, and applicable executable check; do not leave contradictory active surfaces. This does not require prompt-string contract tests.
- Provenance: kernel ledger entry 29.

### CFG-036 — Activate the whole root skills directory

- Status: current
- Force: MUST
- Scope: skill discovery
- Question: How should the root workflow skills become globally discoverable?
- Answer: "Activate the entire `skills/` directory (recommended)"
- Normalized intent: Root skills are discovered from the whole `skills/` directory.
- Provenance: kernel ledger entry 30; post-audit ledger entry 3.

### CFG-037 — Specialized workflow routing stays compact and trigger-based

- Status: current
- Force: MUST
- Scope: root workflow routing
- Question: How should specialized skills be routed from the global kernel?
- Answer: "Compact mandatory trigger table (recommended)"
- Redesign question: Which target should govern the Prompt/Markdown redesign?
- Answer: "Thin global kernel (recommended)"
- Normalized intent: Keep the root kernel thin. Detailed mechanics stay at canonical skill owners; root routing names only materially relevant triggers and mandatory cross-cutting invariants needed for reachability.
- Provenance: kernel ledger entry 24; all-session ledger entry 33.

### CFG-038 — Autonomous goal behavior has one owner

- Status: current
- Force: MUST
- Scope: active instruction ownership
- Direct correction: "WOWOW, do not insert /goal things into places, /goal should note be mentioned anywher aprt from it own thing tah tinjcets it."
- Clarification question: Does “mention `/goal` only in its injection owner” apply to tests and `DECISIONS.md`, or only to executable instruction surfaces?
- Answer: "Only active instructions (recommended)"
- Normalized intent: Generic `AGENTS.md`, agents, skills, prompts, and workflows must not know or mention the autonomous goal mode. Only its canonical injection owner defines that overlay. Non-runtime tests and this provenance registry may mention it solely to enforce and document ownership.
- Supersedes: every earlier distributed mode clause in generic active instructions.
- Provenance: current session direct correction and follow-up answer.

### CFG-039 — Maintain a config-only decision registry manually

- Status: current
- Force: MUST
- Scope: config decision provenance
- Question: Should I add a durable tracked `DECISIONS.md` registry at the config root and require consulting it before workflow/policy changes?
- Answer: "Create durable registry (recommended) — yes, and you can ask many more too. i am th srouces of truth, you dont need to assume"
- Follow-up question: Which future answers should be added to `DECISIONS.md`?
- Answer: "Material intent decisions (recommended)"
- User correction: "what are yo saying? this wil be just for config things, not for all sessions. you will opulate it manually thorhgout this sessoin"
- Normalized intent: Keep this tracked registry limited to material Pi-config intent decisions and populate it manually during this session. Consult it before policy changes. Ask rather than assume when scope or intent is unclear.
- Provenance: current session.

### CFG-040 — Remove only the stale pi-lens skill filter

- Status: current
- Force: MUST
- Scope: `packages/pi-lens` skill discovery
- Question: Approve removing only the stale `"skills": ["ast-grep"]` filter from the existing `packages/pi-lens` settings entry so the already-approved root skill activation can take effect?
- Answer: "Remove the stale filter (recommended)"
- Normalized intent: Remove only the stale skill filter from the `packages/pi-lens` settings entry. Do not generalize this approval to other package filters.
- Provenance: kernel ledger entry 31.

### CFG-041 — Goal runs mirror normal sessions and replace questions with forced reviewed decisions

- Status: current
- Force: MUST
- Scope: dedicated goal-crafter and goal-supervisor behavior
- Question: Which authority model should the dedicated goal runner use when an unforeseen material product/workflow decision appears during execution?
- Answer: "goal should be not differnt frm regular sessoin, except that it shuld heavily and force and command the user to use some sort of review process on its quetison when it wants to ask me insteadin of asking me. is that clear? also 'normal sesison', plus all the reuglar goal stuff you know"
- Follow-up question: When the forced goal decision review still cannot support one safe in-scope answer, what should the runner do?
- Answer: "the review shold not be incocnlusive, the review shold always just do work to arrive at the best answer it can. but it should choose an answre. it sld never block. the goal shold never block for any reasons except when it actaully cannot do it's work because of something really core, like it was not autorized to do some mutation, or it doenst have acess to some reasources, or aws sso experied, stuff like that"
- Normalized intent: A goal run uses the normal session configuration and normal goal continuation/completion semantics. Its only decision-authority override is that an in-scope material question that would normally go to the user must instead receive substantial review under the normal review contract, including at least three distinct relevant advisors and further evidence work as needed. The runner always chooses and records the best supported in-scope answer; decision ambiguity never yields `INCONCLUSIVE` or a blocker. Review cannot authorize protected actions. Blocking is reserved for a core inability to complete the goal: an automatic command/tool/runtime guardrail, a missing required tool/resource/credential/auth/access/service, or a required protected action that is not authorized and has no safe alternative.
- Ownership: Active semantics remain only in the dedicated goal-crafter and goal-supervisor injection/runtime owner; this entry is provenance permitted by CFG-038.
- Provenance: current session focused behavior audit and follow-up clarification.

### CFG-042 — Natural language is the user-facing workflow interface

- Status: current
- Force: MUST
- Scope: workflow invocation and routing
- Direct correction: "I never run slash commands, always natural language."
- Normalized intent: Infer workflow intent from ordinary user language and route it through the matching canonical recipe. Do not require the user to invoke or know a slash command. Plain review language is read-only; an explicit natural-language request to review and fix authorizes only fixes already permitted by the current behavioral approval boundary. This decision does not change packaged slash-command behavior.
- Provenance: current session.

## Behavior baseline interview

### CFG-043 — Material questions include a concise behavior card

- Status: current
- Force: MUST
- Scope: material behavior questions
- Question: When I ask you a material behavior question, how much “previous behavior vs proposed behavior” context do you want by default?
- Answer: "2 (concise card: current/previous behavior, proposed delta, observable difference, recommendation/tradeoff)"
- Normalized intent: Give a concise decision card containing only the prior/current behavior, proposed delta, observable consequence, and recommendation/tradeoff needed to decide.
- Refines: CFG-002.
- Provenance: `.scratch/sessions/2026-07-23-behavior-baseline-interview.md` decision 1.

### CFG-044 — One reviewed design approval authorizes implementation

- Status: current
- Force: MUST
- Scope: nontrivial/material approval flow
- Question: For nontrivial/material work, which approval model should govern after planning?
- Answer: "1 (one design approval, reviewed before implementation)"
- Normalized intent: Present and review the complete design, then obtain one implementation approval. Ask again only for a material delta, a separately protected action, or a milestone explicitly approved as a wait.
- Reaffirms: CFG-003 and CFG-007.
- Provenance: behavior-baseline interview decision 2.

### CFG-045 — Review fixes get visibility without another wait

- Status: current
- Force: MUST
- Scope: review/fix stage transitions
- Question: After the agent automatically fixes valid review findings inside the approved behavior, how much visibility do you want before it continues?
- Answer: "2 (visible summary, but no approval wait)"
- Normalized intent: Report what review found and what changed, then continue into re-review and verification without another approval pause unless a material boundary changed.
- Provenance: behavior-baseline interview decision 3.

### CFG-046 — Quality review may run opportunistically and nonblocking

- Status: current
- Force: MUST
- Scope: review orchestration
- Question: Which default review model do you want during implementation?
- Answer: "1, but 2 can run like how you described, opportunistically, and check for code qualtiy structure simplicity etc, when its running in the background and not blocking stuff"
- Normalized intent: Required readiness reviews remain claim-bound. Separate read-only quality/structure/simplicity review may run opportunistically during ordinary work when useful, but it remains nonblocking unless a concrete finding is accepted into the primary scope.
- Provenance: behavior-baseline interview decision 4.

### CFG-047 — Accepted primary should-fix findings block PASS

- Status: current
- Force: MUST
- Scope: readiness verdicts
- Question: If a final readiness review has no must-fix defects but does have a validated primary in-scope should-fix, what should happen?
- Answer: "2"
- Normalized intent: A final `PASS` requires every accepted primary in-scope `should-fix` finding to be fixed or explicitly deferred by the user. Optional/background quality exploration remains nonblocking.
- Provenance: behavior-baseline interview decision 5.

### CFG-048 — Simple quality fixes may use one exclusive worker

- Status: current
- Force: MUST
- Scope: write-child delegation
- Question: When a validated cleanup/code-quality fix is simple, behavior-preserving, non-material, and inside an already approved boundary, should a write subagent ever be allowed to implement it while the parent continues independent work?
- Answer: "2, for the same reason of the main agent not being bothered. could be multi file if simple enough and same task you know. if that makes sense?"
- Normalized intent: One worker may own an exact, coherent, exclusive multi-file quality fix when the parent has validated that it is simple, behavior-preserving, non-material, and inside the approved boundary. The parent still inspects, integrates, and verifies it.
- Provenance: behavior-baseline interview decision 6.

### CFG-049 — Exact artifact wording controls subagent use

- Status: current
- Force: MUST
- Scope: no-artifact constraints
- Question: When you say “do not write files/artifacts,” should that also forbid subagent runs because child sessions/logs are artifacts?
- Answer: "1 (strict no-artifact means no subagents; repo-only no-artifact still allows subagents with repo artifacts disabled)"
- Normalized intent: Strict no-artifact wording forbids subagent runtime artifacts. Repo-scoped no-artifact wording still allows child runs with repository artifact output disabled.
- Provenance: behavior-baseline interview decision 7.

### CFG-050 — Push back on materially wrong premises

- Status: current
- Force: MUST
- Scope: user premise correction
- Question: When the agent thinks your premise or preferred direction is wrong, how strongly should it push back before following it?
- Answer: "3 — correct material factual errors or materially harmful scope/design assumptions immediately; otherwise keep objections proportional and evidence-backed"
- Normalized intent: Correct material factual errors and materially harmful assumptions immediately. Keep lower-impact objections concise, proportional, and evidence-backed.
- Provenance: behavior-baseline interview decision 8.

### CFG-051 — Unit tests run after the complete implementation batch

- Status: current
- Force: MUST
- Scope: unit-test timing
- Question: For nontrivial implementation with several edit groups, when should relevant unit tests run?
- Answer: "2 (after the full approved implementation plan; only relevant unit tests)"
- Normalized intent: Do not run unit tests after each small edit or intermediate group. Run only relevant unit tests after the full approved implementation batch.
- Provenance: behavior-baseline interview decision 9.

### CFG-052 — One focused early test is an explicit exception

- Status: current
- Force: MUST
- Scope: test-first/reproduction proof
- Question: For a nontrivial behavior change or bug fix, should one focused proof test/reproduction be allowed before or during implementation?
- Answer: "2 (allow one focused test-first/reproduction test when selected)"
- Normalized intent: One deliberately selected focused failing reproduction or test-first check may run early when it is the most efficient behavioral proof; this does not authorize broad unit-test runs.
- Provenance: behavior-baseline interview decision 10.

### CFG-053 — LSP runs at coherent group boundaries and finally

- Status: current
- Force: MUST
- Scope: diagnostic timing
- Question: How should LSP diagnostics be timed during multi-file code edits?
- Answer: "1 (after coherent edit groups and final relevant edit)"
- Normalized intent: Run targeted LSP diagnostics after each internally consistent code-edit group and freshly after the final relevant edit, not after every tiny edit.
- Provenance: behavior-baseline interview decision 11.

### CFG-054 — Safe verification may create bounded disposable local state

- Status: current
- Force: MUST
- Scope: verification artifacts
- Question: When safe verification requires local temporary state, what should be allowed automatically?
- Answer: "2 (bounded disposable repo-local artifacts allowed; no source/config/dependency/real-data/external/system-state changes)"
- Normalized intent: Safe verification may create bounded disposable repository-local state, but not source/config changes, dependency-policy changes, real-data changes, external effects, or broader system state without authorization.
- Provenance: behavior-baseline interview decision 12.

### CFG-055 — Live authorization specifies the complete effect boundary

- Status: current
- Force: MUST
- Scope: live/external validation
- Question: When live validation needs approval, what must the authorization card contain?
- Answer: "3 (target/environment, exact workflow/action, permitted effects, credentials/data, and cost/time boundary)"
- Normalized intent: Before protected validation, state the target/environment, exact workflow/action, permitted effects, credential/data boundary, and cost/time boundary.
- Provenance: behavior-baseline interview decision 13.

### CFG-056 — Do not silently optimize for assumed resource constraints

- Status: current
- Force: MUST
- Scope: resource/cost/time/downtime posture
- Question: Should the agent reduce tools, subagents, verification, design quality, or parallelism to save cost/time/downtime without asking?
- Answer: "2 i think. but also, plese do not let hte agent do less things, or care about cost, or care about times, or worry about stuf fand not doing it, instead of just asking me beforehand if it should be careful aboutit and not od it. also things like, will there be dwontime with this design? it sohld ask me if its acceptables instea dof designing based on that. hope that makes senes, yi can clarityf more if needed"
- Normalized intent: Do not silently reduce useful work, evidence, quality, validation, or parallelism for assumed constraints. Surface material cost, time, downtime, or resource tradeoffs and ask whether the consequence is acceptable.
- Provenance: behavior-baseline interview decision 14.

### CFG-057 — Clarification covers materially reachable user flows

- Status: current
- Force: MUST
- Scope: design clarification
- Question: During feature/design clarification, how broadly should the agent ask about user journeys and reachable flows?
- Answer: "1 (proactively map and ask about materially reachable workflows; exclude impossible or tool-answerable hypotheticals)"
- Normalized intent: Verify and surface materially reachable workflows, roles, states, and consequences before design approval. Do not invent impossible hypotheticals or ask factual questions tools can answer.
- Provenance: behavior-baseline interview decision 15.

### CFG-058 — In-scope simplification does not require another approval

- Status: current
- Force: MUST
- Scope: implementation scope
- Question: When implementation reveals a cleaner behavior-preserving refactor inside the approved boundary, what should happen?
- Answer: "3 (proceed when local/in-scope and proof-supported; ask only when it materially changes ownership, scope, behavior, compatibility, or another protected boundary)"
- Normalized intent: Implement proof-supported in-scope simplification without another approval. Ask only when it crosses a material behavior, ownership, scope, compatibility, security/data, dependency, or protected-action boundary.
- Provenance: behavior-baseline interview decision 16.

### CFG-059 — Defensive code requires a demonstrated reachable state

- Status: current
- Force: MUST
- Scope: trust boundaries and guards
- Question: When may the agent add a guard, fallback, validation, coercion, retry, or recovery branch?
- Answer: "2 (only after demonstrating the reachable producer/boundary state and placing the check at its canonical owner)"
- Normalized intent: Add defensive behavior only for a demonstrated reachable boundary/state and validate it once at the canonical owner. Trust established downstream invariants.
- Provenance: behavior-baseline interview decision 17.

### CFG-060 — Unproven compatibility is proposed, not silently added

- Status: current
- Force: MUST
- Scope: compatibility
- Question: What should happen when compatibility looks useful but released/deployed/external consumption is not proven?
- Answer: "2 (propose it and ask before adding)"
- Normalized intent: Preserve compatibility when the boundary is proven. When it only appears useful, present the evidence/tradeoff and ask before adding it.
- Provenance: behavior-baseline interview decision 18.

### CFG-061 — Useful ignored scratch artifacts have standing permission

- Status: current
- Force: MUST
- Scope: task-local artifacts
- Question: Should the agent need per-task approval before creating useful ignored `.scratch/` artifacts?
- Answer: "1 (standing permission from repo config; exact no-artifact wording still overrides)"
- Normalized intent: Repository policy grants standing permission for useful ignored `.scratch/` artifacts. A strict no-artifact instruction overrides it.
- Provenance: behavior-baseline interview decision 19.

### CFG-062 — DECISIONS.md is permanent repository-local Pi-config history

- Status: current
- Force: MUST
- Scope: decision provenance
- Question: What is the long-term role of `DECISIONS.md`?
- Answer: "2 [file] should contain all my decisions related to my Pi config, repo-local"
- Normalized intent: Keep this file permanently as repository-local history for material Pi-configuration decisions. Active behavior remains in canonical runtime/instruction owners.
- Supersedes: CFG-039 only where it described population as limited to this session; retains its config-only/manual-curation boundary.
- Provenance: behavior-baseline interview decision 20.

### CFG-063 — Authenticated private reads are autonomous when genuinely read-only

- Status: current
- Force: MUST
- Scope: authenticated/private access
- Question: Should the agent ask before broad authenticated/private read-only actions?
- Answer: "2 (broad autonomous reads; approval only for mutation, disclosure/export/persistence, material production load/cost/time, privacy/legal impact, or other effects)"
- Normalized intent: Do not ask merely because a useful read uses credentials or private access. Ask when the operation mutates, discloses/exports/persists data, creates material production load/cost/time, has privacy/legal impact, or otherwise causes protected effects.
- Provenance: behavior-baseline interview decision 21.

### CFG-064 — Goal mode is activated only by the real goal runtime

- Status: current
- Force: MUST
- Scope: goal activation ownership
- Question: Should goal behavior activate only when the dedicated goal runtime/injection owner is actually active?
- Answer: "/goal should only get acitvate when I use the /goal command, which is code, not text, the /goal command activates the thing"
- Normalized intent: Generic active instructions never infer, emulate, or activate goal behavior from prose. Only the actual `/goal` command/runtime injection owner activates it.
- Reaffirms: CFG-038.
- Provenance: behavior-baseline interview decision 22.

### CFG-065 — Goal decision scope comes from the explicit goal contract

- Status: current
- Force: MUST
- Scope: goal autonomy
- Question: How broadly may a goal runner decide without the user?
- Answer: "1 (only within explicit outcome, non-goals, and protected boundaries)"
- Normalized intent: Goal review may choose among options only within the explicit outcome, non-goals, and protected boundaries. It cannot self-authorize material scope expansion or protected actions.
- Provenance: behavior-baseline interview decision 23.

### CFG-066 — Disable active durable Memory and retain Tape

- Status: current
- Force: MUST
- Scope: pi-memory-md runtime and discovery
- Question: Which Memory/Tape target should this configuration use?
- Answer: "2 (disable active durable Memory; preserve existing Memory files; keep Tape recording, tools, anchors/threads, session bridge, context, and identity)"
- Normalized intent: Disable automatic Memory context, Memory tools/commands, Memory skills/workflows, and Memory sync hooks without deleting stored files. Keep existing Tape behavior and capabilities active.
- Provenance: behavior-baseline interview decision 24.

### CFG-067 — Do not change Tape identity

- Status: current
- Force: MUST
- Scope: Tape project identity
- Question: Should Tape identity hashing/worktree isolation change now?
- Answer: "No change."
- Normalized intent: Keep current Tape identity, worktree, and non-Git behavior unchanged until a concrete collision or mixing problem exists.
- Provenance: behavior-baseline interview decision 25.

### CFG-068 — Clean-this-up authorizes only trivial cleanup

- Status: current
- Force: MUST
- Scope: cleanup authority
- Question: What does ordinary-language “clean this up” authorize?
- Answer: "Authorize trivial, behavior-preserving cleanup edits only."
- Normalized intent: The phrase authorizes trivial behavior-preserving cleanup. It does not authorize material behavior changes, nontrivial refactors, unrelated cleanup, ownership/API changes, or broader scope; ask before crossing that boundary.
- Provenance: behavior-baseline interview decision 26.

### CFG-069 — Keep runtime-repository knowledge on demand

- Status: current
- Force: MUST
- Scope: main-agent context and runtime-maintenance ownership
- Question: Should Pi-configuration knowledge remain in the main agent context or move to a repository skill?
- Answer: "Keep it out of the main agent context; put the useful information in a repository skill, not an agent skill."
- Normalized intent: Keep general operating, safety, approval, orchestration, coding, and verification rules in `AGENTS.md`. Put repository-specific runtime facts and maintenance procedure in the progressively disclosed `runtime-maintenance` skill. Only the skill name and neutral task-matching description remain always visible; automatic model selection is best-effort and `/skill:runtime-maintenance` is the deterministic manual trigger.
- Refines: CFG-036.
- Preserves: CFG-066 and CFG-067.
- Provenance: current session.
