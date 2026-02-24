# Kova: A Conceptual Model for Spreetail

## The OpenAI Frontier Model (What They're Selling)

The OpenAI Frontier vision positions enterprise AI as a **vertical stack** where OpenAI controls every layer: interfaces at the top (ChatGPT Enterprise, Atlas, Business Applications), a pluggable agent layer, evaluation/optimization middleware, agent execution powered by their models, and a business context layer sitting atop your existing systems of record. Enterprise security wraps the whole thing.

The core thesis: **OpenAI becomes the operating system between your people and your data.** They own the interfaces, the agents, the execution engine, and the connective tissue to your business. You bring the data; they bring everything else.

## Why That Model Is Dangerous for Spreetail

That stack has a gravitational pull. Once OpenAI owns the business context layer and agent execution, they own the switching costs. Your institutional knowledge, your workflows, your data access patterns - they all become mediated by a single vendor's platform. The "Your Agents" box in their diagram is conspicuously small next to "OpenAI Agents."

## The Kova Model: What It Is Today

Kova inverts this relationship. Here's what Kova actually is architecturally:

```
┌─────────────────────────────────────────────────────────────────┐
│                    KOVA - Spreetail's Platform                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Interfaces                            │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │  Chat UI     │  │ Claude Code │  │  Generated Apps │  │  │
│  │  │  (Web SPA)   │  │  + Plugin   │  │  (Preview/Prod) │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Skills & Knowledge                      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐   │  │
│  │  │Spreeform │ │TanStack  │ │Data       │ │Excel/Image│   │  │
│  │  │Components│ │Patterns  │ │Platform   │ │Workflows  │   │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └───────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Agent Execution                          │  │
│  │                                                           │  │
│  │    Claude Agent SDK  ──→  Claude API                      │  │
│  │        │                                                  │  │
│  │    query() with Kova Plugin (skills, MCP servers),        │  │
│  │    containerized isolation, permission bypass              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                Business Context                           │  │
│  │                                                           │  │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐   │  │
│  │  │ Data Catalog MCP │  │ Metadata Search (MiniSearch) │   │  │
│  │  │ 8 discovery tools│  │ Domains, tables, columns     │   │  │
│  │  └──────────────────┘  └──────────────────────────────┘   │  │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐   │  │
│  │  │ dbt Manifest     │  │ YAML Metadata Sources        │   │  │
│  │  │ Auto-converted   │  │ Curated table descriptions   │   │  │
│  │  └──────────────────┘  └──────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Infrastructure & Isolation                    │  │
│  │                                                           │  │
│  │  Container-per-app (2GB/2CPU) │ Traefik routing           │  │
│  │  Encrypted secrets (AES-256)  │ Read-only data access     │  │
│  │  SQL injection prevention     │ No data leaves network    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
        │                    │                     │
   ┌────┴────┐        ┌─────┴──────┐       ┌──────┴──────┐
   │Starburst│        │  Internal  │       │   GitHub /  │
   │Galaxy / │        │    npm     │       │  Vercel /   │
   │ Trino   │        │  (ProGet)  │       │   Neon      │
   └─────────┘        └────────────┘       └─────────────┘
```

### What Makes This Different From OpenAI Frontier

| Dimension | OpenAI Frontier | Kova |
|-----------|----------------|------|
| **Who owns the stack** | OpenAI | Spreetail |
| **Where data lives** | OpenAI's cloud | Your network |
| **Agent intelligence** | OpenAI models only | Swappable (Claude today, anything tomorrow) |
| **Business context** | You configure their layer | You *built* the layer (data catalog, dbt, YAML metadata) |
| **Output** | Chat responses, agent actions | **Running applications** |
| **Skills/knowledge** | Generic + your fine-tuning | Your components, your stack, your patterns |
| **Lock-in vector** | Platform dependency | None - generated apps are standard TypeScript |

The critical difference: **Kova's output is code, not answers.** Every interaction produces a real, deployable, version-controlled application built on standard open-source tools (TanStack, React, Tailwind). If you deleted Kova tomorrow, the apps would still work.

## The Future Vision: Kova as Spreetail's Application Platform

