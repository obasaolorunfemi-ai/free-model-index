# Methodology, version 1.0 (draft)

This document says exactly what the Free Model Index measures. A change to the probe, the validity rule, the timeouts or the outcome definitions bumps the version; every record carries the version it was taken under, and rates are never compared across versions without saying so.

## What is probed

Every model on OpenRouter whose id ends in `:free`, whose catalogue price is zero for prompt and completion, and which produces text, **except** free models that are not general chat models: ids matching safety, guard, moderation, embed, rerank, tts, whisper, ocr, code, coder, lyria or preview-audio. These are the same exclusions the Lodestone library applies when it chooses models. A classifier that answers "safe" to a job posting would look like a model that fails, which measures the probe, not the model. Excluded free models are named in each run's dry-run output and in each weekly update.

OpenRouter's router model (`openrouter/free`) is never probed: it picks a model for you, so it measures nothing about one model.

## The request

One fixed request, in `src/spec.mjs`, identified in each record by a hash of its text:

> Return only JSON with two keys, "title" (a string) and "remote" (a boolean), for this job posting: "Senior Data Engineer, remote (UK time zones), 5+ years of SQL."

Temperature 0, 200 maximum tokens, no system prompt, and no reasoning option. Models that spend thousands of tokens thinking before answering will therefore be slow or time out. That is a real result for a serverless tool, and it is why the probe sets nothing to change it.

## What counts as usable

The answer is *usable* if it parses as a JSON object (code fences are allowed), its `title` mentions a data engineer, and `remote` is exactly `true`, **and** the whole response arrived within 24 seconds (Lodestone's default serverless budget, under a common 30 s gateway limit). A valid answer between 24 s and the 45 s timeout is `usable_late`. The usable rate is the share of counted probes that were `usable`.

## Timing

Time is measured from the moment the request is sent to the last byte of the response body. It is not measured to the headers: OpenRouter sends headers early and the body seconds later, which made every model look faster in a first measurement on 28 October 2026. A probe that has not finished its whole response after 45 seconds is a `timeout`.

## Outcomes

| Outcome | Meaning |
|---|---|
| `usable` | a valid answer within 24 s |
| `usable_late` | a valid answer after 24 s, before the timeout |
| `unusable` | answered, but empty or failed the validity rule (the reason is recorded) |
| `timeout` | no complete response within 45 s |
| `rate_limited_upstream` | a 429 from the model's own provider |
| `rate_limited_other` | a 429 that could not be told apart |
| `withdrawn` | 404: the model is no longer offered |
| `unavailable` | a 5xx |
| `other` | anything else, with the status |
| `restricted` | 403: the model refuses direct API calls (for example it is offered only through approved apps). Recorded with OpenRouter's message, never counted: it says nothing about reliability |
| `probe_budget` | **our own account's** daily or per-minute limit. Recorded, never counted for or against the model |

OpenRouter's daily and per-minute limits apply to the whole account, so a 429 of that kind says nothing about a model. Only a limit from the model's own provider is the model's.

## What is stored

One line per probe: time started, method version, prompt hash, model, outcome, HTTP status, milliseconds, the length of the answer, the reason an answer was invalid, the provider named in the response, and the account's remaining allowance when OpenRouter reports it. **No model output is stored**, and the key is never written anywhere.

## Schedule

Probes run three times a day, at 00:07, 08:07 and 16:07 UTC, on GitHub's runners. A catalogue check runs every hour; a new free chat model is probed in that run, so it is measured the day it appears. The first catalogue check only records the models already listed. Free models that disappear are marked gone and kept in the history. GitHub's scheduler is best effort and may start a run late: the time in each record is when the probe was actually sent.

## Limits you should know about

- One prompt, one task. It says how a model does on this small structured call, not on anything else.
- Probes run from GitHub's runners, so latencies are not what a user in Lagos would see.
- Free tiers are rationed and change without notice. A low rate is not a bad model.
- Scheduled runs on GitHub can start late; every probe records the time it actually started.
- A model with fewer than 30 counted probes in a window is listed but not rated.

## Independence

We sell nothing whose price or availability depends on a model's rank, and we take no payment from any model provider or gateway. Extrafemi's own tools (KeyStone, Inkstone, TouchStone) and Naija Eval use these models, and Lodestone is the library that routes around the ones that fail. That is a reason we measure this and a reason to read it critically. The harness and the data are open so anyone can check. A wrong number is corrected in the open, with the old value kept in the history. OpenRouter has not reviewed this index.
