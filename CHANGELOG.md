# Changelog

## 0.7.6

Rebuilt with Ferrum-Frontend 63280d3: right to left, its pages mirror as they read (icons that point along the line, margins and alignment by the line's start and end, arrow keys along it), and the records pages' words are in Arabic and Hindi.

## 0.7.5

Rebuilt with Ferrum-Frontend a64416a: a new record's box whose default is 1 shows ticked, as it is saved.

## 0.7.4

Rebuilt with Ferrum-Frontend 922fcfb: an action's dialog says every refusal, the errors on what the action made (another record's rows) among them, and an action with parameters and a confirmation asks once.

## 0.7.3

Rebuilt with Ferrum-Frontend a76295e: its pages show times on a person's own clock when they chose one on their Account page, while today and due dates stay on the workspace's day.

## 0.7.2

Comments' and suggestions' times are on the workspace's clock, and inserting today's date gives the workspace's day. Rebuilt with Ferrum-Frontend 24c3951, so its records' pages show times on the workspace's clock too, a draft numbered on submit is headed as a draft, and a record of an app that is not installed says so.

## 0.7.1

Rebuilt with Ferrum-Frontend bb60115: a record page reads an empty number or check as the server does, so an action whose condition needs one shows, and a workspace's settings open as their one record.

## 0.7.0

Unsaved changes wait in the browser under the workspace's offline policy (Ferrum docs/offline.md): as work not sent yet, kept for their person until the server stores them, whatever the lease says. Changes kept before, in the browser's old place, are still found and sent.

## 0.6.3

Rebuilt with Ferrum-Frontend 00dea07: in a workflow state that names what may change, the other fields show read-only, and the fields the state needs show required.

## 0.6.2

Rebuilt with Ferrum-Frontend daeadda: after an action runs, a record page shows what the action said it did rather than only that it is done.

## 0.6.1

Rebuilt with Ferrum-Frontend 80ff179: a field's label names its control for assistive technology, and a record whose title is a link shows that record's title, not its id.

## 0.6.0

- A `/` menu in the editor (Ferrum apps-ui.md, the document editor): type `/` at the start of a word
  to put a heading, list, checklist, table, callout, quote, code block, divider, picture or today's
  date in the text. It narrows as you type and works from the keyboard (arrows, Enter or Tab,
  Escape). Callouts (note, tip, warning, alert) are the editor's quote with a kind, so Word and
  other exports show them as quotes. The menu stays out of the way while suggesting.
- Mentions: type `@` to name a person or a record (or a document) of the workspace, as the bar's
  search finds them. A person mentioned is told, by a short comment on the document a few seconds
  after the mention is made and only if it is still there; the page says if they cannot open the
  document yet. A record opens with Ctrl or ⌘ held (or Enter when selected, or a plain click where
  the text cannot be changed). Exports and search read a mention as its name.
- Contents: a button in the bar shows the headings beside the page, marks the one in view and jumps
  to one. The choice is remembered.
- Find and replace: the bar's Find (Ctrl+F; Ctrl+H, or ⌘⇧H on a Mac, with replace) marks every
  match and counts them. Replace one or all, as one change; while suggesting, replacements are
  suggestions.
- Version history, at File, Version history (or a document's menu on the home page): the versions
  with who and when, the one chosen beside the one before it, the text now or any other version,
  with added words underlined and removed words struck through, a count, and arrows between the
  changes. Download a version as Word, PDF, a web page or text, or restore it as a copy beside the
  document (a live document is never overwritten by an old version).
- Import a Word document (.docx), Markdown or a text file as a new document, from "Import a file" or
  by dropping it on the home page. Headings, bold, italic, strikethrough, links, nested lists, quotes,
  code and tables come across; pictures and page layout do not, and the page says how many pictures
  were left out. File also has Download as Markdown.
- The home gains folders (My documents and team folders, with a path), choices for owner, time
  changed and order that live in the address with the search, search that follows your typing, a
  star and a menu on each document (open, version history, share, move to the trash), people's names
  for owners, and it refreshes when files change. Starting a document or importing in a folder puts
  it there.
- Suggesting refuses to add or take away a mention (it is a unit, not words). The editor's colours
  come from the theme, so dark mode follows.
- No server change: it needs the same Drive (0.7 or later). Records in the `@` menu come from the
  platform's search; where that is missing, people are still offered.

## 0.5.2

- Keeping unsaved changes fails safely: a browser that refuses the write at once (as some do when
  storage is full) no longer counts as having kept them, so the bar and the warning before leaving
  say so; an earlier copy that cannot be read is replaced instead of blocking every later save; and
  a kept copy that cannot be applied is let go instead of failing at every visit.

## 0.5.1

- When the browser cannot keep unsaved changes (its storage is full, or it refuses IndexedDB), the
  page says they are kept in this tab only and warns before the tab is left, instead of promising
  the browser keeps them. It promises again once a later try succeeds.

## 0.5.0

- Suggestions (Ferrum collaboration.md, C3): a mode for editors, Editing or Suggesting. While
  suggesting, typing proposes: `insertion` and `deletion` marks carry who, when and an id in the
  shared document (a replacement shares one). Deleting your own proposal removes it. Backspace and
  Delete strike instead of removing, the caret moving on, and formatting or structure is refused with
  a note. The rail lists suggestions with Accept and Reject (each, or all) for whoever may edit.
  Exports show them (HTML ins/del, Word's tracked changes, checked in LibreOffice).

## 0.4.0

- Comments on the text (Ferrum collaboration.md, C3; Drive 0.10.0): select words and press Comment
  (Ctrl+Alt+M), with comment access only too. The words are marked and the thread sits beside the
  page, in the order of the text, with replies (@mentions), Resolve and Reopen. A click in marked
  words shows their thread, and the mark moves with everyone's typing. A thread whose words were
  deleted says so. Others' comments arrive every 20 seconds.

## 0.3.0

- Images in documents (Ferrum collaboration.md, C3; Drive 0.9.0): from the toolbar, pasted or
  dropped in, kept by the document in Drive and shown from there, with a description for screen
  readers. Pasted web pages keep their text but not their pictures; after an image the caret moves
  on, so typing never replaces it.
- File → Download as Word (.docx).
- Changes typed offline survive the tab: they are kept in the browser per person and document, sent
  at the next visit when the person may still edit, and let go once stored. The status line says so,
  and leaving no longer asks for confirmation where the browser keeps them. The editor notices the
  network going away at once.

## 0.2.1

- The family's navigation (Drive, Sheets, Slides, PDF, Docs) has each entry's icon and colour, and
  each document in the lists has the document icon.

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
