<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img alt="Ferrum Docs" src="docs/assets/banner-light.svg" width="100%">
</picture>

[![CI](https://github.com/CBFerrum/ferrum-app-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/CBFerrum/ferrum-app-docs/actions/workflows/ci.yml) ![Version](https://img.shields.io/badge/version-0.5.0-2f5bea?style=flat-square) ![Ferrum](https://img.shields.io/badge/Ferrum-%3E%3D0.3.2%2C%20%3C0.4-2f5bea?style=flat-square) ![License](https://img.shields.io/badge/license-AGPL--3.0-3b82f6?style=flat-square) ![Rust](https://img.shields.io/badge/Rust-native%20app-b7410e?style=flat-square&logo=rust&logoColor=white) ![Interface](https://img.shields.io/badge/interface-React%20%2B%20Vite-0ea5e9?style=flat-square&logo=react&logoColor=white) ![MCP](https://img.shields.io/badge/AI%20agents-MCP-8b5cf6?style=flat-square)

**A native app for [Ferrum](https://github.com/CBFerrum/Ferrum), the open-source, AI-first business platform.**

[Overview](#overview) · [Highlights](#highlights) · [Screenshots](#screenshots) · [How it works](#how-it-works) · [Data model](#data-model) · [Install](#install) · [Develop](#develop) · [Changelog](#changelog)

</div>

---

## Overview

Ferrum Docs is the home for documents written together: recent, shared and starred documents,
each showing who is in it now; templates to start from; search by what documents say; and
comments and suggestions on the text. Documents are Drive's live documents, so sharing, versions,
trash and guest links are Drive's, and AI agents draft and add to them over Ferrum's MCP server.


| At a glance | |
|---|---|
| 📦 Version | `0.5.0` |
| 🧱 Platform | Ferrum `>=0.3.2, <0.4` |
| 🔗 Requires | drive `>=0.7` |
| 🖥️ Interface | its own, at `/docs/` |
| 🗃️ Records | 1 entities in 1 package |
| 👥 Roles | 2: Docs User, Docs Manager |
| 📊 Reports | 0 |
| 🧪 Tests | 3 Rust tests, 3 interface test files |


## Highlights

<table>
<tr>
<td width="50%" valign="top">

### 👥 Written together
Everyone's cursors and names, saved as they type.

</td>
<td width="50%" valign="top">

### 🧩 Templates
Meeting notes, project brief, weekly update, decision record, PRD and one-on-one, plus your own.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔎 Search by content
Find documents by what they say, with the words shown in context.

</td>
<td width="50%" valign="top">

### 💬 Comments and suggestions
Discuss and propose changes on the text itself.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🤖 AI agents
Agents create, read and append in Markdown over MCP; what they add appears live.

</td>
<td width="50%" valign="top">

### 🗂️ Drive underneath
Sharing, versions, trash and guest links come from Drive.

</td>
</tr>
</table>

## Screenshots

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/docs-dark.webp">
  <img alt="Docs: templates to start from and recent documents." src="docs/assets/docs-light.webp" width="100%">
</picture>

<p align="center"><sub>Docs: templates to start from and recent documents.</sub></p>

> [!TIP]
> The screenshots follow your GitHub theme: switch between light and dark to see both.

## How it works

### Live editing

```mermaid
sequenceDiagram
    autonumber
    actor A as Asha
    actor B as Ravi
    participant D as Live document (Drive)
    participant AI as AI agent (MCP)
    A->>D: types
    D-->>B: Asha's change and cursor, at once
    B->>D: suggests an edit
    AI->>D: append_to_document (Markdown)
    D-->>A: the agent's text appears
    D-->>B: the agent's text appears
```

### Inside Ferrum

```mermaid
flowchart LR
    subgraph Browser
        UI["Its interface<br/><small>/docs/</small>"]
        BAR["Ferrum bar<br/><small>launcher · search · bell</small>"]
    end
    subgraph Server["Ferrum server"]
        API["REST · MCP · live"]
        K["Kernel<br/><small>permissions · row-level security · audit</small>"]
        APP["Docs<br/><small>1 entities · 2 roles</small>"]
        OB[("Outbox")]
    end
    DB[("PostgreSQL")]
    UI --> API --> K --> DB
    BAR --> API
    K <--> APP
    K --> OB --> EV["Notifications · webhooks<br/>automations"]
    APP -. requires .-> D0["drive >=0.7"]
    classDef app fill:#2f5bea,color:#fff,stroke:#2f5bea
    class APP app
```

Everything Docs adds is ordinary Ferrum metadata and Rust: its records get lists, forms,
search, permissions, an audit trail, exports and the REST and MCP APIs for free, so AI agents work
with them under the same rules as people.

### What it adds to Ferrum

| Where | What |
|---|---|
| 🚀 Launcher | **Docs** at `/docs/` |
| ➕ Create menu | Document |

## Data model

The main records and how they connect (1 entities in all; `packages/` has every field).

```mermaid
erDiagram
    DocsTemplate {
        string name PK
        string category
    }
```

### Roles

| Role | What it is for | Entities |
|---|---|---|
| **Docs User** | Writes documents in Docs: a Drive space of their own (as a Drive User has), the documents shared with them, and the workspace's templates to start from. What they may do with each document is Drive's sharing. | 3 |
| **Docs Manager** | Keeps the workspace's document templates, and makes new ones from documents. | 1 |

## Install

Workspace administrators install it from **Apps** (`/store/`) in Ferrum; it ships in the
official Ferrum server image. It needs **drive** `>=0.7` installed first. Self-hosters building their own image enable the
`docs` feature of the server. Everything it adds is also available to AI agents over
Ferrum's MCP server, within each person's permissions.

## Develop

Clone it next to the platform:

```text
work/
├── ferrum/            https://github.com/CBFerrum/Ferrum (with Ferrum-Frontend cloned into ferrum/web)
└── ferrum-app-docs/
```

Point the platform dependencies at your checkout (this file is git-ignored):

```toml
# .cargo/config.toml
[patch."https://github.com/CBFerrum/Ferrum"]
ferrum-apps = { path = "../ferrum/crates/apps" }
ferrum-domain = { path = "../ferrum/crates/domain" }
ferrum-kernel = { path = "../ferrum/crates/kernel" }
ferrum-meta = { path = "../ferrum/crates/meta" }
```

The tests need PostgreSQL with an ordinary (non-superuser) role, so row-level security
applies:

```bash
createuser ferrum --pwprompt && createdb -O ferrum ferrum_docs_test
cargo test
```

`FERRUM_DOCS_TEST_DATABASE_URL` overrides the database URL.


The interface lives in `ui/` and builds with Ferrum-Frontend's packages:

```bash
cd ui
npm run build      # ui/dist, checked against the size budget
npm test
```

With a development server started with `FERRUM_DEV_UI=1`, `ferrum-app dev --ui` serves the pages
from Vite behind the real bar and session, with hot reload.


### Project layout

```text
app.yaml      the manifest: id, version, requirements, what it adds to Ferrum
packages/     metadata: entities, roles, reports, workflows, print formats
src/          the app's logic in Rust: hooks, actions, endpoints, upkeep jobs
ui/           its own interface (React + Vite), built into ui/dist
tests/        integration tests against a real PostgreSQL
CHANGELOG.md  what changed in each version
```


It builds on [ferrum-app-drive](https://github.com/CBFerrum/ferrum-app-drive).

## Changelog

| Version | Highlights |
|---|---|
| **0.5.0** | Suggestions: a mode for editors, Editing or Suggesting. While suggesting, typing proposes: `insertion` and `deletion` marks carry who, when and an … |
| **0.4.0** | Comments on the text: select words and press Comment (Ctrl+Alt+M), with comment access only too. The words are marked and the thread sits beside … |
| **0.3.0** | Images in documents: from the toolbar, pasted or dropped in, kept by the document in Drive and shown from there, with a description for screen … |
| **0.2.1** | The family's navigation (Drive, Sheets, Slides, PDF, Docs) has each entry's icon and colour, and each document in the lists has the document icon. |

Every version is in [CHANGELOG.md](CHANGELOG.md).

## License

[AGPL-3.0-only](LICENSE), like the platform. Part of [Ferrum](https://github.com/CBFerrum/Ferrum) ·
[Report an issue](https://github.com/CBFerrum/ferrum-app-docs/issues)
