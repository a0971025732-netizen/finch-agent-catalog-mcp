// Daily job: fetch the US Treasury par yield curve and write data/treasury.json for the worker.
// treasury.gov blocks Cloudflare egress, so the worker reads this file from GitHub instead.
import { writeFileSync, mkdirSync } from "node:fs";

const KEEP = 70;

async function treasury(year) {
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 finch-agent-catalog" } });
  if (!r.ok) throw new Error(`treasury ${r.status}`);
  const lines = (await r.text()).trim().split(/\r?\n/);
  const head = lines[0].split(",").map((h) => h.replace(/"/g, ""));
  return lines.slice(1).map((l) => {
    const c = l.split(",");
    const o = { date: c[0] };
    head.slice(1).forEach((h, i) => { o[h] = c[i + 1] === "" ? null : Number(c[i + 1]); });
    return o;
  });
}

const year = new Date().getUTCFullYear();
let rows = await treasury(year);
if (rows.length < KEEP) rows = rows.concat(await treasury(year - 1));
if (!rows.length) throw new Error("no rows");
mkdirSync("data", { recursive: true });
writeFileSync("data/treasury.json", JSON.stringify({ source: "US Treasury daily par yield curve rates", updated_utc: new Date().toISOString(), rows: rows.slice(0, KEEP) }) + "\n");
console.log(`wrote ${Math.min(rows.length, KEEP)} rows, latest ${rows[0].date}`);
