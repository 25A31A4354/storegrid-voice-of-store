"""Builds a dashboard-ready CSV slice from the R5 feedback so the demo shows real Saffron stores.

The dashboard importer needs a store on every row, but many online reviews and app comments have none.
This resolves the store from the locality named in the text (same rule the detector uses), fills in
store name, city and region, and drops rows that still cannot be routed. Output stays under the
importer's row cap.

    python make_demo_csv.py --feedback data/feedback.csv --weeks 2 --out demo_slice.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from detector import extract_localities, resolve_store_id

MAX_ROWS = 5000  # backend MAX_CSV_RECORDS default


def build_slice(feedback: pd.DataFrame, stores: pd.DataFrame, weeks: int, shift_to_today: bool = False) -> pd.DataFrame:
    """
    Latest `weeks` weeks of feedback, with store name, city and region attached.
    `shift_to_today` moves every timestamp forward by a whole number of weeks so the slice ends this
    week and shows up under the dashboard's relative date filters (weekdays are preserved).
    """
    loc_map = extract_localities(stores)
    cutoff = pd.to_datetime(feedback["created_at"]).max().normalize() - pd.Timedelta(days=7 * weeks - 1)
    recent = feedback[pd.to_datetime(feedback["created_at"]) >= cutoff].copy()
    recent["store_code"] = recent.apply(lambda row: resolve_store_id(row, loc_map), axis=1)
    recent = recent.dropna(subset=["store_code"]).merge(
        stores[["store_id", "store_name", "city", "region"]], left_on="store_code", right_on="store_id"
    )
    out = recent.rename(columns={"channel": "source_type", "created_at": "timestamp"})
    if shift_to_today:
        stamps = pd.to_datetime(out["timestamp"])
        weeks_behind = (pd.Timestamp.now().normalize() - stamps.max().normalize()).days // 7
        out["timestamp"] = (stamps + pd.Timedelta(days=7 * weeks_behind)).dt.strftime("%Y-%m-%dT%H:%M:%S")
    return out[["store_code", "store_name", "city", "region", "source_type", "timestamp", "rating", "text"]].head(
        MAX_ROWS
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--feedback", type=Path, required=True)
    ap.add_argument("--weeks", type=int, default=2)
    ap.add_argument("--out", type=Path, default=Path("demo_slice.csv"))
    ap.add_argument(
        "--shift-to-today", action="store_true", help="replay the slice as if it were this week (demo only)"
    )
    args = ap.parse_args(argv)

    feedback = pd.read_csv(args.feedback, dtype={"store_id": str})
    stores = pd.read_csv(args.feedback.resolve().parent / "store_master.csv")
    result = build_slice(feedback, stores, args.weeks, args.shift_to_today)
    result.to_csv(args.out, index=False)
    print(f"wrote {len(result)} rows to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
