import { PROMPT } from '../src/spec.mjs';

export const GOOD = JSON.stringify({ title: 'Senior Data Engineer', remote: true });
/** An OpenRouter-shaped chat completion body. */
export const completion = (content, extra = {}) => JSON.stringify({ id: 'x', provider: 'Fake', choices: [{ message: { role: 'assistant', content } }], ...extra });
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const respond = (status, body, headers = {}) => new Response(body, { status, headers });
/** A fetch that answers every request with the given response, and keeps the requests it saw. */
export const fakeFetch = (make) => { const calls = []; const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return make(calls.length, JSON.parse(init.body)); }; f.calls = calls; return f; };
export { PROMPT };
