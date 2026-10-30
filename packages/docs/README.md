# Docs

Documents people write together, over Drive's documents edited live (`.fdoc` files, Drive 0.7 or
later). Docs adds templates and, in the web app, a home for documents; the documents, who may open
them, their versions and sharing are Drive's (see Drive's README, "Live documents").

## Roles

| Role | May |
|---|---|
| Docs User | Use the templates; a Drive space of their own, as a Drive User has |
| Docs Manager | Keep the templates: change, add, retire, and make them from documents |

## Entities

| Entity | Kind | Notes |
|---|---|---|
| **DocsTemplate** | master | `name` (unique), `category` (General, Meetings, Projects, Product, Reports), `description` (one line in the gallery), `content` (Markdown), `source_document`, `is_active`, `sort_order` (lower first) |

`content` is Markdown: headings, paragraphs, bullet, numbered and task lists, quotes, fenced code,
rules, pipe tables; bold, italic, strikethrough, code and links to the web or mail.

A template created with a `source_document` (a document's Drive file id) and no content takes that
document's content as Markdown, as its editors left it, read with the creator's own access: one
they may not read is refused as not found.

Six templates come with Docs (seeded by name, so changed ones stay changed): Meeting notes,
Project brief, Weekly update, Decision record, Product requirements and One-on-one.

## Actions

| Action | Parameters → result |
|---|---|
| `create_document` on a template | `title?` (the template's name), `folder?` (a Drive folder you may edit; your top folder by default) → the new document as a Drive item. Refused for a template no longer active |

The action changes nothing about the template, so it takes no lock on it: many people start from
one at once.

## For AI agents

Over Ferrum's MCP server (`run_action`):
* `create_document` on a DocsTemplate: a document from a template.
* On the caller's DriveSpace, Drive's `create_document` (from Markdown), `read_document` (Markdown,
  text or HTML) and `append_to_document` (Markdown added at the end; everyone who has the document
  open sees it at once).
* Drive's `search` with `live: true` finds documents by name and by what they say.
