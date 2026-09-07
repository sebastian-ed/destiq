#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from destiq_client import DestIQClient


def dump(value):
    print(json.dumps(value, ensure_ascii=False, indent=2, default=str))


def main():
    p = argparse.ArgumentParser(description="Cliente CLI de solo lectura para DestIQ")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("destinations")
    sub.add_parser("catalog")

    pi = sub.add_parser("indicators")
    pi.add_argument("--destination")
    pi.add_argument("--metric-key")

    ps = sub.add_parser("search")
    ps.add_argument("query")
    ps.add_argument("--limit", type=int, default=50)

    pg = sub.add_parser("series")
    pg.add_argument("--indicator-id")
    pg.add_argument("--metric-key")
    pg.add_argument("--destination")
    pg.add_argument("--from-year", type=int)
    pg.add_argument("--to-year", type=int)

    pd = sub.add_parser("destination-data")
    pd.add_argument("destination")
    pd.add_argument("--from-year", type=int)
    pd.add_argument("--to-year", type=int)

    pc = sub.add_parser("compare")
    pc.add_argument("metric_key")
    pc.add_argument("--year", type=int)

    args = p.parse_args()
    c = DestIQClient()

    if args.command == "destinations":
        dump(c.destinations())
    elif args.command == "catalog":
        dump(c.catalog())
    elif args.command == "indicators":
        dest_id = None
        if args.destination:
            d = c.destination_by_name(args.destination)
            if not d:
                raise SystemExit(f"Destino no encontrado: {args.destination}")
            dest_id = d["id"]
        dump(c.indicators(dest_id, args.metric_key))
    elif args.command == "search":
        dump(c.search(args.query, args.limit))
    elif args.command == "series":
        indicator = c.indicator_by_ref(args.indicator_id, args.metric_key, args.destination)
        if not indicator:
            raise SystemExit("Indicador no encontrado o referencia ambigua. Usá --indicator-id, o --metric-key junto con --destination.")
        dump(c.indicator_series(indicator, args.from_year, args.to_year))
    elif args.command == "destination-data":
        dump(c.destination_dataset(args.destination, args.from_year, args.to_year))
    elif args.command == "compare":
        dump(c.compare_metric(args.metric_key, args.year))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
