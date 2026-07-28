---
title: "Behind the model: why predicted points just got a little sharper"
date: "2026-07-28"
excerpt: "We retrained how the model rates every team's attack and defence, tested it the same way a weather forecaster checks old data, and kept only what actually improved on real results."
tags: ["Model", "Methodology"]
cover:
  type: gradient
  background: hero
---

If a couple of predicted-points numbers on the site look slightly different today than they did earlier this week, this is why. We just shipped a change to how the model rates every team's attack and defence - the foundation every single player prediction is built on - and we only kept it because it measurably improved on real results, not because it sounded like a good idea.

## The problem: final scores are noisier than they look

Every player prediction on this site starts with a team-strength rating: how good is this team's attack, how good is their defence, home and away. Until this week, those ratings were trained on **actual goals scored and conceded** - which sounds reasonable, but a final score is a small number that gets pushed around by a lot of luck. A team can dominate a match, hit the post twice, and lose 1-0; another can barely get out of their own half and nick a 2-1 on two deflections. Train a model on final scores alone and some of that randomness quietly becomes "how good this team is," which it isn't.

## The fix: rate teams on the quality of chances, not just the scoreline

The fix is to lean more on **expected goals (xG)** - a measure of the quality of chances a team actually created and conceded, not just whether they went in. It's the same idea already used for individual players on this site (a player's goal and assist involvement has been xG/xA-based for a while), now applied one level up, to the team ratings everything else depends on. A team that creates great chances but has a wasteful week still gets rated as a good attacking side, instead of getting marked down for finishing that had nothing to do with their underlying quality.

## How we know it actually helped

We don't ship a change like this on a hunch. This site keeps a full "walk-forward" test of the model - the same idea as a weather forecaster checking whether yesterday's forecast matched today's actual weather, but for every single gameweek of last season. For every gameweek, the model predicts every player using only the information that was actually available before that gameweek, then checks the prediction against what they really scored. Do that for all 37 testable gameweeks and you get an honest read on whether a change genuinely helps, rather than just looking good on the one week you happened to check.

On that test, the xG-based team ratings improved on the old actual-goals version across the board: better at ranking players correctly, a lower average error per prediction, and a real jump in how often the model's top-20 predicted scorers actually matched that gameweek's real top 20 - the number closest to "would this have helped you pick a captain." Goalkeeper and defender predictions improved the most, which makes sense: those positions score heavily off clean sheets, so a more accurate read on defensive quality matters more for them than it does further up the pitch.

## What we tried and didn't ship

Just as important: two related ideas were built, tested the same rigorous way, and **didn't** make the cut, because they didn't actually improve results on the same test - scaling down a player's chance of playing when their team has a congested run of fixtures, and boosting bonus-point predictions for players in especially favourable matchups. Both looked reasonable on paper. Neither held up against real results, so neither shipped. That's the standard every change here has to clear - not "does this sound smart," but "does this genuinely predict real gameweeks better than what's already live."

## What this means for you

Nothing changes about how you use the site - [Outlook](/outlook), [Optimizer](/squad), and every player page work exactly the same way. The predictions behind them are just a bit more trustworthy than they were last week, especially for defenders and goalkeepers, which is exactly where a lot of clean-sheet-dependent squad decisions live. We'll keep testing changes this way and only keep the ones that earn their place.

*Every number in this piece comes from this site's own backtest against real 2025/26 results - nothing here is a projection about the change, it's a measurement of it.*
