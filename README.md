# Ferrum Docs

A native app for [Ferrum](https://github.com/CBFerrum/Ferrum), the open-source, AI-first ERP.

- A home for documents in the web app (Docs): recent, shared with you, starred and all of them,
  each showing who is in it now
- Documents everyone with access edits at once, with each other's cursors and names, saved as they
  type: Drive's live documents (`.fdoc` files), so sharing, versions, comments, trash and guest
  links are Drive's
- Templates to start from: meeting notes, project brief, weekly update, decision record, product
  requirements and one-on-one come with it; Docs Managers change them, add their own, or make one
  from any document they can read
- Search by what documents say, with the words found shown in context
- AI agents draft and add to documents over Ferrum's MCP server: New Document on a template, and
  Drive's `create_document`, `read_document` and `append_to_document` in Markdown. What they add
  appears at once for everyone who has the document open
- `packages/docs/README.md` documents the template entity, its action and the roles

## Install

Workspace administrators install it from **Apps** in Ferrum, after Drive (0.7 or later); it ships
in the official Ferrum server image. Self-hosters building their own image enable the `docs`
feature of the server.

## Its interface

Docs' interface (`ui/`) is served by Ferrum under its bar at `/docs/`, with the editor everyone types
in at once at `/docs/d/{file}`; it is in Drive's family, Workspace (Ferrum docs/plan/apps-ui.md).
Sharing a document is Drive's share dialog and comments and history are Drive's panel beside it, both
through the shell.

`ui/dist` is committed: the crate embeds it, so the server carries the interface of the version it was
built with. With Ferrum-Frontend checked out at `../ferrum/web`:

```
cd ui
npm run build       # into dist/, stamped with its sources (commit dist/)
npm run check       # CI: dist/ was built from ui/ as it is
npm run typecheck && npm test
```

## Development

The crate builds against Ferrum's and Drive's `main` branches; a git-ignored
`.cargo/config.toml` can point both at sibling checkouts. The test needs PostgreSQL:
`FERRUM_DOCS_TEST_DATABASE_URL` (default `postgres://ferrum:ferrum@localhost:5432/ferrum_docs_test`,
owned by a role that is not a superuser; the test resets it).
