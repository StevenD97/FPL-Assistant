import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { TransferResult } from "@/shared/types/api";

/**
 * The optimizer's recommendation for an already-loaded squad. Errors render
 * here rather than at page level on purpose: a failure (e.g. FPL having purged
 * this manager's pick history at a season boundary) leaves the squad above
 * perfectly usable.
 */
export function SuggestedTransfers({
  optimizer,
  loading,
  error,
  onSwitchToOptimize,
  compact = false,
}: {
  optimizer: TransferResult | null;
  loading: boolean;
  error: string | null;
  onSwitchToOptimize?: () => void;
  /**
   * Dashboard variant: just the out/in pairs and the cost line, with no Card,
   * heading or explanation - the surrounding Panel supplies those, and the full
   * version is one tap away on the Planner tab.
   */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <>
        {loading && <p className="text-sm text-text-muted">Solving…</p>}
        {error && <p className="text-xs text-text-secondary">Couldn&apos;t compute suggestions.</p>}
        {optimizer &&
          (optimizer.transferred_out.length > 0 ? (
            <>
              <ul className="flex flex-col">
                {optimizer.transferred_out.map((out, i) => {
                  const incoming = optimizer.transferred_in[i];
                  return (
                    <li
                      key={out.id}
                      className="flex items-center gap-2 border-t border-border py-1 text-sm first:border-t-0 first:pt-0"
                    >
                      <span className="min-w-0 flex-1 truncate text-danger">↓ {out.web_name}</span>
                      {incoming && (
                        <span className="min-w-0 flex-1 truncate text-right font-semibold text-success">
                          ↑ {incoming.web_name}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-[11px] text-text-secondary">
                {optimizer.transfers_made} transfer{optimizer.transfers_made === 1 ? "" : "s"}
                {optimizer.points_hit > 0 ? ` · -${optimizer.points_hit} hit` : " · no hit"} ·{" "}
                <span className="font-mono">{optimizer.predicted_points.toFixed(1)}</span> pts
              </p>
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              No changes recommended - your squad is already optimal.
            </p>
          ))}
      </>
    );
  }

  return (
    <Card>
      <h3 className="mb-2 font-semibold text-text-primary">
        Suggested transfers
      </h3>
      <p className="mb-3 text-xs text-text-muted">
        The optimal transfers for your squad and bank, weighing predicted points against the -4 hit per
        transfer beyond your free ones.{" "}
        {onSwitchToOptimize && (
          <>
            See the{" "}
            <button type="button" onClick={onSwitchToOptimize} className="text-pl-purple underline">
              Optimizer
            </button>{" "}
            tab for a from-scratch solve, or full control over the prediction window.
          </>
        )}
      </p>

      {loading && (
        <p className="text-sm text-text-muted">Solving...</p>
      )}

      {error && (
        <Alert kind="warning">
          Couldn&apos;t compute suggested transfers ({error}) - the squad
          above is unaffected.
        </Alert>
      )}

      {optimizer && (
        <>
          <p className="mb-3 text-sm text-text-secondary">
            <span className="font-mono font-medium text-text-primary">{optimizer.transfers_made}</span>{" "}
            transfer{optimizer.transfers_made === 1 ? "" : "s"}
            {" · "}
            {optimizer.points_hit > 0 ? (
              <span className="inline-flex items-center gap-1 font-mono text-danger">
                -{optimizer.points_hit} pt hit <InfoTooltip term="transferHit" />
              </span>
            ) : (
              <span>no hit</span>
            )}
            {" · "}
            predicted XI points, GW{optimizer.next_event}
            {optimizer.gw_count > 1 ? `-${optimizer.next_event + optimizer.gw_count - 1}` : ""} combined (after hit){" "}
            <span className="font-mono font-medium text-text-primary">
              {optimizer.predicted_points.toFixed(2)}
            </span>{" "}
            <InfoTooltip term="predictedXiWindow" />
          </p>

          {optimizer.transferred_out.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  Out
                </p>
                <ul className="text-sm">
                  {optimizer.transferred_out.map((p) => (
                    <li key={p.id} className="border-t border-border py-1">
                      {p.web_name}{" "}
                      <span className="text-text-muted">
                        ({p.team_short}, {p.position})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  In
                </p>
                <ul className="text-sm">
                  {optimizer.transferred_in.map((p) => (
                    <li key={p.id} className="border-t border-border py-1">
                      {p.web_name}{" "}
                      <span className="text-text-muted">
                        ({p.team_short}, {p.position})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <Alert kind="success">
              No changes recommended - your squad is already optimal for this window.
            </Alert>
          )}
        </>
      )}
    </Card>
  );
}
