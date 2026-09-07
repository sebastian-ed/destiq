#!/usr/bin/env python3
"""Servidor MCP local de solo lectura para DestIQ.

Instalación: python -m pip install -r requirements.txt
Ejecución:   python mcp_server.py
"""
from __future__ import annotations

import json
from typing import Optional

from mcp.server.fastmcp import FastMCP
from destiq_client import DestIQClient

mcp = FastMCP("DestIQ")
client = DestIQClient()


def out(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


@mcp.tool()
def list_destinations() -> str:
    """Lista todos los destinos disponibles en DestIQ con id, nombre, slug y orden."""
    return out(client.destinations())


@mcp.tool()
def get_catalog() -> str:
    """Devuelve un catálogo compacto de destinos e indicadores, incluyendo metric_key y regla anual."""
    return out(client.catalog())


@mcp.tool()
def search_indicators(query: str, limit: int = 50) -> str:
    """Busca indicadores por nombre, descripción, unidad, metric_key, agrupador, metodología o destino."""
    return out(client.search(query, limit))


@mcp.tool()
def list_indicators(destination: Optional[str] = None, metric_key: Optional[str] = None) -> str:
    """Lista indicadores. destination puede ser nombre, slug o UUID. metric_key filtra indicadores comparables."""
    dest_id = None
    if destination:
        d = client.destination_by_name(destination)
        if not d:
            return out({"error": f"Destino no encontrado: {destination}"})
        dest_id = d["id"]
    return out(client.indicators(dest_id, metric_key))


@mcp.tool()
def get_indicator_series(
    indicator_id: Optional[str] = None,
    metric_key: Optional[str] = None,
    destination: Optional[str] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
) -> str:
    """Obtiene la serie mensual, observaciones, estadísticas y valor anual respetando la regla metodológica del indicador. Para metric_key, indicar también destination si hay más de un destino."""
    indicator = client.indicator_by_ref(indicator_id, metric_key, destination)
    if not indicator:
        return out({"error": "Indicador no encontrado o referencia ambigua. Usá indicator_id, o metric_key + destination."})
    return out(client.indicator_series(indicator, year_from, year_to))


@mcp.tool()
def get_destination_dataset(destination: str, year_from: Optional[int] = None, year_to: Optional[int] = None) -> str:
    """Obtiene todos los indicadores y series de un destino. Usar para análisis integral; puede devolver bastante información."""
    try:
        return out(client.destination_dataset(destination, year_from, year_to))
    except ValueError as exc:
        return out({"error": str(exc)})


@mcp.tool()
def compare_metric(metric_key: str, year: Optional[int] = None) -> str:
    """Compara un metric_key entre destinos. Si se indica year, calcula el valor anual según la regla configurada en cada indicador y ordena de mayor a menor."""
    return out(client.compare_metric(metric_key, year))


if __name__ == "__main__":
    mcp.run(transport="stdio")
