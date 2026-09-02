---
title: "What our model got wrong in Gameweek 1"
date: "2026-08-26"
excerpt: "Our top captain pick scored 2 points and finished 148th. The highest scorer in the game was a £4.5m left-back we had nowhere near the top ten. Here's the honest version."
tags: ["Model", "Accuracy"]
cover:
  type: gradient
  background: hero
---

We publish what the model predicts. It only means something if we also publish how it did, so: Gameweek 1 was a bad week, and here is exactly how bad.

## The captain call

The model's top-projected player for Gameweek 1 was **B.Fernandes**. He played ninety minutes and scored **2 points**.

Among players who actually appeared that weekend, that put him **148th**. The genuine top scorer was **De Cuyper on 17** — a £4.5m Brighton left-back the model did not have in its top ten.

There is no way to dress that up. On the single most consequential call a Fantasy tool makes — who to double — it was a long way off.

## The ranking, more broadly

The ten highest-projected players averaged **3.2 points**. Everyone who played averaged **3.06**. That is a difference of a seventh of a point per player, which is another way of saying the ranking carried almost no information that week.

Rank correlation across the whole list: **0.20**. Zero would be a coin toss.

## Why, as far as we can tell

The model is trained on last season's full record and reads the current roster on top of it. What it is good at is separating players who will play a lot and produce from players who won't. What it does not do is predict which five of ten fixtures end in a clean sheet, or which of four defenders inside a clean sheet takes all three bonus points.

Gameweek 1 was almost entirely decided by those two things. Five clean sheets, and the bonus landing on full-backs. That is close to the worst-case shape for a model built around expected attacking involvement.

## What we're not going to do

We're not going to retune the model on one gameweek. Thirty-eight-week seasons punish that. Multi-gameweek projections explain roughly half the variance in outcomes; single-gameweek predictions explain around thirty per cent, and most of that gap is real football variance rather than a fixable modelling error. A model rebuilt to fit one weekend would be worse the following one.

What we will do is keep publishing the record, weekly, including the weeks like this one. It's at [Accuracy](/accuracy) and it updates as each gameweek finishes.

## The fair caveat, and the fair reply

One gameweek is a tiny sample and this could look very different in a month. That's true, and it cuts both ways: a good week wouldn't have proved anything either. The point of publishing the record is that in twenty gameweeks' time there will be a real answer, and we won't be able to quietly pick the flattering weeks out of it.

Gameweek 2 deadline is Friday, 17:30.

Figures above are computed by grading the model's Gameweek 1 projections — made using only data available before that gameweek's deadline — against the official FPL results.
