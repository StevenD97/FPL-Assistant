"""
Where a frozen, pre-deadline projection lives, and how to read one back.

The accuracy record grades a finished gameweek by comparing what the model
said against what happened. The question that decides whether anyone should
believe it is *when* the model said it.

Re-predicting a gameweek from a reference date just before its deadline is
honest - the inputs genuinely contain nothing from after kick-off - but it is
a reconstruction. It proves the model *could* have made that call, not that it
did, and the difference matters because the code in between is ours to change.
A frozen file written before the deadline and read back afterwards closes that
gap: the numbers are fixed, dated, and attributed to an exact commit, so the
grade becomes falsifiable rather than merely plausible.

Both paths coexist deliberately. Freezing only started partway through a
season, and the weeks before it should still be graded rather than dropped -
they just have to be labelled honestly as reconstructions, which `source` on
every graded gameweek does.
"""
import json
from pathlib import Path

from fpl.config import DATA_DIR

PROJECTIONS_DIR = Path(DATA_DIR) / "projections"

# What a graded gameweek says about where its predictions came from.
SOURCE_FROZEN = "frozen"          # written before the deadline, read back after
SOURCE_RECONSTRUCTED = "reconstructed"  # re-predicted from pre-deadline data


def frozen_path(event):
    """Zero-padded so a directory listing sorts the way a season runs."""
    return PROJECTIONS_DIR / f"gw{event:02d}.json"


def load_frozen(event):
    """
    The frozen projection for `event`, or None if it was never written.

    Returns None rather than raising on a malformed or truncated file: a
    corrupt freeze should cost that week its pre-commitment and fall back to a
    reconstruction, not take the whole accuracy page down with it.
    """
    path = frozen_path(event)
    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    if not payload.get("players"):
        return None
    return payload
