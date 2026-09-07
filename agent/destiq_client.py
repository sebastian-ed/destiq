#!/usr/bin/env python3
"""Cliente de solo lectura para DestIQ usando la API REST de Supabase.

No modifica datos. Usa únicamente stdlib para poder ejecutarse sin instalar requests.
"""
from __future__ import annotations

import json
import os
import statistics
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional

DEFAULT_SUPABASE_URL = "https://ozjgsfojqvtcnrtfhorr.supabase.co"
DEFAULT_PUBLISHABLE_KEY = "sb_publishable_Laor_XKXrXTUJqlXnBK8fg_PCmx6-AH"


class DestIQClient:
    def __init__(self, url: Optional[str] = None, key: Optional[str] = None, timeout: int = 30):
        self.url = (url or os.getenv("DESTIQ_SUPABASE_URL") or DEFAULT_SUPABASE_URL).rstrip("/")
        self.key = key or os.getenv("DESTIQ_SUPABASE_KEY") or DEFAULT_PUBLISHABLE_KEY
        self.timeout = timeout

    @property
    def rest_base(self) -> str:
        return f"{self.url}/rest/v1"

    def _get(self, table: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        query = urllib.parse.urlencode([(k, str(v)) for k, v in params.items() if v is not None])
        req = urllib.request.Request(
            f"{self.rest_base}/{table}?{query}",
            headers={"apikey": self.key, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _paged(self, table: str, params: Dict[str, Any], page_size: int = 1000) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        offset = 0
        while True:
            page_params = dict(params)
            page_params["limit"] = page_size
            page_params["offset"] = offset
            page = self._get(table, page_params)
            out.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
        return out

    def destinations(self) -> List[Dict[str, Any]]:
        return self._paged("destinations", {"select": "*", "order": "sort_order.asc,name.asc"})

    def indicators(self, destination_id: Optional[str] = None, metric_key: Optional[str] = None) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"select": "*", "order": "destination_id.asc,sort_order.asc,name.asc"}
        if destination_id:
            params["destination_id"] = f"eq.{destination_id}"
        if metric_key:
            params["metric_key"] = f"eq.{metric_key}"
        return self._paged("indicators", params)

    def data_points(self, indicator_id: str, year_from: Optional[int] = None, year_to: Optional[int] = None) -> List[Dict[str, Any]]:
        # PostgREST no permite repetir la misma clave en un dict; para rango amplio filtramos localmente.
        rows = self._paged(
            "data_points",
            {"select": "*", "indicator_id": f"eq.{indicator_id}", "order": "year.asc,month.asc"},
        )
        if year_from is not None:
            rows = [r for r in rows if int(r.get("year", 0)) >= int(year_from)]
        if year_to is not None:
            rows = [r for r in rows if int(r.get("year", 0)) <= int(year_to)]
        return rows

    def destination_by_name(self, value: str) -> Optional[Dict[str, Any]]:
        q = (value or "").strip().casefold()
        for d in self.destinations():
            if str(d.get("name", "")).casefold() == q or str(d.get("slug", "")).casefold() == q or str(d.get("id", "")).casefold() == q:
                return d
        return None

    def indicator_by_ref(self, indicator_id: Optional[str] = None, metric_key: Optional[str] = None, destination: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if indicator_id:
            rows = self._get("indicators", {"select": "*", "id": f"eq.{indicator_id}", "limit": 1})
            return rows[0] if rows else None
        dest_id = None
        if destination:
            d = self.destination_by_name(destination)
            if not d:
                return None
            dest_id = d["id"]
        rows = self.indicators(destination_id=dest_id, metric_key=metric_key) if metric_key else self.indicators(destination_id=dest_id)
        return rows[0] if len(rows) == 1 else None

    def catalog(self) -> Dict[str, Any]:
        destinations = self.destinations()
        indicators = self.indicators()
        by_dest = defaultdict(list)
        for i in indicators:
            by_dest[i.get("destination_id")].append({
                "id": i.get("id"),
                "name": i.get("name"),
                "unit": i.get("unit"),
                "metric_key": i.get("metric_key"),
                "group_title": i.get("group_title"),
                "annual_calc_mode": i.get("annual_calc_mode") or "sum",
            })
        return {
            "destinations": [
                {"id": d.get("id"), "name": d.get("name"), "slug": d.get("slug"), "indicators": by_dest.get(d.get("id"), [])}
                for d in destinations
            ],
            "unassigned_indicators": by_dest.get(None, []),
        }

    def search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        needle = (query or "").strip().casefold()
        if not needle:
            return []
        destinations = {d["id"]: d for d in self.destinations()}
        hits = []
        for i in self.indicators():
            haystack = " ".join(str(i.get(k) or "") for k in ("name", "description", "unit", "metric_key", "group_title", "methodology_note")).casefold()
            dest = destinations.get(i.get("destination_id"))
            if dest:
                haystack += " " + str(dest.get("name", "")).casefold()
            if needle in haystack:
                hits.append({**i, "destination": dest})
                if len(hits) >= limit:
                    break
        return hits

    @staticmethod
    def _by_year(points: Iterable[Dict[str, Any]]) -> Dict[int, List[Optional[float]]]:
        out: Dict[int, List[Optional[float]]] = {}
        for p in points:
            year = int(p["year"])
            month = int(p["month"])
            if year not in out:
                out[year] = [None] * 12
            raw = p.get("value")
            out[year][month - 1] = None if raw is None else float(raw)
        return out

    @staticmethod
    def _annual_simple(mode: str, values: List[Optional[float]]) -> Optional[float]:
        clean = [float(v) for v in values if v is not None]
        if mode == "none" or not clean:
            return None
        if mode == "sum": return sum(clean)
        if mode == "average": return sum(clean) / len(clean)
        if mode == "last_value":
            for value in reversed(values):
                if value is not None:
                    return float(value)
            return None
        if mode == "max": return max(clean)
        if mode == "min": return min(clean)
        return sum(clean)

    def indicator_series(self, indicator: Dict[str, Any], year_from: Optional[int] = None, year_to: Optional[int] = None) -> Dict[str, Any]:
        points = self.data_points(indicator["id"], year_from, year_to)
        by_year = self._by_year(points)
        mode = indicator.get("annual_calc_mode") or "sum"
        annual: Dict[str, Optional[float]] = {}

        related: Dict[str, Dict[int, List[Optional[float]]]] = {}
        if mode == "ratio_of_sums":
            for key in (indicator.get("formula_numerator_key"), indicator.get("formula_denominator_key")):
                if not key:
                    continue
                matches = self.indicators(destination_id=indicator.get("destination_id"), metric_key=str(key))
                if matches:
                    related[str(key)] = self._by_year(self.data_points(matches[0]["id"], year_from, year_to))

        for year, values in sorted(by_year.items()):
            if mode == "ratio_of_sums":
                nk = str(indicator.get("formula_numerator_key") or "")
                dk = str(indicator.get("formula_denominator_key") or "")
                nvals = [v for v in related.get(nk, {}).get(year, []) if v is not None]
                dvals = [v for v in related.get(dk, {}).get(year, []) if v is not None]
                den = sum(dvals)
                mult = float(indicator.get("formula_multiplier") or 1)
                annual[str(year)] = None if not den else (sum(nvals) / den) * mult
            else:
                annual[str(year)] = self._annual_simple(mode, values)

        yearly_stats: Dict[str, Any] = {}
        prev_annual: Optional[float] = None
        for year, values in sorted(by_year.items()):
            clean = [float(v) for v in values if v is not None]
            av = annual.get(str(year))
            row: Dict[str, Any] = {"count": len(clean), "annual_value": av}
            if clean:
                row.update({
                    "sum": sum(clean),
                    "mean": sum(clean) / len(clean),
                    "median": statistics.median(clean),
                    "min": min(clean),
                    "max": max(clean),
                    "std_dev_population": statistics.pstdev(clean) if len(clean) > 0 else None,
                })
            if av is not None and prev_annual not in (None, 0):
                row["yoy_annual_pct"] = ((av - prev_annual) / abs(prev_annual)) * 100
            if av is not None:
                prev_annual = av
            yearly_stats[str(year)] = row

        return {
            "indicator": indicator,
            "monthly_points": points,
            "monthly_by_year": {str(y): vals for y, vals in sorted(by_year.items())},
            "annual_values": annual,
            "yearly_stats": yearly_stats,
            "annual_rule": {
                "mode": mode,
                "formula_numerator_key": indicator.get("formula_numerator_key"),
                "formula_denominator_key": indicator.get("formula_denominator_key"),
                "formula_multiplier": indicator.get("formula_multiplier"),
            },
        }

    def destination_dataset(self, destination: str, year_from: Optional[int] = None, year_to: Optional[int] = None) -> Dict[str, Any]:
        dest = self.destination_by_name(destination)
        if not dest:
            raise ValueError(f"Destino no encontrado: {destination}")
        indicators = self.indicators(destination_id=dest["id"])
        return {
            "destination": dest,
            "indicator_count": len(indicators),
            "series": [self.indicator_series(i, year_from, year_to) for i in indicators],
        }

    def compare_metric(self, metric_key: str, year: Optional[int] = None) -> Dict[str, Any]:
        destinations = {d["id"]: d for d in self.destinations()}
        indicators = self.indicators(metric_key=metric_key)
        rows = []
        for indicator in indicators:
            series = self.indicator_series(indicator, year, year)
            if year is not None:
                value = series["annual_values"].get(str(year))
                rows.append({"destination": destinations.get(indicator.get("destination_id")), "indicator": indicator, "year": year, "annual_value": value})
            else:
                rows.append({"destination": destinations.get(indicator.get("destination_id")), "indicator": indicator, "annual_values": series["annual_values"]})
        if year is not None:
            rows.sort(key=lambda r: (r["annual_value"] is None, -(r["annual_value"] or 0)))
        return {"metric_key": metric_key, "year": year, "results": rows}
