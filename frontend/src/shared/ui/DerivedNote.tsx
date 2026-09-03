/**
 * The promise that every number in a recommendation was computed, not written.
 *
 * This is the one claim in the product that the incumbent cannot copy. The
 * official game shipped an LLM assistant in August 2026 that writes prose about
 * your team; a dozen other tools do the same. What none of them can say is that
 * the sentence you are reading is assembled from the exact figures that decided
 * the call - because in their case it isn't, it's a model paraphrasing a
 * number it was handed.
 *
 * So it is stated, next to the sentence, rather than left as an implication.
 * A reader who does not know the difference cannot value it, and a reader who
 * does will check.
 *
 * The corollary matters more than the badge: nothing in this app may generate
 * prose with a language model. The moment an LLM paragraph is added on top of
 * these rationales, this note becomes false and the only trust argument the
 * product has goes with it. See fpl/domain/rationale.py, where every sentence
 * is built by string composition from model outputs.
 */
export function DerivedNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-snug text-text-muted ${className}`}>
      <span className="font-semibold text-text-secondary">Derived, not generated.</span> Every
      number in that sentence is one the model computed. No language model writes anything here.
    </p>
  );
}
