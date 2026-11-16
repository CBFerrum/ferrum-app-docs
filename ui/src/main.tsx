// Docs' own interface (Ferrum docs/plan/apps-ui.md §13), at /docs/ in the Workspace family with
// Drive: the home of documents written together, and the editor at /docs/d/{file}. Drive's
// dialogs and panels it uses arrive through the shell (the `share file` intent, Drive's details
// panel), never as shared code.

import { useEffect } from "react";
import { Link, Outlet, useRouteError } from "react-router";
import { shell, t } from "@ferrum/client";
import { ListSkeleton, StatePanel } from "@ferrum/kit";
import { mountApp } from "@ferrum/records/frame";
import { DocsPage, NewDocument } from "./Docs";
import "./styles.css";

function Frame() {
  useEffect(() => shell().ready(), []);
  return (
    <main id="main" className="docs-app">
      <Outlet />
    </main>
  );
}

function RouteError() {
  return <StatePanel kind="failed" error={useRouteError()} onRetry={() => window.location.reload()} />;
}

function NotFound() {
  return (
    <StatePanel kind="empty" title={t("Page not found")} action={<Link to="/">{t("Go to Docs")}</Link>} />
  );
}

mountApp({
  route: "docs",
  catalogs: { ar: () => import("./locales/ar.json"), hi: () => import("./locales/hi.json") },
  routes: [
    {
      path: "/",
      element: <Frame />,
      errorElement: <RouteError />,
      // A first page that loads its code later shows nothing meanwhile (the bar is there already).
      hydrateFallbackElement: <ListSkeleton rows={6} />,
      children: [
        { index: true, element: <DocsPage /> },
        { path: "new", element: <NewDocument /> },
        { path: "d/:file", lazy: () => import("./LiveDoc").then((m) => ({ Component: m.LiveDocPage })) },
        // A Word file in Drive, opened as a live document beside it (Drive's "Open as a Ferrum document").
        { path: "open/:file", lazy: () => import("./OpenWord").then((m) => ({ Component: m.OpenWordPage })) },
        { path: "d/:file/history", lazy: () => import("./History").then((m) => ({ Component: m.HistoryPage })) },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
});
