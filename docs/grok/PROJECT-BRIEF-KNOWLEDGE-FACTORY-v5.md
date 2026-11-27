# Project Brief: Autonomous Knowledge Factory
**A Vendor-Agnostic Architecture for Self-Maintaining AI Standards**

---

### 1. Executive Summary
Organizations rarely fail with AI due to weak models—they fail because institutional knowledge (brand strategy, visual identity, design systems, and engineering standards) is scattered across Slack, Notion, Figma, and individual heads.

This initiative prototypes an **Autonomous Knowledge Factory**: a multi-agent system that continuously ingests scattered updates, reconciles conflicting feedback, and maintains version-controlled Markdown skills (`SKILL.md`) that **any AI runtime**—including our organization's existing **Claude** ecosystem—can reliably consume.

---

### 2. Core Objectives & Goal Outcomes
The primary objective is to determine whether a **no-code/hybrid multi-agent setup** or a **deterministic code-controlled pipeline** allows our team to move fastest when building an org-wide, 24/7 knowledge intake system.

#### Target Outcomes
1. **Establish a Vendor-Agnostic Knowledge Layer:** Store all standards, visual references, and agent role definitions in standard Git-native Markdown and JSON (`AGENTS.md` + `knowledge/`) so the knowledge base is 100% portable across Claude, Grok, Cursor, or custom code pipelines.
2. **Validate 24/7 Continuous Knowledge Intake:** Prove that an autonomous "Curator" agent can wake up on a schedule, inspect new feedback and diffs using a lightweight state watermark, and open clean pull requests updating core guidance. The worker, the curator, and the observer all use branches and pull requests into `main`. Nobody pushes to `main`. Pack work uses `feat/<name>` or `fix/<name>` with `feat(pack):` / `fix(pack):`. Knowledge uses `chore/knowledge-<topic>` with `chore(knowledge):`. Agent instructions use `meta/agents-<topic>` with `meta(agents):`. Evaluation notes use `docs/eval-<topic>` with `docs(eval):`. Game branch rules in the Crew repo stay `CLAUDE.md` rules 2 and 3.
3. **Test Multi-Source Governance & Conflict Resolution:** Enforce strict authority hierarchies so casual workspace chatter cannot overwrite official brand or engineering standards.
4. **Evaluate Controlled Self-Tuning & Observability:** Use a passive observer agent (`@FrictionObserver`) to log execution friction automatically, and test PR-gated self-tuning (`knowledge/agents/*.md`) to reduce ongoing prompt maintenance without risking silent drift.
5. **Deliver an Architecture Decision Scorecard:** Produce concrete data on setup speed, idle token efficiency, multimodal accuracy, and human-in-the-loop governance to guide our team's production engineering roadmap.

---

### 3. Reference Workflow & Feedback Loops

