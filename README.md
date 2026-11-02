# Free Model Index

A public, open, scheduled measurement of how reliably OpenRouter's **free** models answer a real request: how often a probe got a usable answer inside a serverless time budget, how fast, and how each failure ended.

It is a build by Extrafemi, made alongside [Lodestone](https://lodestone.extrafemi.com), the library that routes around free models that fail. **Status: harness only (milestone 1).** There is no scheduler and no published data yet.

> **Only this repository contains the official Free Model Index.** Forks and reruns are unofficial and must say so.

## What it measures, and what it does not

- **Measures:** for each free model, one fixed small request, sent on a schedule, timed to the last byte of the response, ending in exactly one named outcome. Every model gets the same request, so the rates are comparable between models.
- **Does not measure quality.** A reliable model can be a poor translator. Quality for Hausa, Igbo and Yoruba is [Naija Eval](https://naija-eval.extrafemi.com)'s job; the two are meant to be read side by side, never blended into one score.
- **Does not measure paid models,** or any region other than where the probes run (GitHub's runners, not Lagos).
- **Is not a ranking of models.** Free tiers are rationed and change without notice. See [METHODOLOGY.md](METHODOLOGY.md).

## The probe

One request, written down in [`src/spec.mjs`](src/spec.mjs): a short JSON extraction from a one-line job posting, temperature 0, no system prompt, no reasoning option. The answer is *usable* if it is valid JSON with the right content and arrives within 24 s (Lodestone's serverless budget). Nothing a model says is stored: a record keeps the answer's length and whether it was valid.

Outcomes: `usable`, `usable_late`, `unusable`, `timeout`, `rate_limited_upstream`, `rate_limited_other`, `withdrawn`, `unavailable`, `other`, and `probe_budget` (our own account's limit, which is never counted for or against a model). Definitions are in [`src/outcomes.mjs`](src/outcomes.mjs).

## Run it

Needs Node 20 or newer.

```bash
npm install
npm test

# What would be probed? Sends nothing and needs no key.
node src/run.mjs --from-catalog --dry-run

# Probe (needs the index's own OpenRouter key; see below)
FMI_OPENROUTER_API_KEY=... node src/run.mjs --from-catalog --max 15
FMI_OPENROUTER_API_KEY=... node src/run.mjs --models google/gemma-4-31b-it:free

# Turn the day files into data/daily/YYYY-MM-DD.json
node src/rollup.mjs
```

Records go to `data/probes/YYYY-MM-DD.jsonl`, one line per probe; the rollup writes `data/daily/`.

### The key

The key is read from `FMI_OPENROUTER_API_KEY` on purpose, never `OPENROUTER_API_KEY`. OpenRouter's free-model limits are per account (20 requests a minute; 50 a day with under 10 credits purchased, 1,000 a day with 10 or more), and extra keys on one account do not raise them. The index needs **its own account and key**, or its probes would use up the allowance of every other tool, and those tools' traffic would distort the index.

### Where the key goes

1. Make a **new** OpenRouter account just for this (a different email from your other tools), and create a key at https://openrouter.ai/keys. Do not buy credits: the free allowance (50 requests a day) covers the 12 models three times a day.
2. **On your computer:** copy `.env.example` to `.env`, paste the key after `FMI_OPENROUTER_API_KEY=`, and run with Node's built-in env-file option:
   ```bash
   node --env-file=.env src/run.mjs --from-catalog --max 15
   ```
   `.env` is in `.gitignore`, so it is never committed. (Or `export FMI_OPENROUTER_API_KEY=...` in your shell for one session.)
3. **On GitHub (when the scheduler is added):** repository Settings, Secrets and variables, Actions, New repository secret, named `FMI_OPENROUTER_API_KEY`. Never put the key in a file in the repo, an issue or a workflow.

### Safety guards

- A model is probed only if its id ends in `:free` **and** the live catalogue prices it at zero for both prompt and completion. Anything else is refused before a request is sent, so a probe can never spend money.
- A daily allowance (default 45) is counted from the day's file, so it holds across runs. The run paces itself at 3.5 s a request, and stops when our own account hits its limit or the key is refused.
- The default list leaves out free models that are not general chat models (safety classifiers, embedders, speech, OCR and code-only models: the same exclusions Lodestone applies), and the dry run names them.

## Licences

- **Code:** [Apache-2.0](LICENSE).
- **Data** (everything under `data/`): [CC BY 4.0](LICENSE-DATA.md). Cite it as "Free Model Index, Extrafemi, <date>".

It depends on one package, [`@extrafemi-ai/lodestone`](https://www.npmjs.com/package/@extrafemi-ai/lodestone), for its rate-limit reader and JSON parser, so the index classifies failures exactly as the library does.
