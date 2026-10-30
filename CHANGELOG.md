# Changelog

## 0.2.0

- Docs' own interface (Ferrum docs/plan/apps-ui.md, U4a), out of the web app: `ui/`, at `/docs/`
  with the editor at `/docs/d/{file}`, served by the platform under its bar and embedded in the crate
  (`UI`, from `ui/dist`). It is in Drive's family, Workspace (`parent: drive`), and draws Drive's
  navigation. Sharing a document is Drive's share dialog (the `share file` intent); comments and
  history are Drive's panel beside the document. The bar's Create menu has Document.
- The editor connects with the browser's session cookie.
- Needs Ferrum platform 0.3.2.

## 0.1.0

- Docs over Drive's live documents (Ferrum docs/plan/collaboration.md, C3): templates
  (`DocsTemplate`, six to start with), New Document on a template (as the caller, in their space
  or a folder they may edit), templates made from a document with the creator's access, and the
  roles Docs User and Docs Manager. The web app's Docs page lists documents and searches them by
  what they say.
