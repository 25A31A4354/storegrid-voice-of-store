"""Weekly one-page brief per region: top 5 issues, evidence quotes, affected stores, trend vs last week.

Reads the same files the submission is built from (feedback, predictions, emerging flags, store master,
taxonomy) so the brief and the scored output can never disagree.

    python brief.py --feedback data/feedback.csv --predictions submission/R5_predictions.csv \
        --flags submission/R5_emerging_flags.csv --week 2026-09-21 --out-dir briefs
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

import pandas as pd

from detector import extract_localities, resolve_store_id

SEVERITY_WEIGHT = {"low": 1, "medium": 2, "high": 4, "critical": 8}
SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
TREND_MIN_RELATIVE_CHANGE = 0.25  # fewer than +-25% (and < 2 reports) reads as flat
TOP_ISSUES = 5
QUOTES_PER_ISSUE = 2
QUOTE_MAX_CHARS = 150

ESCALATION_RULE = (
    "Escalate to the owning function today when severity is high/critical (safety, allergen, hygiene, "
    "misconduct are always high by policy), or the issue hits 3+ stores in the region, or the detector "
    "raised an emerging flag. Everything else goes into the owner's weekly queue."
)
PAGE_CSS = """
body{font:14px/1.45 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1b1f23}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:18px 0 6px}small,.muted{color:#586069}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e1e4e8;padding:6px 8px;text-align:left;vertical-align:top}
.sev-high,.sev-critical{color:#b31d28;font-weight:600}.flag{background:#fff8c5;padding:6px 8px;margin:4px 0}
blockquote{margin:2px 0;color:#444}.rule{background:#f6f8fa;padding:8px;margin-top:14px}
@media print{body{margin:0}}
"""


def customer_quote(text: str) -> str:
    """Call-centre transcripts are 'Agent: ... Customer: ...'; keep the first customer line."""
    match = re.search(r"Customer:\s*(.+?)(?=\s*Agent:|$)", text, flags=re.DOTALL)
    line = (match.group(1) if match else text).replace("[inaudible]", "").strip()
    return line if len(line) <= QUOTE_MAX_CHARS else line[: QUOTE_MAX_CHARS - 1].rstrip() + "…"


def trend_arrow(current: int, previous: int) -> str:
    change = current - previous
    if abs(change) < 2 and abs(change) < TREND_MIN_RELATIVE_CHANGE * max(previous, 1):
        return "→"
    return "↑" if change > 0 else "↓"


def build_frame(feedback: pd.DataFrame, predictions: pd.DataFrame, stores: pd.DataFrame) -> pd.DataFrame:
    """Joins predictions onto feedback, attributes each record to a store (id or locality in text), adds region."""
    loc_map = extract_localities(stores)
    df = feedback.merge(predictions, on="feedback_id")
    df["store"] = df.apply(lambda row: resolve_store_id(row, loc_map), axis=1)
    df["week_start"] = pd.to_datetime(df["created_at"]).dt.to_period("W-SUN").dt.start_time
    df = df.merge(
        stores[["store_id", "store_name", "region"]],
        left_on="store",
        right_on="store_id",
        how="left",
        suffixes=("", "_master"),
    )
    return df[(df["actionable"] == 1) & df["region"].notna()]


def region_issues(df: pd.DataFrame, region: str, week: pd.Timestamp, taxonomy: pd.DataFrame) -> list[dict]:
    """Top issues for one region and week, ranked by severity-weighted report count."""
    in_region = df[df["region"] == region]
    this_week = in_region[in_region["week_start"] == week]
    last_week = in_region[in_region["week_start"] == week - pd.Timedelta(days=7)]
    previous = last_week.groupby("issue_type_id").size()

    rows = []
    for issue, group in this_week.groupby("issue_type_id"):
        score = group["severity"].map(SEVERITY_WEIGHT).sum()
        top_severity = max(group["severity"], key=SEVERITY_RANK.get)
        stores = group.groupby("store_name").size().sort_values(ascending=False)
        quotes = group.assign(n=group["text"].str.len()).sort_values("n").head(QUOTES_PER_ISSUE)
        rows.append(
            {
                "issue": issue,
                "name": taxonomy.loc[issue, "issue_type"],
                "owner": taxonomy.loc[issue, "owner_function"],
                "severity": top_severity,
                "count": len(group),
                "trend": trend_arrow(len(group), int(previous.get(issue, 0))),
                "previous": int(previous.get(issue, 0)),
                "stores": [f"{name} ({n})" for name, n in stores.head(3).items()],
                "n_stores": len(stores),
                "quotes": [(row.feedback_id, customer_quote(row.text)) for row in quotes.itertuples()],
                "score": score,
            }
        )
    return sorted(rows, key=lambda r: (-r["score"], r["issue"]))[:TOP_ISSUES]


def region_flags(flags: pd.DataFrame, week: pd.Timestamp, stores: pd.DataFrame, region: str) -> pd.DataFrame:
    """Emerging-issue flags raised this week for stores in `region`."""
    region_stores = set(stores.loc[stores["region"] == region, "store_id"])
    return flags[(flags["as_of_week_start"] == week.strftime("%Y-%m-%d")) & flags["store_id"].isin(region_stores)]


def region_summary(
    region: str,
    week: pd.Timestamp,
    issues: list[dict],
    flags: pd.DataFrame,
    stores: pd.DataFrame,
    taxonomy: pd.DataFrame,
    total: int,
) -> dict:
    """Same content as the HTML page, as plain data for the in-app viewer."""
    names = dict(zip(stores["store_id"], stores["store_name"]))
    return {
        "region": region,
        "file": f"{region.lower()}_{week:%Y-%m-%d}.html",
        "total": total,
        "issues": [{**item, "quotes": [{"id": fid, "text": q} for fid, q in item["quotes"]]} for item in issues],
        "flags": [
            {
                "store": names[f.store_id],
                "issue": f.issue_type_id,
                "name": taxonomy.loc[f.issue_type_id, "issue_type"],
                "reports": len(f.evidence_feedback_ids.split(";")),
                "confidence": f.confidence,
            }
            for f in region_flags(flags, week, stores, region).itertuples()
        ],
    }


def render_region(
    region: str,
    week: pd.Timestamp,
    issues: list[dict],
    flags: pd.DataFrame,
    stores: pd.DataFrame,
    taxonomy: pd.DataFrame,
    total: int,
) -> str:
    esc = html.escape
    end = week + pd.Timedelta(days=6)
    names = dict(zip(stores["store_id"], stores["store_name"]))
    week_flags = region_flags(flags, week, stores, region)

    parts = [
        f"<!doctype html><meta charset=utf-8><title>{esc(region)} brief {week:%Y-%m-%d}</title>",
        f"<style>{PAGE_CSS}</style>",
        f"<h1>Saffron Retail · {esc(region)} region · weekly brief</h1>",
        f"<small>{week:%d %b} – {end:%d %b %Y} · {total} actionable reports · built from model-labelled feedback</small>",
        (
            "<h2>Top issues</h2><table><tr><th>#</th><th>Issue → owner</th><th>Severity</th><th>Reports</th>"
            "<th>Trend vs last week</th><th>Affected stores</th></tr>"
        ),
    ]
    for rank, item in enumerate(issues, 1):
        quotes = "".join(f"<blockquote>“{esc(q)}” <small>{esc(fid)}</small></blockquote>" for fid, q in item["quotes"])
        parts.append(
            f"<tr><td>{rank}</td><td><b>{esc(item['issue'])} {esc(item['name'])}</b><br>→ {esc(item['owner'])}{quotes}</td>"
            f"<td class='sev-{item['severity']}'>{item['severity']}</td><td>{item['count']}</td>"
            f"<td>{item['trend']} {item['previous']} → {item['count']}</td>"
            f"<td>{esc(', '.join(item['stores']))}{' +more' if item['n_stores'] > 3 else ''}</td></tr>"
        )
    parts.append("</table><h2>Emerging at a single store</h2>")
    if week_flags.empty:
        parts.append("<p class=muted>No emerging-issue flags this week.</p>")
    for flag in week_flags.itertuples():
        parts.append(
            f"<div class=flag><b>{esc(names[flag.store_id])}</b> · {esc(flag.issue_type_id)} "
            f"{esc(taxonomy.loc[flag.issue_type_id, 'issue_type'])} · "
            f"{len(flag.evidence_feedback_ids.split(';'))} cited reports · confidence {flag.confidence}</div>"
        )
    parts.append(f"<div class=rule><b>Escalation rule.</b> {esc(ESCALATION_RULE)}</div>")
    return "\n".join(parts)


def parse_args(argv=None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--feedback", type=Path, required=True)
    ap.add_argument("--predictions", type=Path, required=True)
    ap.add_argument("--flags", type=Path, required=True)
    ap.add_argument("--week", help="Monday of the week to brief (default: latest week in the data)")
    ap.add_argument("--out-dir", type=Path, default=Path("briefs"))
    return ap.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    data_dir = args.feedback.resolve().parent
    feedback = pd.read_csv(args.feedback, dtype={"store_id": str})
    predictions = pd.read_csv(args.predictions)
    flags = pd.read_csv(args.flags)
    stores = pd.read_csv(data_dir / "store_master.csv")
    taxonomy = pd.read_csv(data_dir / "issue_taxonomy.csv").set_index("issue_type_id")

    df = build_frame(feedback, predictions, stores)
    week = pd.Timestamp(args.week) if args.week else df["week_start"].max()
    week = week - pd.Timedelta(days=week.weekday())
    args.out_dir.mkdir(parents=True, exist_ok=True)
    summaries = []
    for region in sorted(stores["region"].unique()):
        issues = region_issues(df, region, week, taxonomy)
        total = int(((df["region"] == region) & (df["week_start"] == week)).sum())
        page = render_region(region, week, issues, flags, stores, taxonomy, total)
        (args.out_dir / f"{region.lower()}_{week:%Y-%m-%d}.html").write_text(page, encoding="utf-8")
        summaries.append(region_summary(region, week, issues, flags, stores, taxonomy, total))
        print(f"{region}: {len(issues)} issues, {total} reports")
    (args.out_dir / "briefs.json").write_text(
        json.dumps(
            {"week": f"{week:%Y-%m-%d}", "escalationRule": ESCALATION_RULE, "regions": summaries},
            indent=1,
            default=lambda o: o.item(),
        ),  # numpy scalars from pandas
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
