// Fast pre-check for scheduled runs (no npm install): is there a free YouTube slot within the
// look-ahead window? Writes make=true|false to $GITHUB_OUTPUT. Mirrors publishAtIso in upload.ts.
import fs from "node:fs";

const env = (k, d) => (process.env[k] ?? "").trim() || d;
const times = env("PUBLISH_TIMES", env("PUBLISH_TIME", "19:00")).split(",").map((t) => t.trim()).filter(Boolean).sort();
const off = Number(env("PUBLISH_UTC_OFFSET", "5")) * 3600_000;
const delay = Number(env("PUBLISH_DELAY_DAYS", "0"));
const lookahead = Number(env("SLOT_LOOKAHEAD_HOURS", "30"));
const history = JSON.parse(fs.readFileSync("data/history.json", "utf8"));
const taken = new Set(history.map((h) => h.publishAt).filter(Boolean));

const now = Date.now();
const local = new Date(now + off);
let slot = null;
outer: for (let d = delay; d < delay + 400; d++) {
  for (const t of times) {
    const [hh, mm] = t.split(":").map(Number);
    const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d, hh, mm) - off;
    if (target < now + 15 * 60_000) continue;
    const iso = new Date(target).toISOString();
    if (!taken.has(iso)) { slot = iso; break outer; }
  }
}
const hours = slot ? (new Date(slot).getTime() - now) / 3600_000 : Infinity;
const make = hours <= lookahead;
console.log(make ? `Next free slot ${slot} (${hours.toFixed(1)} h away): making an episode.` : `Queue full: next free slot ${slot} is ${hours.toFixed(0)} h away.`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `make=${make}\n`);
