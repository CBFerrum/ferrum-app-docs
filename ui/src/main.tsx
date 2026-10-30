// Docs' own interface (Ferrum docs/plan/apps-ui.md §13), at /docs/ in the Workspace family with
// Drive: the home of documents written together, and the editor at /docs/d/{file}. Drive's
// dialogs and panels it uses arrive through the shell (the `share file` intent, Drive's details
// panel), never as shared code.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, Outlet, RouterProvider, useRouteError } from "react-router";
import { routeBase, shell } from "@ferrum/client";
import { ConfirmHost, EmptyState, ErrorState, Toaster } from "@ferrum/kit";
import { DocsPage, NewDocument } from "./Docs";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

function Frame() {
  useEffect(() => shell().ready(), []);
  return (
    <main id="main" className="docs-app">
      <Outlet />
    </main>
  );
}

function RouteError() {
  return <ErrorState error={useRouteError()} onRetry={() => window.location.reload()} />;
}

function NotFound() {
  return (
    <EmptyState title="Page not found">
      <Link to="/">Go to Docs</Link>
    </EmptyState>
  );
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Frame />,
      errorElement: <RouteError />,
      // A first page that loads its code later shows nothing meanwhile (the bar is there already).
      hydrateFallbackElement: <span />,
      children: [
        { index: true, element: <DocsPage /> },
        { path: "new", element: <NewDocument /> },
        { path: "d/:file", lazy: () => import("./LiveDoc").then((m) => ({ Component: m.LiveDocPage })) },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { basename: routeBase("docs") },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
      <ConfirmHost />
    </QueryClientProvider>
  </StrictMode>,
);
