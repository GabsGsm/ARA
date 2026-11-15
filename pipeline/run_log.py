"""Registro de rastreio de cada execução do pipeline (data/runs/<run_id>.json)."""
from __future__ import annotations

import json
import secrets
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "data" / "runs"


def _git_commit() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                                       stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return None


class Run:
    def __init__(self, script: str, params: dict):
        now = datetime.now(timezone.utc)
        self.data = {
            "run_id": now.strftime("%Y-%m-%dT%H-%MZ") + "-" + secrets.token_hex(2),
            "started_utc": now.isoformat(timespec="seconds"),
            "script": script,
            "code_version": _git_commit(),
            "params": params,
            "sources": [],
            "requests": [],
            "quality": {},
            "notes": [],
        }

    @property
    def id(self) -> str:
        return self.data["run_id"]

    def source(self, name: str, url: str | None = None, product_id: str | None = None,
               doi: str | None = None, license: str | None = None):
        entry = {"name": name, "url": url, "product_id": product_id, "doi": doi, "license": license,
                 "accessed_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        if entry not in self.data["sources"]:
            self.data["sources"].append(entry)

    def request(self, url: str, status: int | str, n: int | None = None):
        self.data["requests"].append({"url": url, "status": status, "n": n})

    def note(self, text: str):
        self.data["notes"].append(text)

    def save(self, outputs: list[str] | None = None) -> Path:
        self.data["finished_utc"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.data["outputs"] = outputs or []
        RUNS.mkdir(parents=True, exist_ok=True)
        path = RUNS / f"{self.id}.json"
        path.write_text(json.dumps(self.data, indent=1, ensure_ascii=False), encoding="utf-8")
        return path
