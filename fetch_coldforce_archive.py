#!/usr/bin/env python3
"""Fetch coldforce.bsky.social post metadata from Internet Archive snapshots into JSON."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

CDX_BASE = "https://web.archive.org/cdx/search/cdx"
POST_RE = re.compile(
    r"^https://bsky\.app/profile/coldforce\.bsky\.social/post/(3[a-z0-9]+)$"
)
MAX_ALT_SNAPSHOTS = 25
FETCH_RETRIES = 5
USER_AGENT = "coldforce-archive-fetch/1.2"

META = {
    "og:description": re.compile(
        r'<meta\s+property="og:description"\s+content="([^"]*)"', re.I
    ),
    "og:title": re.compile(r'<meta\s+property="og:title"\s+content="([^"]*)"', re.I),
    "article:published_time": re.compile(
        r'<meta\s+property="article:published_time"\s+content="([^"]*)"', re.I
    ),
    "twitter:value1": re.compile(
        r'<meta\s+name="twitter:value1"\s+content="([^"]*)"', re.I
    ),
    "twitter:value2": re.compile(
        r'<meta\s+name="twitter:value2"\s+content="([^"]*)"', re.I
    ),
    "profile:username": re.compile(
        r'<meta\s+property="profile:username"\s+content="([^"]*)"', re.I
    ),
}


def fetch_cdx_all() -> list[list]:
    qs = urllib.parse.urlencode(
        {
            "url": "bsky.app/profile/coldforce.bsky.social/post/",
            "matchType": "prefix",
            "output": "json",
            "limit": "20000",
            "page": "0",
        }
    )
    url = f"{CDX_BASE}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data or len(data) < 2:
        return []
    _header, *rows = data
    return rows


def snapshots_by_rkey(rows: list[list]) -> dict[str, list[tuple[str, str]]]:
    """rkey -> ordered list of (timestamp, original_url), best first."""
    raw: dict[str, list[tuple[int, int, str, str]]] = {}
    for row in rows:
        if len(row) < 5:
            continue
        _uk, ts, original, mimetype, status = row[0], row[1], row[2], row[3], row[4]
        m = POST_RE.match(original)
        if not m:
            continue
        rkey = m.group(1)
        try:
            st = int(status) if status != "-" else 0
        except ValueError:
            st = 0
        ok = 1 if (mimetype == "text/html" and st == 200) else 0
        ts_int = int(ts)
        raw.setdefault(rkey, []).append((ok, ts_int, ts, original))

    out: dict[str, list[tuple[str, str]]] = {}
    for rkey, cands in raw.items():
        cands_sorted = sorted(cands, key=lambda x: (x[0], x[1]), reverse=True)
        ordered: list[tuple[str, str]] = []
        seen: set[str] = set()
        for _ok, _ti, ts, original in cands_sorted:
            if ts in seen:
                continue
            seen.add(ts)
            ordered.append((ts, original))
        out[rkey] = ordered[:MAX_ALT_SNAPSHOTS]
    return out


def fetch_wayback_html(timestamp: str, original: str) -> str:
    wb = f"https://web.archive.org/web/{timestamp}/{original}"
    req = urllib.request.Request(wb, headers={"User-Agent": USER_AGENT})
    last_err: Exception | None = None
    for attempt in range(FETCH_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, OSError) as e:
            last_err = e
            time.sleep(min(8.0, 0.8 * (2**attempt)))
    assert last_err is not None
    raise last_err


def extract_meta(html: str) -> dict:
    out: dict[str, str] = {}
    for key, rx in META.items():
        m = rx.search(html)
        if m:
            val = m.group(1)
            val = val.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
            out[key] = val
    return out


def fetch_post(rkey: str, alternatives: list[tuple[str, str]]) -> dict:
    last_meta: dict = {"error": "no snapshots"}
    for ts, original in alternatives:
        wb_url = f"https://web.archive.org/web/{ts}/{original}"
        try:
            html = fetch_wayback_html(ts, original)
            meta = extract_meta(html)
            if meta.get("og:description") or meta.get("og:title"):
                return {
                    "rkey": rkey,
                    "bsky_url": original,
                    "wayback_url": wb_url,
                    "wayback_timestamp": ts,
                    "meta": meta,
                }
            last_meta = {
                **meta,
                "error": "snapshot_missing_og_tags",
            }
        except Exception as e:
            last_meta = {"error": str(e), "attempt_wayback_url": wb_url}
    return {
        "rkey": rkey,
        "bsky_url": alternatives[0][1] if alternatives else "",
        "wayback_url": f"https://web.archive.org/web/{alternatives[0][0]}/{alternatives[0][1]}"
        if alternatives
        else "",
        "wayback_timestamp": alternatives[0][0] if alternatives else "",
        "meta": last_meta,
    }


def main() -> None:
    print("Fetching CDX index…", flush=True)
    rows = fetch_cdx_all()
    by_rkey = snapshots_by_rkey(rows)
    print(f"Unique post URLs: {len(by_rkey)}", flush=True)

    posts: list[dict] = []
    total = len(by_rkey)
    for i, rkey in enumerate(sorted(by_rkey.keys()), 1):
        posts.append(fetch_post(rkey, by_rkey[rkey]))
        if i % 25 == 0 or i == total:
            print(f"  fetched {i}/{total}", flush=True)
        time.sleep(0.12)

    out_path = "coldforce_posts.json"
    payload = {
        "source": "Internet Archive Wayback Machine",
        "profile": "coldforce.bsky.social",
        "did": "did:plc:qw4v6s32fxfdzkn6bbykzwru",
        "note": "Post text primarily from og:description in archived HTML; may be truncated. Fetched sequentially with HTTPS and retries to avoid connection failures.",
        "post_count": len(posts),
        "posts": sorted(posts, key=lambda p: p["wayback_timestamp"]),
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path}", flush=True)


if __name__ == "__main__":
    main()
