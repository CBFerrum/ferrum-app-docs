<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img alt="Ferrum Docs: documents your team writes together, on your own server" src="docs/assets/banner-light.svg" width="100%">
</picture>

<br>

[![Version](https://img.shields.io/badge/version-0.8.1-2f5bea?style=flat-square)](CHANGELOG.md)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Ferrum platform](https://img.shields.io/badge/runs%20on-Ferrum-2f5bea?style=flat-square)](https://github.com/CBFerrum/Ferrum)
[![CI](https://github.com/CBFerrum/ferrum-app-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/CBFerrum/ferrum-app-docs/actions/workflows/ci.yml)
![Rust](https://img.shields.io/badge/Rust-server-b7410e?style=flat-square&logo=rust)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-data-336791?style=flat-square&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React%20%2B%20TypeScript-interface-0ea5e9?style=flat-square&logo=react&logoColor=white)
![Tests](https://img.shields.io/badge/tests-3%20Rust%20%C2%B7%20191%20interface-16a34a?style=flat-square)

### A word processor your team writes in together, live, on your own server.

Ferrum Docs is for teams that want what Google Docs or Word on the web give them (several people typing at once, comments, suggestions, version history) without handing their writing to someone else. Documents are files in Ferrum Drive, so sharing, versions, trash and links are Drive's, and AI agents can draft and add to them.

[💡 Why](#-why-ferrum-docs) · [📸 Screenshots](#-screenshots) · [✨ Features](#-features) · [📊 Compare](#-how-it-compares) · [📍 Roadmap](#-roadmap) · [🚀 Install](#-install) · [🔧 Develop](#-develop)

</div>

## 💡 Why Ferrum Docs

- 👥 **Written together, live.** Everyone's cursor and name show as they type, and changes are saved as they go. Comments sit beside the text and suggestions can be accepted or rejected one by one.
- 🏠 **Self-hosted, open source, AGPL-3.0.** Your writing stays on your servers, with no per-seat licence and no data leaving.
- 📂 **Documents are Drive files.** Sharing with people or roles, public links with passwords and end dates, versions, trash, quotas and search all come from Ferrum Drive, so there is one set of rules for every file.
- 🤖 **Built for people and AI agents.** An agent can start a document from a template, read one as Markdown, text or HTML and append to one over Ferrum's MCP server, under the same permissions as a person, while everyone with it open sees the change at once.
- 📄 **A real word processor.** Fonts, sizes, colours, tables, pictures, page setup, headers and footers, footnotes, a table of contents, find and replace, Word import and export, and a `/` menu for blocks.
- 🔎 **Search by what documents say.** Find a document by its words, from Docs or from the bar's search anywhere in Ferrum.
- 🌍 **Right to left and many languages.** Each paragraph reads in the direction of its own words, and the interface comes in English, Arabic and Hindi.

## 🎯 At a glance

| | |
|---|---|
| 📦 **Version** | 0.8.1 |
| 🖥️ **Kind** | Its own interface at `/docs/`, with the editor at `/docs/d/{file}` |
| ➕ **What it adds** | 1 entity (Document Template), 2 roles, 6 starting templates, 1 launcher app, a Create menu entry, an assistant that knows its pages |
| 🧱 **Depends on** | Drive `>=0.7`. Docs is in Drive's Workspace family and installs with it |
| 🤝 **Works with** | Drive (sharing, versions, trash, search), Sheets, Slides and PDF in the same family, any app that uses Drive's pick and share intents |
| 🌍 **Languages** | English, Arabic, Hindi |
| 🧪 **Tests** | 3 Rust test functions and 191 interface tests, counted from the source |
| 📄 **Licence** | AGPL-3.0-only |

## 📸 Screenshots

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-home-dark.webp"><img alt="Docs — home" src="docs/assets/screens/docs-home-light.webp" width="100%"></picture>
<p align="center"><b>🏠 Docs — home</b><br><sub>Start a document from a template, or open one you worked on recently.</sub></p>

<table>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-document-dark.webp"><img alt="Docs — a document in the page view" src="docs/assets/screens/docs-document-light.webp"></picture>
<p><b>📄 Docs — a document in the page view</b><br><sub>A page with a header, contents, footnotes and a toolbar for fonts, size, colour, spacing, lists and tables.</sub></p>
</td>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-menu-font-dark.webp"><img alt="Docs — the font menu" src="docs/assets/screens/docs-menu-font-light.webp"></picture>
<p><b>📄 Docs — the font menu</b><br><sub>Choose a font for the selected text.</sub></p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-menu-size-dark.webp"><img alt="Docs — the font size menu" src="docs/assets/screens/docs-menu-size-light.webp"></picture>
<p><b>📄 Docs — the font size menu</b><br><sub>Pick a size from the list or type one.</sub></p>
</td>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-menu-colour-dark.webp"><img alt="Docs — the text colour menu" src="docs/assets/screens/docs-menu-colour-light.webp"></picture>
<p><b>📄 Docs — the text colour menu</b><br><sub>Choose a colour for the text.</sub></p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-menu-spacing-dark.webp"><img alt="Docs — line and paragraph spacing" src="docs/assets/screens/docs-menu-spacing-light.webp"></picture>
<p><b>📄 Docs — line and paragraph spacing</b><br><sub>Set the space between lines and around paragraphs.</sub></p>
</td>
<td width="50%"></td>
</tr>
</table>

<details>
<summary>📸 More screens: tables, page setup, find and replace, links</summary>

<table>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-menu-table-dark.webp"><img alt="Docs — insert a table" src="docs/assets/screens/docs-menu-table-light.webp"></picture>
<p><b>📄 Docs — insert a table</b><br><sub>Drag over the grid to choose how many rows and columns.</sub></p>
</td>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-table-editing-dark.webp"><img alt="Docs — editing a table" src="docs/assets/screens/docs-table-editing-light.webp"></picture>
<p><b>📄 Docs — editing a table</b><br><sub>Click in a table and its bar appears: add or remove rows and columns, merge cells, colour them.</sub></p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-page-setup-dark.webp"><img alt="Docs — page setup" src="docs/assets/screens/docs-page-setup-light.webp"></picture>
<p><b>📄 Docs — page setup</b><br><sub>Page size, orientation, margins, header and footer.</sub></p>
</td>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-find-replace-dark.webp"><img alt="Docs — find and replace" src="docs/assets/screens/docs-find-replace-light.webp"></picture>
<p><b>📄 Docs — find and replace</b><br><sub>Find a word, step through the matches and replace them one by one or all at once.</sub></p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-shortcut-list-dark.webp"><img alt="Docs — keyboard shortcuts" src="docs/assets/screens/docs-shortcut-list-light.webp"></picture>
<p><b>📄 Docs — keyboard shortcuts</b><br><sub>The keys for formatting, moving and editing.</sub></p>
</td>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-link-panel-dark.webp"><img alt="Docs — the link panel" src="docs/assets/screens/docs-link-panel-light.webp"></picture>
<p><b>📄 Docs — the link panel</b><br><sub>Select text and add a link to a web page or to another document.</sub></p>
</td>
</tr>
</table>

</details>

### 📱 On a phone

<p align="center">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-home-phone-dark.webp"><img alt="Docs — home" src="docs/assets/screens/docs-home-phone-light.webp" width="260"></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/docs-document-phone-dark.webp"><img alt="Docs — a document in the page view" src="docs/assets/screens/docs-document-phone-light.webp" width="260"></picture>
</p>
<p align="center"><sub>Start a document from a template, or open one you worked on recently. · A page with a header, contents, footnotes and a toolbar for fonts, size, colour, spacing, lists and tables.</sub></p>

> [!TIP]
> The screenshots follow your GitHub theme: switch between light and dark to see both. In the app the page itself stays white in the dark theme, as paper does.

## ✨ Features

### 🏠 The home

- **Recent, shared and starred.** Documents you worked on recently, documents shared with you and the ones you starred, each showing who is in it now.
- **Folders.** "My documents" and team folders, with a path. Starting a document or importing in a folder puts it there.
- **Search that follows your typing.** Search by name and by what the documents say, with choices for owner, time changed and order. They live in the address, so a link opens the same view. A filter that hides everything offers to clear it.
- **A menu on every document.** Open, version history, share, and move to the trash with Undo. It refreshes when files change.
- **Names, not ids.** People show by name as owners.
- **Import by dropping.** Drop a Word, Markdown or text file on the home page, or use "Import a file".

### 🧩 Templates

- **Six to start with.** Meeting notes, Project brief, Weekly update, Decision record, Product requirements and One-on-one, in the categories General, Meetings, Projects, Product and Reports. A gallery shows each with one line about it.
- **Your own.** A Docs Manager changes, adds or retires templates, orders them in the gallery, and can make one from an existing document. It keeps a copy of that document's content as Markdown and where it came from. A document the creator cannot read is refused as not found.
- **Start from a template.** The action "New Document" makes a document as the person who runs it, in their space or in a folder they may edit, titled after the template unless they choose another name (a taken name gets a number). Many people can start from one template at once. A retired template is refused.
- **Markdown content.** Templates hold headings, paragraphs, bullet, numbered and task lists, quotes, fenced code, rules, tables and inline formatting.

### ✍️ Writing and formatting

- **Text.** Font family (system sans, a serif, a monospace and the common named families), size from 8 to 96 (typed, or stepped with Ctrl or ⌘ Shift and the period or comma keys), bold, italic, underline, strikethrough, subscript, superscript and clear formatting.
- **Colour.** Text colour and highlight from a palette with recent colours and a custom value.
- **Headings and paragraphs.** Title, Subtitle and headings 1 to 6; left, centre, right and justify; line spacing; space before and after a paragraph; indent.
- **Lists.** Bullets, numbers and task lists with number and bullet styles, nesting, restart or continue numbering.
- **Blocks.** Quote, callouts (note, tip, warning, alert), code block, divider, picture and a date chip that is stored as a date and shown in the reader's language.
- **The `/` menu.** Type `/` at the start of a word to insert a heading, list, checklist, table, callout, quote, code block, divider, picture or today's date. It narrows as you type and works with the keyboard alone.
- **Mentions.** Type `@` to name a person, a record or another document of the workspace, as the bar's search finds them. A person mentioned is told by a short comment on the document, only if the mention is still there, and the page says if they cannot open the document yet. A mention is a unit; open a record with Ctrl or ⌘ held.
- **Links.** To a web page, a heading, or another document, with a card to open, edit, copy or remove (Ctrl or ⌘ K).
- **Direction.** Each paragraph, list item, cell and note reads in the direction of its own words, and a paragraph's direction can be set by hand.

### 🖼️ Tables and pictures

- **Tables.** A size picker to insert; a bar beside the table to add and delete rows and columns, merge and split cells, drag column widths, toggle the header row, colour cells, align them top, middle or bottom and left to right, and remove borders.
- **Pictures.** Upload, paste or drop. A picture resizes by a handle or a size menu, sits left, centre or right or lets text wrap, and takes a caption and a description for screen readers. Pictures are kept by the document in Drive and shown from there. A pasted picture is uploaded, never embedded.

### 📄 Pages

- **Page setup.** Paper size, orientation and margins per document, shared with everyone editing. The sheet is drawn at the paper's real width with marks where pages will break.
- **Breaks, headers and footers.** Page breaks (Ctrl or ⌘ Enter), a header and a footer with page number, page count, date and title, and a different first page.
- **Contents and footnotes.** An inserted table of contents built from the headings, and footnotes that renumber as people edit. A contents button also shows the headings beside the page, marks the one in view and jumps to one.
- **Print.** File > Print prints everything, including headers, footers and breaks.
- **Word and character counts**, also for a selection.

### 💬 Comments, suggestions and history

- **Comments on the text.** Select words and press Comment (Ctrl+Alt+M), also with comment-only access. The words are marked and the thread sits beside the page, in the order of the text, with replies and @mentions, Resolve and Reopen. The mark moves with everyone's typing, and a thread whose words were deleted says so.
- **Editing or Suggesting.** In Suggesting mode typing proposes. Insertions and deletions carry who, when and an id, and formatting is proposed too: a new or joined paragraph shows as ¶, and bold, colour, size, font, highlight, links, alignment, spacing, indent, heading level and list type are proposed with what they were. Accept or reject one, all, or all of one person's, as one undo. A test over 1,280 random edits by two people holds that rejecting everything gives the document back exactly. A change that cannot be proposed (tables, pictures, wrapping in or out of a list, a mention, a page break, contents, a footnote) is refused with the reason.
- **Find and replace.** Ctrl+F finds, Ctrl+H (⌘⇧H on a Mac) replaces, with match case, whole word and a count. Replace one or all as one change; while suggesting, replacements are suggestions.
- **Version history.** The versions with who and when, the one chosen beside the one before it, the text now or any other version, added words underlined and removed words struck through, a count, and arrows between changes. Download a version as Word, PDF, a web page or text, or restore it as a copy beside the document (a live document is never overwritten by an old version). Versions are written when the editors leave and every ten minutes.

### 📥 Word, Google Docs and files

- **Paste from Word and Google Docs** keeps bold, headings, lists, links, tables, colours, sizes, fonts and pictures. Ctrl or ⌘ Shift V pastes plain text.
- **Import** a Word `.docx` (fonts, sizes, colours, highlight, alignment, spacing, merged and coloured cells, column widths, pictures, page setup, headers and footers, footnotes and page breaks), Markdown or a text file as a new document. The page lists what it could not carry. A Word file in Drive can open as a new live document beside the original, which is left as it is.
- **Download** as Word (`.docx`), PDF, a web page, text or Markdown, with a note on anything the format could not carry. A Word export carries formatting, suggestions as tracked changes and comment threads with their replies. PDF export needs the platform's document renderer, which the platform's standard deployments include.
- **File menu.** Rename, Make a copy and Move to trash.

### 🔒 Working safely

- **Honest saving.** The save indicator never says "Saved" for work kept only in the browser. Changes made offline are kept in the browser per person and document, sent at the next visit if the person may still edit, and let go once stored. If the browser cannot keep them, the page says they are kept in this tab only and warns before it is left.
- **Newer formats.** A document carries a format number. A Docs that meets a newer format shows "This document uses features from a newer version of Docs" with Reload, stays read only and writes nothing.
- **Checked input.** Every colour, font, size, spacing and margin that arrives by paste, import or another person's editor is validated before it is stored or drawn.
- **Sharing is Drive's.** Edit, Comment and View access, shares with people or roles, public links with passwords, end dates and limits, guests, trash and quotas all follow Drive's rules and apply on the next request.

### ⌨️ Keyboard, phones and accessibility

- **Every shortcut in one list** (Ctrl or ⌘ /), Ctrl or ⌘ K for a link, Alt+F10 to jump to the toolbar or the bar of the selected table or picture, Escape back to the text.
- **One-row toolbar** that folds what does not fit into More, one tab stop with arrow keys.
- **On a phone** the toolbar scrolls and sits above the on-screen keyboard, with 44-pixel controls.
- **Accessibility checks.** An automated check finds none of the editor's own violations in 40 scenarios in both themes, and a 24-step keyboard walk is kept as a script. A screen-reader audit has not been done yet.
- **Languages.** The interface and the names of its records are in Arabic and Hindi as well as English.

### 🤖 For AI agents

Over Ferrum's MCP server (`run_action`):

- **`create_document`** on a Document Template starts a document from it.
- On the caller's Drive Space, Drive's **`create_document`** (from Markdown), **`read_document`** (as Markdown, text or HTML, with a note of what the format could not carry) and **`append_to_document`** (Markdown added at the end; everyone with the document open sees it at once).
- Drive's **`search`** with `live: true` finds documents by name and by what they say.

## 🧭 How it works

### From template to shared document

```mermaid
flowchart LR
    T["Document Template - Markdown"] -->|New Document| D["Live document - .fdoc file in Drive"]
    P["Person or AI agent"] --> T
    I["Word, Markdown or text file"] -->|Import| D
    D --> E["Editor in the browser - Docs"]
    E <-->|live changes| WS["Platform live channel"]
    WS <--> D
    D --> V["Versions, trash, sharing - Drive"]
    D --> X["Word, PDF, HTML, Markdown"]
```

A template (or an imported file) becomes a live document, a file in Drive. People open it in Docs and their changes travel over the platform's live channel, so everyone sees them at once. Drive keeps the versions, the sharing and the trash.

### Inside Ferrum

```mermaid
flowchart LR
    subgraph Browser
        UI["Docs interface - /docs/"]
        BAR["Ferrum bar - search, bell"]
    end
    subgraph Server["Ferrum server"]
        API["REST, MCP, live"]
        K["Kernel - permissions, RLS, audit"]
        DOCS["Docs - templates"]
        DRV["Drive - files, versions, sharing"]
    end
    DB[("PostgreSQL")]
    UI --> API --> K --> DB
    BAR --> API
    K <--> DOCS
    DOCS --> DRV
```

Docs adds templates and an interface; Drive holds the documents. Everything follows the platform's permissions and audit trail, and AI agents work under the same rules as people.

## 🧱 Data model

| Entity | What it is | Key fields |
|---|---|---|
| Document Template | What a new document starts from | name (unique), category (General, Meetings, Projects, Product, Reports), description, content (Markdown), source document, active, sort order |

The documents themselves are Drive's (`DriveFile` with the `.fdoc` type, with versions, shares, links, comments and activity).

### 👥 Roles

| Role | What it can do |
|---|---|
| **Docs User** | Uses the templates, has a Drive space of their own as a Drive User does, and writes documents shared with them. What they may do with each document is Drive's sharing |
| **Docs Manager** | Keeps the workspace's templates: changes, adds, retires and orders them, and makes them from documents |

### 🎬 Actions

| Action | What it does |
|---|---|
| `create_document` on a Document Template | New document from a template, as the caller, in their space or a folder they may edit. Parameters: title, folder |

There are no reports, print formats or scheduled jobs.

## 🔌 Integrations

| With | How | Needs |
|---|---|---|
| Drive | Documents are Drive's live documents; sharing, versions, trash, quotas and search are Drive's | Drive `>=0.7` |
| The bar's search and `@` mentions | People, records and documents found by the platform's search | Nothing |
| Notifications | A person mentioned or replied to in a comment is told | Nothing |
| Word and Google Docs | Paste, `.docx` import and export | Nothing |
| PDF export | The platform's document renderer | Included in the standard deployments |
| AI agents | MCP actions listed above | An MCP client and the agent's own permissions |

## 📊 How it compares

Docs is compared with Google Docs, Word in Microsoft 365, Notion and ONLYOFFICE Docs, the open-source document editor.

| Capability | Ferrum Docs | Google Docs | Word (M365) | Notion | ONLYOFFICE Docs |
|---|:-:|:-:|:-:|:-:|:-:|
| Live co-editing with cursors | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comments with threads, replies and resolve | ✅ | ✅ | ✅ | ✅ | ✅ |
| Suggesting mode, accept and reject | ✅ ¹ | ✅ | ✅ | ❌ | ✅ |
| Version history with compare | ✅ | ✅ | ✅ | ✅ | ✅ |
| Restore a version in place | 🟡 ² | ✅ | ✅ | ✅ | ✅ |
| Fonts, sizes, colours, highlight | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Headings 1 to 6, Title, Subtitle | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Custom named styles | ❌ | ✅ | ✅ | ❌ | ✅ |
| Tables with merged cells, widths and shading | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Pictures with wrap, caption and alt text | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Page size, margins, headers, footers, page numbers | ✅ | ✅ | ✅ | ❌ | ✅ |
| True pages shown while editing | 🟡 ³ | ✅ | ✅ | ➖ | ✅ |
| Table of contents and footnotes | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Columns | ❌ | ✅ | ✅ | ✅ | ✅ |
| Equations | ❌ | ✅ | ✅ | ✅ | ✅ |
| Slash menu for blocks | ✅ | 🟡 | 🟡 | ✅ | ❌ |
| Mentions of people and records | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Find and replace | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Paste from Word and Google Docs keeps formatting | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Open and save Word files | 🟡 ⁴ | ✅ | ✅ | ❌ | ✅ |
| Export to Word, PDF, HTML and Markdown | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Templates | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search by what documents say | ✅ | ✅ | ✅ | ✅ | ✅ |
| Share with roles, expiring and password links, guests | ✅ ⁵ | ✅ | ✅ | 🟡 | ✅ |
| Offline editing | 🟡 ⁶ | ✅ | ✅ | 🟡 | 🟡 |
| Native mobile apps | ❌ | ✅ | ✅ | ✅ | ✅ |
| AI writing help inside the editor | ❌ | ✅ | ✅ | ✅ | 🟡 |
| AI agents can read and write over MCP | ✅ | 🟡 | 🟡 | ✅ | 🟡 |
| Self-hosted | ✅ | ❌ | ❌ | ❌ | ✅ |
| Open source | ✅ | ❌ | ❌ | ❌ | ✅ |
| No per-user licence fee | ✅ | ❌ | ❌ | ❌ | 🟡 |

¹ Suggestions cover text and most formatting; tables, pictures, wrapping in or out of a list, mentions, page breaks, contents and footnotes cannot be proposed and are refused with a reason. Overlapping format suggestions by two people merge into the latest person's.
² Drive can name and keep a version and restore or download any; for a live document, restore makes a copy beside it.
³ The sheet is drawn at the paper's width with page-break marks that are measured; they can sit a row off the real break inside a table.
⁴ A Word file opens as a new live document beside the original, with most formatting kept and a list of what was not; the original is left as it is. Editing a `.docx` in place is done by the office editors in Drive, not by Docs.
⁵ Provided by Drive.
⁶ Changes typed offline are kept and sent later; opening a document offline is not built.

### 🏆 Where Docs stands out

- 📂 One set of sharing, version and trash rules for every file, because documents are Drive files.
- 🤖 AI agents work on the same documents as people, through the same permissions.
- 🔁 Suggestions are tested hard: accepting or rejecting everything gives exactly what you would expect, over 1,280 random edits.
- 🧾 Imports and exports say what they could not carry, and an editor that meets a newer document format stays read only instead of showing an empty page.
- 🏠 Open source, self-hosted, no per-seat licence.

### 🚧 Where the leaders are still ahead

- 📱 Native mobile apps and full offline use.
- 🧠 Writing help from AI inside the editor.
- 📐 Columns, equations, custom named styles and true pagination while you edit.
- 📚 More import and export formats (`.odt`, `.rtf`, `.doc` and others).
- ♿ A completed screen-reader audit.

> [!NOTE]
> Leader columns are from public product information as of November 2026 and may change.

## 📍 Roadmap

### ✅ Recently shipped

- [x] **0.8.1**: A lighter first page and tuned menus, icons and selection bars on narrow screens.
- [x] **0.8.0**: Docs becomes a word processor: fonts, colours, tables, pictures, page setup, headers and footers, footnotes, contents, formatting suggestions, Word import and paste, find and replace, and shortcuts.
- [x] **0.7.13**: The upgraded design system; an honest save indicator; a phone toolbar with 44-pixel controls.
- [x] **0.7.12 and earlier 0.7.x**: Arabic and Hindi for every sentence and every name, right to left, times on a person's own clock.
- [x] **0.7.0**: Unsaved changes wait in the browser under the workspace's offline policy.
- [x] **0.6.0**: The `/` menu, mentions, contents, find and replace, readable version history, Word and Markdown import, folders on the home page.

### 🔜 Next up

**Editing**
- [ ] Suggest changes to tables, pictures, checklists and a list's nesting.
- [ ] Merge overlapping format suggestions from two people instead of keeping the latest.
- [ ] True pagination while editing.
- [ ] Columns and equations.
- [ ] Named styles beyond headings.

**Files**
- [ ] Open a document offline.
- [ ] Import `.doc`, `.odt`, `.rtf` and PDF, and export `.odt`.

**Quality**
- [ ] A screen-reader audit.
- [ ] Try the on-screen keyboard and selection handles on real phones (they were emulated).

### 🔭 Later

- [ ] Page numbers in the contents block.
- [ ] Table border styles.
- [ ] Word line spacing, cell padding and header-row shading that match the editor in exports, so page counts agree.
- [ ] Find with regular expressions.
- [ ] Smart chips for files, status and places beside the date chip.
- [ ] Restore a version in place for live documents.
- [ ] AI writing help inside the editor.
- [ ] Native mobile apps.

## 🚀 Install

Docs is a native app compiled into the official Ferrum server image. A workspace administrator installs it from **Apps** (`/store/`). It belongs to Drive's Workspace family: it requires Drive `>=0.7`, installs with it and goes before it. Self-hosters who build their own image enable the `docs` feature of the server. It needs Ferrum platform `>=0.3.2, <0.4`.

**First steps**

1. Give people the **Docs User** role. It lets them have a Drive space of their own.
2. Give the people who curate templates the **Docs Manager** role.
3. The six starting templates are added on install; change, retire or add to them under **Document Templates**.
4. For PDF downloads, run the platform's document renderer (it is on in the standard deployments).

## 🔧 Develop

Clone it next to the platform and Drive:

```text
work/
├── ferrum/              https://github.com/CBFerrum/Ferrum (with Ferrum-Frontend cloned into ferrum/web)
├── ferrum-app-drive/    https://github.com/CBFerrum/ferrum-app-drive
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

The tests need PostgreSQL with an ordinary (non-superuser) role, so row-level security applies:

```bash
createuser ferrum --pwprompt && createdb -O ferrum ferrum_docs_test
export FERRUM_DOCS_TEST_DATABASE_URL=postgres://ferrum:ferrum@localhost:5432/ferrum_docs_test
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

The interface lives in `ui/` and builds with Ferrum-Frontend's packages from the sibling checkout:

```bash
cd ui
npm run check       # UI lint and the size budget
npm run typecheck
npm test
npm run build       # writes ui/dist, which the crate embeds and which is committed
```

With a development server started with `FERRUM_DEV_UI=1`, `ferrum-app dev --ui` serves the pages from Vite behind the real bar and session, with hot reload. CI (`.github/workflows/ci.yml`) runs the Rust checks and the interface checks on every push and pull request.

## 📂 Project layout

```text
app.yaml              the manifest: id, version, parent (Drive), launcher entry, Create menu
packages/docs/        the Document Template entity, roles, starting templates, README
src/                  Rust: templates and the New Document action
ui/src/               React interface: home, editor, toolbar, menus, comments, history,
                      import and export, page setup, find, shortcuts
ui/src/locales/       Arabic and Hindi words
tests/                integration tests against PostgreSQL and Drive
docs/                 banner and screenshots
CHANGELOG.md          what changed in each version
```

## 📜 Changelog

Every release is described in [CHANGELOG.md](CHANGELOG.md). The latest is **0.8.1**; **0.8.0** made Docs a word processor.

## 🤝 Contributing

Issues and pull requests are welcome at [github.com/CBFerrum/ferrum-app-docs](https://github.com/CBFerrum/ferrum-app-docs/issues). Run the checks in [Develop](#-develop) before you open a pull request.

## 📄 License

[AGPL-3.0-only](LICENSE), like the platform.

<div align="center">

<sub>Part of <a href="https://github.com/CBFerrum/Ferrum">Ferrum</a>, the open business platform · Made with 🦀 Rust and 🐘 PostgreSQL</sub>

</div>
