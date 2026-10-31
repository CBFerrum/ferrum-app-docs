# Changelog

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