```mermaid
flowchart TB
    %% Styling
    classDef repo fill:#1e293b,stroke:#475569,color:#f8fafc,stroke-width:2px
    classDef agent fill:#0f172a,stroke:#38bdf8,color:#f8fafc,stroke-width:2px
    classDef inbox fill:#27272a,stroke:#f59e0b,color:#fef3c7,stroke-width:1.5px
    classDef human fill:#14532d,stroke:#22c55e,color:#f0fdf4,stroke-width:2px
    classDef observer fill:#3b0764,stroke:#c084fc,color:#faf5ff,stroke-width:1.5px

    subgraph GIT ["Git Repository (Vendor-Agnostic Knowledge & State Layer)"]
        direction TB
        ROOT["<b>AGENTS.md</b> (Universal Entrypoint)<br/>+ thin runtime pointers (CLAUDE.md, etc.)"]:::repo
        KB["<b>knowledge/</b><br/>• skills/ (Procedural workflows)<br/>• domain/ (Brand, visual identity & specs)<br/>• data-access/ (Live doc & DAM pointers)<br/>• assets/examples/ (Do/Don't PNGs)"]:::repo
        AGENTS_MD["<b>knowledge/agents/</b><br/>• worker-agent.md<br/>• curator-agent.md<br/>• friction-observer.md"]:::repo
        ARTIFACTS["<b>Production Artifacts</b><br/>• Code / Schemas (behavior_packs/)<br/>• Visuals / Copy (resource_packs/)"]:::repo
        EVAL["<b>EVALUATION-NOTES.md</b><br/>Automated friction & failure log"]:::observer
    end

    subgraph INBOX ["Signal & Feedback Intake Layer"]
        direction LR
        FLAGS["<b>inbox/knowledge-flags.jsonl</b><br/>Structured gap & error logs"]:::inbox
        CHAT["<b>inbox/player-feedback.md</b><br/>Workspace threads (Slack/Notion proxy)"]:::inbox
        EXPORTS["<b>approved-exports/</b><br/>Human-edited v2 exports (Figma proxy)"]:::inbox
        DOCS["<b>External Sources</b><br/>Official docs, wikis & changelogs"]:::inbox
        STATE["<b>inbox/.curator-state.json</b><br/>Processed commit & line watermark"]:::inbox
    end

    subgraph RUNTIME ["Pluggable Agent Runtime (Grok Bot POC / Claude / LangGraph)"]
        direction LR
        WORKER["<b>Worker Agent</b><br/>Task Execution & Flagging"]:::agent
        CURATOR["<b>Curator Agent</b><br/>24/7 Intake + Dirty Check"]:::agent
        OBSERVER["<b>Friction Observer</b><br/>Passive Trace & PR Auditor"]:::observer
    end

    HUMAN(("<b>Human Gatekeeper</b><br/>Brand Director / Team Lead")):::human

    %% Loop 1: Execution & Flagging
    ROOT & AGENTS_MD -. "1. Loads role & rules" .-> WORKER
    KB -- "2. Consults standards" --> WORKER
    WORKER -- "3. Produces deliverables" --> ARTIFACTS
    WORKER -- "4. Appends missing/broken rules" --> FLAGS
    HUMAN -- "Manual polish (silent edits)" --> EXPORTS

    %% Loop 2: 24/7 Knowledge Intake & Curation
    AGENTS_MD -. "5. Loads curator role" .-> CURATOR
    STATE <--> CURATOR
    FLAGS & CHAT & EXPORTS & DOCS -- "6. Ingests & ranks authority" --> CURATOR
    CURATOR -- "7. Opens Knowledge PR" --> PR_KB["<b>PR #1: Knowledge Update</b><br/>Rule diffs + Authority escalations"]:::inbox
    PR_KB --> HUMAN
    HUMAN -- "Reviews & merges" --> KB

    %% Loop 3: Controlled Self-Tuning
    PR_KB -. "8. Meta-tuning review on misses" .-> CURATOR
    CURATOR -- "9. Opens Self-Tuning PR" --> PR_SELF["<b>PR #2: Agent Role Update</b><br/>Refines knowledge/agents/*.md"]:::inbox
    PR_SELF --> HUMAN
    HUMAN -- "Approves (prevents drift)" --> AGENTS_MD

    %% Loop 4: Automated Friction Auditing
    WORKER & CURATOR & PR_KB -. "10. Monitors stalls & overrides" .-> OBSERVER
    OBSERVER -- "11. Appends timestamped notes" --> EVAL
```

---

### 4. Low-Risk Sandbox Strategy
To move immediately without waiting on enterprise IT approvals or risking live brand assets, the POC uses an active **Minecraft Bedrock Add-On repository** as a structural proxy for an enterprise **Brand Strategy & Visual Identity System**:

| Enterprise Knowledge Challenge | POC Sandbox Equivalent | What It Proves for Work |
| :--- | :--- | :--- |
| **Engineering & Design Rules** | Behavior Pack code & schemas (`behavior_packs/`) | Deterministic rule enforcement and automated validation. |
| **Brand & Visual Identity** | Resource Pack textures, UI, & lore (`resource_packs/`) | Multimodal grounding using color palettes, tone rules, and annotated "Do/Don't" visual examples. |
| **Conflicting Slack Feedback** | Simulated player threads (`inbox/player-feedback.md`) | Authority weighting (`Brand Director > Official Docs > Casual Feedback`) and conflict escalation. |
| **Silent Figma / Slide Edits** | Human-polished exports (`approved-exports/`) | Inferring unstated design preferences by diffing AI v1 drafts against human-edited v2 exports. |
| **Ongoing Prompt Maintenance** | Git-stored agent roles (`knowledge/agents/*.md`) | PR-gated self-tuning (`PR #2`) that improves accuracy over time without opaque UI edits or prompt drift. |

---

### 5. Two-Week Execution Plan & Deliverables
* **Week 1 — Pure No-Code Multi-Agent Loop:** Deploy `@AddonWorker`, `@KnowledgeCurator`, and `@FrictionObserver` against the vendor-neutral repository (`AGENTS.md` + `knowledge/`).
* **Week 2 — Hybrid Deterministic Guardrails:** Introduce strict JSON schemas, `.curator-state.json` watermarks to minimize idle token burn, automated validation checks before PR creation, and PR-gated self-tuning.
* **Final Deliverable (Team Readout):** A portable reference repository demonstrating automated knowledge PRs alongside an **Architecture Decision Scorecard** defining what to keep no-code versus what to build in deterministic code for our team's production rollout.
