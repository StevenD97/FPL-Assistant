import { redirect } from "next/navigation";

// Schedule + Fixtures merged into /matches.
export default function SchedulePage() {
  redirect("/matches");
}
