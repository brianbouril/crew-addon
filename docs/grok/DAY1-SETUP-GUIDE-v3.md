# Day 1 Setup Guide: Autonomous Knowledge Factory POC (Zero-Local-Touch Edition)
**Platform:** Standalone Grok Bot App (No Slack or Local Terminal Required)  
**Git Workflow:** Pull requests into `main`. Conventional commit prefixes are the commit subject and the pull request title. Day 0's bootstrap commit (`1e34815`, `chore(knowledge): day 0 knowledge factory bootstrap`) is already on `main`. Further worker, curator, and observer changes use a branch and a pull request. Do not push to `main`.

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

Day 0 already ran. The scaffold is on `main` in commit `1e34815`. Do not run the old "commit directly on main" instruction again. Later changes follow `AGENTS.md`: a branch, a pull request, and these prefixes.

```text
Branch and pull request (every role):

- Game feature: branch `feat/<name>` (the spec name; CLAUDE.md rules 2 and 3). Title and commits: `feat(pack):`.
- Game fix: branch `fix/<name>`. Title and commits: `fix(pack):`.
- Knowledge, AGENTS.md, inbox state, docs/grok: branch `chore/knowledge-<topic>`. Title and commits: `chore(knowledge):`.
- Agent instruction files under knowledge/agents/: a separate branch `meta/agents-<topic>`. Title and commits: `meta(agents):`.
- Evaluation log: branch `docs/eval-<topic>`. Title and commits: `docs(eval):`.

Do not push to main. The curator opens the knowledge pull request. The worker opens the pack pull request. The observer opens the eval pull request.

Flag lines use only: timestamp, category, authority, source, issue_summary, evidence, suggested_fix.
inbox/.curator-state.json uses only: last_processed_commit_sha, last_processed_flag_line, last_run_timestamp.
The watermark moves when the curator pull request merges. The stored SHA is origin/main at the start of that run.
The value still in the file from day 0 is the pre-bootstrap main SHA 8c171ddf4463dbe61c6081707197cdc6ed39541e, with last_processed_flag_line 0, because no curator pass has processed those seed flags.
```

---

## Step 5: Activate the 24/7 Schedule & Start Week 1
1. **Schedule `@KnowledgeCurator`:** Tell `@KnowledgeCurator` in chat:
   > *"Set a recurring routine to run your knowledge intake check every 6 hours (or nightly at 2:00 AM). Always run your dirty check against `inbox/.curator-state.json` on origin/main first and exit immediately if nothing changed. Open a pull request when something changed. Do not push to main."*
2. **Start Building with `@AddonWorker`:** Ask `@AddonWorker` to open a `feat/<name>` or `fix/<name>` pull request for the next pack change, or drop a manually edited PNG into `approved-exports/` via the Grok Bot file uploader so `@KnowledgeCurator` can infer the edit on its next pull request.
