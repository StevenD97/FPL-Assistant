import type { PlayerTrajectory, SquadPlayer } from "@/shared/types/api";

/**
 * Renders a previewed replacement (see useSwapPreview) in a squad player's
 * slot - same shape everywhere it's shown (pitch, bench, detail table), so
 * picking a replacement anywhere shows up everywhere without a page reload.
 *
 * Only the fields the trajectory endpoint actually returns are overwritten;
 * everything else (deeper stats like xGI/ICT/Def90, the armband) stays
 * unset/cleared rather than carrying over the outgoing player's numbers.
 */
export function applySwapPreview(
  p: SquadPlayer,
  preview: PlayerTrajectory | undefined,
  cost?: number,
): SquadPlayer {
  if (!preview) return p;
  const nextGw = preview.trajectory[0];
  const opponent = nextGw?.opponents.map((o) => `${o.team}(${o.is_home ? "H" : "A"})`).join(" & ") ?? "";
  return {
    ...p,
    live_id: preview.id,
    web_name: preview.web_name,
    team_short: preview.team_short,
    pos: preview.position,
    player_photo: preview.player_photo,
    team_badge: preview.team_badge,
    team_kit: "",
    captain_flag: "",
    next_opponent: opponent,
    ep_next: nextGw?.predicted_points ?? preview.average_predicted_points,
    // Falls back to the outgoing player's own price only if a caller didn't
    // have the candidate's (the alternatives list is the only place it's
    // fetched) - better than showing a blank, but a caller that has it should
    // always pass it, since bank tracking depends on this being right.
    cost: cost ?? p.cost,
    // The outgoing player's news/status doesn't belong on the incoming one's
    // card - an injury flag carried across by the object spread would read as
    // the candidate's, not the player who's actually leaving.
    status: "",
    news: "",
  };
}
