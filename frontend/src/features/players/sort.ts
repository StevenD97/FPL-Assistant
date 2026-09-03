/**
 * How the player list can be ordered.
 *
 * Lifted out of the page so the card list, the table and the toolbar all agree
 * on the same five keys rather than each restating them.
 */
export type SortKey =
  | "predicted_points"
  | "value"
  | "selected_by_percent"
  | "season_points"
  | "cost";