Looking at what's already in the codebase (GitHub/Vercel/Neon integration fields in the schema, multi-model provider support, MCP server extensibility, workflow app routes), the trajectory is clear. Here's the conceptual model for where this goes:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│              SPREETAIL APPLICATION PLATFORM (Kova)                       │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                        Interfaces                                 │  │
│  │                                                                   │  │
│  │  App Builder     │ Claude Code  │  Generated Apps  │  Workflows  │  │
│  │  (Chat → Code)   │  + Plugin    │  (Internal SaaS) │  (Excel →  │  │
│  │                   │  (Dev tool)  │                  │   App)     │  │
│  │                                                                   │  │
│  │  Anyone at Spreetail can build. Developers get depth.             │  │
│  │  Business users get accessibility. Both get real apps.            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                   Organizational Knowledge                        │  │
│  │                                                                   │  │
│  │  Skills (extensible)        │  Templates (org-standard)           │  │
│  │  ├── Spreeform components   │  ├── TanStack Start starter         │  │
│  │  ├── Data platform access   │  ├── Dashboard template             │  │
│  │  ├── Excel workflows        │  ├── CRUD app template              │  │
│  │  ├── Image → App            │  └── Workflow app template          │  │
│  │  ├── [Future: Fulfillment]  │                                     │  │
│  │  ├── [Future: Marketplace]  │  Patterns & Standards               │  │
│  │  └── [Future: Your skill]   │  ├── Security (SQL injection)       │  │
│  │                              │  ├── Error handling                 │  │
│  │  The institutional memory    │  └── Spreetail conventions          │  │
│  │  that makes AI useful HERE   │                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Agent Execution                                │  │
│  │                                                                   │  │
│  │  Claude Agent SDK + Kova Plugin                                   │  │
│  │  ├── Model-agnostic (Claude, OpenAI, local models)                │  │
│  │  ├── MCP protocol (open standard for tool connectivity)           │  │
│  │  ├── Containerized (isolated, resource-bounded, secure)           │  │
│  │  └── Session-aware (multi-turn, resumable, versioned)             │  │
│  │                                                                   │  │
│  │  The intelligence layer is PLUGGABLE. The value is in             │  │
│  │  everything around it - the skills, the context, the tools.       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                   Business Context                                │  │
│  │                                                                   │  │
│  │  Data Catalog (MCP Server)     │  Connectors                      │  │
│  │  ├── 8 discovery tools         │  ├── Starburst Galaxy / Trino    │  │
│  │  ├── Metadata search           │  ├── [Future: Internal APIs]     │  │
│  │  ├── Domain organization       │  ├── [Future: ERP systems]       │  │
│  │  ├── dbt manifest import       │  └── [Future: Any MCP server]    │  │
│  │  └── Schema-aware generation   │                                  │  │
│  │                                                                   │  │
│  │  This is the moat. The curated understanding of YOUR data,        │  │
│  │  YOUR domains, YOUR business language.                            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │              Deployment & Governance                               │  │
│  │                                                                   │  │
│  │  Container isolation │ GitHub integration │ Vercel deployment      │  │
│  │  Neon DB branching   │ Encrypted secrets  │ Read-only data access  │  │
│  │  User permissions    │ Audit trails       │ Resource limits        │  │
│  │                                                                   │  │
│  │  Enterprise security and governance designed for                   │  │
│  │  your regulated work - not outsourced to a vendor.                │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
   Systems of Record    Internal Infra       Deployment Targets
   (Trino, dbt)        (ProGet, Git)        (Vercel, Containers)
```

## Three Key Strategic Insights

### 1. The Value Is in the Business Context Layer, Not the AI Model

OpenAI's model positions them as the indispensable execution engine. Kova's architecture tells a different story: the `data-catalog` MCP server, the `dbt-converter`, the YAML metadata files, the Spreeform component library, the security patterns for Spreetail's specific data platform - **this is institutional knowledge encoded as software**. The AI model is a commodity input. The context layer is the competitive advantage.

Today, Kova's data catalog has 8 tools for discovering and querying Spreetail's data. Each one encodes knowledge about domains (market_insights, inventory, fulfillment), tier hierarchies (MART > INT > STG > RAW), connection patterns, and security requirements. An employee asking "show me revenue by marketplace" gets a working app because Kova knows which table to query, how to connect safely, and what the Spreetail-approved UI components look like.

### 2. Kova Is a Capability Multiplier, Not a Chatbot

The OpenAI Frontier model is fundamentally about **asking questions and getting answers**. Kova is fundamentally about **describing intent and getting working software**. The difference is profound:

- A chatbot answers "What was revenue last quarter?"
- Kova builds a revenue dashboard that everyone can use, that updates in real-time, that follows your design system, deployed on your infrastructure

Every Kova session produces a **persistent artifact** - a TanStack Start application with Git history, deployable to Vercel, backed by real data. The skills system (`init-project`, `spreeform`, `data-platform`, `xlsx`) means these aren't generic apps - they're **Spreetail apps** that follow Spreetail patterns from the first line of code.

### 3. The Skills System Is the Flywheel

The most architecturally significant feature in the codebase is the skills system. Each skill (a SKILL.md with references) encodes domain expertise that the agent uses autonomously. Today there are 7 skills. But the system is designed to grow:

- **Today**: Data platform, Spreeform, TanStack, Excel, Image-to-app
- **Near-term**: Fulfillment workflows, marketplace integrations, inventory dashboards
- **Long-term**: Every team at Spreetail contributes skills for their domain

This creates a flywheel: more skills make Kova more useful, which drives adoption, which surfaces more patterns worth encoding as skills. OpenAI can't build this for you - it requires Spreetail-specific knowledge that only exists inside Spreetail.

## The Headline

**OpenAI Frontier says: "We'll be your AI operating system."**

**Kova says: "You already have one. It speaks your language, knows your data, builds your apps, and runs on your infrastructure."**

The risk of the OpenAI model is dependency. The promise of the Kova model is ownership. Spreetail keeps its business context, its institutional knowledge, its data access patterns, and its deployment infrastructure under its own control - while still leveraging the best AI models available as a pluggable commodity.

Kova isn't competing with OpenAI Frontier. It's making Frontier's value proposition unnecessary for the use cases that matter most: turning Spreetail's data into Spreetail's applications, built by anyone, governed by you.
