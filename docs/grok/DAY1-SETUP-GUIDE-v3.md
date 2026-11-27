# Day 1 Setup Guide: Autonomous Knowledge Factory POC (Zero-Local-Touch Edition)
**Platform:** Standalone Grok Bot App (No Slack or Local Terminal Required)  
**Git Workflow:** Direct-to-`main` with Conventional Commit Prefixes (Free GitHub Account Friendly)

---

## Step 1: License & Model Hygiene (Before Dec 1)
1. **Purchase License:** Subscribe to **The X Subscription (Super tier — $100/month)** before December 1 (and optionally allocate remaining stipend toward prepaid API/Cursor top-ups if desired). Save your itemized receipt.
2. **Prevent Extra API Charges in Cursor:** Open Cursor settings and ensure your default model is set to **Grok models** (included in your Super weekly usage pool) rather than third-party models (which bill separately).

---

## Step 2: Create Your 3 Bots in the Grok Bot App
Open the **Grok Bot desktop or mobile app** and create three separate bots with minimal, one-sentence UI system prompts (all detailed rules will live in Git so they remain version-controlled and vendor-agnostic):

1. **`@AddonWorker`** *(On-Demand Execution & Gap Flagging)*
   * **UI System Prompt:**
     > `At the start of every task, read AGENTS.md and knowledge/agents/worker-agent.md from the connected GitHub repo and follow them strictly.`
2. **`@KnowledgeCurator`** *(24/7 Intake, Reconciliation & Self-Tuning)*
   * **UI System Prompt:**
     > `At the start of every task or scheduled run, read AGENTS.md and knowledge/agents/curator-agent.md from the connected GitHub repo and follow them strictly.`
3. **`@FrictionObserver`** *(Automated Evaluation & Friction Logging)*
   * **UI System Prompt:**
     > `Monitor this group chat and recent Git commits according to AGENTS.md and knowledge/agents/friction-observer.md, logging friction and reverts to EVALUATION-NOTES.md.`

---

## Step 3: Connect GitHub & Create Your Group Chat
1. **Connect GitHub:** In Grok Bot's **Connectors / Plugins** settings, authorize GitHub and grant read/write access to your existing Minecraft add-on repository.
2. **Create a Group Chat:** Inside the Grok Bot app, start a new group chat and add **`@AddonWorker`**, **`@KnowledgeCurator`**, and **`@FrictionObserver`**. *(No Slack workspace needed.)*

---

## Step 4: Run the "Zero-Touch" Day 0 Bootstrap
Because you aren't editing files locally, attach (or paste the text of) **`POC-KNOWLEDGE-FACTORY-v5.md`** and **`PROJECT-BRIEF-KNOWLEDGE-FACTORY-v5.md`** directly into your Grok Bot group chat along with this prompt:

```text
@KnowledgeCurator Run a complete Day 0 Bootstrap pass on our connected repository right now. I am not making any local edits—you are handling 100% of the initial folder scaffold, file creation, and commits directly on `main` using strict conventional commit prefixes.

Execute these steps in order:

1. Save Attached Reference Docs & Inspect Repo History:
   - Save the attached `POC-KNOWLEDGE-FACTORY-v5.md` and `PROJECT-BRIEF-KNOWLEDGE-FACTORY-v5.md` into the root of the repository (or a `docs/` folder).
   - Read `CLAUDE.md` (if present) and inspect the last 15 Git commits/diffs across `behavior_packs/` and `resource_packs/` to understand our current add-on structure.

2. Initialize the Vendor-Neutral Knowledge Layer:
   - Create `AGENTS.md` at the repo root defining the shared Knowledge Factory rules, authority hierarchy (`art-director` > `official-docs` > `contributor` > `player-feedback`), and direct-to-main conventional commit prefixes:
     * Worker code/asset changes: `feat(pack):` or `fix(pack):`
     * Curator knowledge updates: `chore(knowledge):`
     * Agent instruction self-tuning: `meta(agents):`
     * Observer evaluation logs: `docs(eval):`
   - If `CLAUDE.md` exists, prepend a short "Shared Knowledge Base" pointer instructing Claude to read and follow `AGENTS.md` and `knowledge/` before making changes.

3. Populate Initial Knowledge, Proxy Folders & Agent Definitions:
   - Extract patterns, schemas, API versions, and styling conventions from our commit history into starter files inside `knowledge/skills/`, `knowledge/domain/` (including `visual-identity.md`), and `knowledge/data-access/`.
   - Create `knowledge/assets/examples/.gitkeep` and `approved-exports/.gitkeep` so the visual grounding and silent-edit proxy folders exist in Git.
   - Create `inbox/player-feedback.md` seeded with 2–3 realistic conflicting player feedback notes (one low-authority suggestion that conflicts with our visual identity rules) so we can test authority governance.
   - Create the three vendor-agnostic agent instruction files in `knowledge/agents/`:
     * `worker-agent.md`
     * `curator-agent.md` (configured for direct-to-main commits with `chore(knowledge):` and `meta(agents):` prefixes, plus a diff-based dirty check using `inbox/.curator-state.json`)
     * `friction-observer.md`

4. Initialize Tracking & State Files:
   - Create `inbox/knowledge-flags.jsonl` (empty or seeded with any obvious gaps found during bootstrap).
   - Create `inbox/.curator-state.json` initialized with the current HEAD commit SHA and `"last_processed_flag_line": 0`.
   - Create `EVALUATION-NOTES.md` for `@FrictionObserver` to log friction, reverts, and misses.

5. Commit & Report:
   - Commit all new and updated files directly to `main` with the commit message `chore(knowledge): day 0 knowledge factory bootstrap`.
   - Post a concise summary in this chat listing every file created and any open questions or conflicts you spotted in the existing repo.
```

---

## Step 5: Activate the 24/7 Schedule & Start Week 1
1. **Schedule `@KnowledgeCurator`:** Once the Day 0 commit lands on `main`, tell `@KnowledgeCurator` in chat:
   > *"Set a recurring routine to run your knowledge intake check every 6 hours (or nightly at 2:00 AM). Always run your dirty check against `inbox/.curator-state.json` first and exit immediately if nothing changed."*
2. **Start Building with `@AddonWorker`:** Ask `@AddonWorker` to build your next Minecraft add-on feature or texture, or drop a manually edited PNG into `approved-exports/` via the Grok Bot file uploader to watch `@KnowledgeCurator` infer your visual edits on its next cycle.
