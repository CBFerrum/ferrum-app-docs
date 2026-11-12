# Changelog

## 0.8.1

Rebuilt with Ferrum-Frontend 45dad7f, the design system as tuned after the landed build was reviewed. The left menu's icons are chosen so that none repeats on more than three rows and each fits its row; their drawings load beside the first page instead of inside it, so the page starts lighter; a row that scrolls sideways fades at the edge where there is more, in every browser and with reduced motion; a printed record leaves out empty fields and keeps its totals with the table; menus and popovers sit inside the page's landmarks for assistive technology; a selection bar folds what does not fit into More on a narrow screen. Nothing else changes.

## 0.8.0

Docs becomes a word processor. Built with Ferrum-Frontend 60402fa; exports need a platform at 7ccc85c or later to carry the formatting.

**Formatting.** Font family (the system sans, a serif and a monospace stack, and the common named families) and size (8 to 96, typed or stepped with Ctrl or ⌘ Shift . and ,); text colour and highlight from a palette with recent colours and a custom value; subscript, superscript, strikethrough and clear formatting; justify, line spacing, space before and after a paragraph, indent; bullet and number styles, restart or continue numbering. Title, Subtitle and headings down to 6. The page stays white in the dark theme, as paper does, so a document's colours never become unreadable.

**Tables and pictures.** A size picker to insert; a bar beside the table to add and delete rows and columns, merge and split cells, drag column widths, toggle the header row, colour cells, align them top, middle or bottom and left to right, and remove borders. A picture resizes by a handle or a size menu, sits left, centre or right or lets text wrap, and takes a caption and a description.

**Pages.** Paper size, orientation and margins per document, shared with everyone editing; the sheet is drawn at the paper's real width with marks where pages will break; page breaks (Ctrl or ⌘ Enter); a header and a footer with page number, page count, date and title, and a different first page; an inserted table of contents; footnotes that renumber as people edit; File > Print prints all of it.

**Suggesting** proposes everything a person changes in the text, not only words: a new paragraph and a joined one show as ¶, and bold, colour, size, font, highlight, links, alignment, spacing, indent, heading level and list type are proposed with what they were. Accept or reject one, all, or all of one person's, as one undo. Rejecting everything gives the document back exactly, and accepting everything gives what the same changes would have made: held by a test over 1,280 random edits by two people. A change that cannot be proposed (tables, pictures, wrapping in or out of a list, a mention, a page break, contents, a footnote) is refused with the reason.

**Coming from Word and Google Docs.** Pasting keeps bold, headings, lists, links, tables, colours, sizes, fonts and pictures (a pasted picture is uploaded, never embedded); Ctrl or ⌘ Shift V pastes plain text. Importing a .docx keeps fonts, sizes, colours, highlight, alignment, spacing, merged and coloured cells, column widths, pictures, page setup, headers and footers, footnotes and page breaks, and lists what it could not carry. A Word file opens as a new live document beside the original at /docs/open/{file}.

**Around the text.** Find and replace with match case and whole word, and a count; word and character count, also for a selection; links to a heading or to another document, with a card to open, edit, copy or remove; a date chip stored as the date and shown in the reader's language; every keyboard shortcut in one list (Ctrl or ⌘ /), Ctrl or ⌘ K for a link, Alt+F10 to the toolbar or the bar of the selected table or picture, Escape back to the text. The toolbar is one row that folds what does not fit into More, one tab stop with arrow keys, and on a phone it scrolls and sits above the on-screen keyboard. Each paragraph, list item, cell and note reads in the direction of its own words, and a paragraph's direction can be set by hand. Rename, Make a copy and Move to trash (with Undo) are in the File menu. A download says what the file could not carry, where the server says so.

**Safety.** Every colour, font, size, spacing and margin that arrives by paste, import or from another person's editor is validated before it is stored or drawn. A document carries a format number; a Docs that meets a newer format, or content it has no schema for, shows "This document uses features from a newer version of Docs" with Reload, stays read only and writes nothing, where 0.7.13 showed an empty page that said Saved. Menus no longer hide the page from assistive technology while open; axe finds none of the editor's own violations in 40 scenarios in both themes, and a 24-step keyboard walk is kept as a script. 191 tests. The new words are in Arabic and Hindi.

Not in this release: suggesting changes to tables, pictures, checklists or a list's nesting; overlapping format suggestions by two people merge into the latest person's; true pagination while editing (page marks are measured, and can sit a row off Chrome's own break inside a table); page numbers in the contents block; columns, equations, named styles beyond the headings, table border styles; comments in a Word export (the platform does not write them yet) and a Word file's line spacing, cell padding and header row shading, which differ from the editor so its page count can be lower; Drive's "Open as a Ferrum document" entry needs Drive 0.16; opening a document offline; a screen-reader audit; the on-screen keyboard and selection handles were emulated, not tried on a phone; Docs 0.7.13 and earlier cannot open documents that use the new formatting.

## 0.7.13

The interface follows the upgraded design system, rebuilt with Ferrum-Frontend 0a47157. Text uses the kit's type roles (nothing under 12px) and controls its height tokens; loading shows skeletons shaped like what is coming; empty, no matches, denied, offline and failed are told apart; status colours come from stored state ids. The interface check now runs the UI lint against an empty baseline. The editor's save indicator never says saved for work kept only in the browser; a search or filter that hides every document offers to clear it. At phone width the editor's toolbar scrolls inside itself with 44px controls, and the save status and avatars share the header row.

## 0.7.12

Rebuilt with Ferrum-Frontend c59c9a2: the names of its models, fields and manifest in Arabic and Hindi (47 each in ui/src/locales/names, which the platform serves to every page of the workspace, so a record's labels, the launcher and the bar read in the person's language), and the sentences its pages still showed in English (split around a link or a figure, built in code from a template or word by word) whole and translated (292 words each in ui/src/locales). Translated by the model, to be reviewed by native speakers.

## 0.7.11

Rebuilt with Ferrum-Frontend 155518c: the sentences its pages built in code (counts, dates, what a toast or a screen reader says) go through t() too, as whole sentences where code chose a word, and carry built-in Arabic and Hindi (248 words each in ui/src/locales, translated by the model and to be reviewed by native speakers).

## 0.7.10

The assistant knows what its records mean in its pages (contributes.shell.assistant): their states, what counts and where figures come from, with questions it suggests asking there.

## 0.7.9

Rebuilt with Ferrum-Frontend 5b22e7b: its own words carry built-in Arabic and Hindi (230 words each, ui/src/locales, translated by the model and to be reviewed by native speakers), fetched for the page's language only. The labels it keeps in objects, its dialogs, its page titles and the words it keeps in variables go through t() as well, and the names and sizes it shows as they are keep their order right to left. Its pages are drawn once their words are in, and its entry carries only the parts of the kit it uses.

## 0.7.8

Rebuilt with Ferrum-Frontend 6537d65: an action's link, code or token shown once is kept in a dialog to copy, and on a page that reads right to left, English left untranslated keeps its own order. Its own words go through the kit's t() (170 places), so a workspace's own words for its language reach them, and Admin, Interface words lists them under it (dist/words.json).

## 0.7.7

Rebuilt with Ferrum-Frontend d5d98f2: a workspace's own words for its interface (Admin, Interface words) reach its pages as they load; an attachment field that holds a picture shows it; and a value another record already has is said so, where the form said the record had been changed by someone else. Its own screens' margins, paddings, borders, alignment and insets go by the line's start and end, so they mirror right to left as the kit's do; what it places by coordinates (boards, timelines, charts, handles) stays as it was.

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
