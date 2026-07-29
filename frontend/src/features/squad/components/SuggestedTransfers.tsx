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
}: {
  optimizer: TransferResult | null;
  loading: boolean;
  error: string | null;
  onSwitchToOptimize?: () => void;
}) {
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
            predicted XI points (after hit){" "}
            <span className="font-mono font-medium text-text-primary">
              {optimizer.predicted_points.toFixed(2)}
            </span>
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
