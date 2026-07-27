"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { generateTeamNames } from "@/lib/teamNames";

export function TeamNameGenerator() {
  const [input, setInput] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  function generate() {
    setNames(generateTeamNames(input));
  }

  function copy(name: string) {
    navigator.clipboard?.writeText(name).catch(() => {});
    setCopied(name);
    setTimeout(() => setCopied((cur) => (cur === name ? null : cur)), 1200);
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold text-text-primary">Team name generator</h2>
      <p className="mb-3 text-xs text-text-muted">
        Type your favourite club or player for a batch of team name ideas.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Salah, Arsenal..."
          wrapperClassName="w-56"
        />
        <Button type="button" onClick={generate}>
          {names.length > 0 ? "More ideas" : "Generate names"}
        </Button>
      </div>
      {names.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {names.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => copy(name)}
              title="Click to copy"
              className="rounded-full border border-border-strong bg-white px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-slate-50"
            >
              {name}
              {copied === name && <span className="ml-1.5 text-xs font-medium text-success">Copied</span>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
