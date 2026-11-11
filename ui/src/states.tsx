// Why a load did not give its content: the person may not see it (denied), the network is gone
// (offline) or it failed. Told apart by what the request answered, with no new calls.

import { ApiError, t } from "@ferrum/client";
import { Button, StatePanel } from "@ferrum/kit";

export function LoadFailed({ error, title, onRetry }: { error: unknown; title: string; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <StatePanel kind="denied" />;
  if ((error instanceof ApiError && error.status === 0) || (typeof navigator !== "undefined" && !navigator.onLine))
    return <StatePanel kind="offline" action={onRetry && <Button onClick={onRetry}>{t("Try again")}</Button>} />;
  return <StatePanel kind="failed" title={title} error={error} onRetry={onRetry} />;
}
