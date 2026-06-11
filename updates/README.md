# Group Updates — how to request changes to the game

Drop a text file in **`updates/queue/`** describing the change you want.
Four times a day (8 AM, 2 PM, 8 PM, and midnight US Central), a Claude
routine picks up everything in the queue, implements it, verifies the
build, publishes the updated game to the live URL, and archives your
request with a summary of what was done.

**Live game:** https://jbvyvf67cb-ai.github.io/wutang-arcade/

## How to submit a request

1. Create a file in `updates/queue/` — name it anything, ideally
   `yourname-short-description.txt` (or `.md`), e.g.
   `chetan-bigger-beignets.txt`.
2. Write what you want in plain English. One request per file.
   Be as specific or as loose as you like:

   > Make the streetcar faster and add a bell sound when it stops.

   > The Huntress is too easy. Give her more HP and a fourth pounce
   > pattern.

   > Add a secret coin stash on the Cathedral roof.

3. Commit and push it to the default branch (or open a PR and merge it).
   That's it.

## What happens at each run

- The routine reads every file in `updates/queue/`.
- It implements the requests (or as many as it safely can), keeping the
  game's quality gates green (type-check + build, draw-call and payload
  budgets, the design contract in `PLAN.md`).
- It moves the processed request files into
  `updates/processed/<timestamp>/` along with a `SUMMARY.md` explaining
  what was done (or why something couldn't be done).
- It commits, pushes, and triggers the Pages deploy — the live game
  updates a few minutes later.
- The queue is left empty, ready for the next batch.

If the queue is empty at a scheduled time, the run exits immediately and
costs nothing.

## Notes

- Conflicting requests in the same batch are reconciled with judgment;
  the summary explains the call that was made.
- Requests that would break the game (or the rubric in `PLAN.md` §9) get
  scaled back or declined — with an explanation in the summary.
- Schedule: the rounds are Claude Code **Routines** on the owner's Claude
  subscription, managed at claude.ai/code/routines (one routine per time
  slot, instructions in `ROUTINE-PROMPT.md`). The owner can pause them,
  edit the times, or hit **Run now** for an immediate round.
