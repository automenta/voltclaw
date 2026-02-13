# VoltClaw ⚡

**VoltClaw** is an open, self-evolving autonomous agent platform.  
Born from the spirit of exploration, it combines elegant architecture with unbounded recursive potential — a quiet invitation to build intelligence that improves itself, forever.

🌌 **One agent. Any task. Endless depth.**

### 🧭 Core Philosophy

VoltClaw exists to lower the friction between thought and action.  
No walled gardens. No forced specializations.  
Just a clean, modular core that lets the model decompose, delegate, act, reflect — and call *itself* when the problem demands it.

We believe real autonomy emerges from:

- **recursion**, not rigid multi-agent hierarchies  
- **minimalism**, not feature bloat  
- **open-ended self-improvement**, not one-shot prompting

### ✨ Architecture Highlights

- **VoltAgent foundation** — battle-tested TypeScript primitives for tools, memory, guardrails, workflows, observability  
- **Nostr communication layer** (optional today) — encrypted, decentralized, censorship-resistant DMs as the native channel  
- **Single-file bootstrap** possible — the entire recursive heart fits in ~400 LOC today, grows without rewrite  
- **Dynamic skills ecosystem** — drop `.ts`/`.js` files into `~/.clawvolt/skills/`, instantly available  
- **Recursive delegation** — the `delegate` tool spawns child instances of *the same agent* via self-messages, with depth & budget caps

Communication, persistence, compute — all swappable.  
Nostr is elegant today; tomorrow it might be Matrix, XMPP, WebSocket hub, local Unix socket, or nothing at all.  
The design anticipates change.

### 🔄 Recursive Power — Inspired by `ypi`

`ypi` (https://github.com/rawwerks/ypi) — created by rawwerks — is a beautiful proof.

Built on the [Pi](https://github.com/badlogic/pi-mono) coding agent, `ypi` adds one function (`rlm_query`) and a prompt that teaches the agent to call *itself* recursively.

Each child runs in an isolated workspace (via `jj`), decomposes subtasks, edits files safely, returns patches — and can recurse further.  
Guardrails (max depth, call limits, budget, timeouts) keep it sane.

The result: an agent that solves problems far larger than its context window by repeatedly breaking them apart and delegating to identical copies of itself.

VoltClaw ports exactly this insight to a general-purpose agent:

- `delegate(task, summary?)` → self-DM to own npub  
- Child receives elevated `depth` tag, optional restricted toolset  
- Parent collects `subtask_result` messages, synthesizes  
- Same guardrails: depth, calls, rough USD budget tracking  
- Same elegance: every level is the same code, same prompt, same soul

This is not multi-agent theater.  
It is **self-similarity** — the mathematical beauty of fractals applied to cognition.

### 🚀 Usability — General-Purpose from Day One

```text
Send one DM:  
"Plan and launch a micro SaaS landing page for AI-generated bedtime stories"

VoltClaw:  
• delegates research → market/competitors  
• delegates copy → tone & structure  
• delegates design → color palette & layout sketch  
• delegates code → HTML/CSS/JS stub  
• synthesizes → delivers full plan + artifacts
```

No predefined roles. No YAML workflows.  
Just natural language + recursion + tools.

### 🔮 The Open Frontier

We are still in the early hours of agentic intelligence.

VoltClaw is intentionally unfinished:

- Plug in local models (Ollama), frontier APIs, mixtures-of-experts  
- Add voice I/O, vision, long-term episodic memory  
- Bridge to VoltAgent full workflows / evals / tracing dashboards  
- Grow skills: browser, shell, git, email, calendar, code editor, physics sim, MIDI sequencer…  
- Evolve communication: Nostr → anything bidirectional & encrypted  
- Self-modify: let the agent read/write its own prompt, tools, guardrails (with human veto)

This is not a product.  
It is a **starting point** — a minimal, recursive seed for the community to cultivate.

### 📜 Mission

> Build agents that think in loops, not lists.  
> Let recursion be the default, not the exception.  
> Keep the core so small it can live on a single screen — then never stop growing it.  
>  
> Intelligence wants to understand itself.  
> Give it the mirror.

⚡🐾 **VoltClaw** — the recursive frontier is open.  
Come explore. Come improve. Come recurse.

Star it. Fork it. Break it. Make it better.  
The only rule is: keep calling yourself.

[GitHub →](#) (link when repo exists)  
[Community sketches & skills →](#) (future ClawHub equivalent)  

