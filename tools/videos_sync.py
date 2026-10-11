#!/usr/bin/env python3
"""Keep videos/catalog.json in step with the links pasted into videos/links.txt.

For every YouTube link it records what can be learned without an API key:
title and channel (oEmbed), duration, description, publish date and keywords
(watch page, best effort), a local thumbnail, and a transcript when YouTube
hands one out. That catalog is what Claude reads to "see" the videos before
writing videos/layout.json, which videos/index.html renders.

  python3 tools/videos_sync.py            fetch new links, drop removed ones
  python3 tools/videos_sync.py --refresh  re-fetch every link
  python3 tools/videos_sync.py --check    offline: validate layout.json vs catalog
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "videos"
LINKS = VIDEOS / "links.txt"
CATALOG = VIDEOS / "catalog.json"
LAYOUT = VIDEOS / "layout.json"
THUMBS = VIDEOS / "thumbs"
TRANSCRIPTS = VIDEOS / "transcripts"

ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
URL_RE = re.compile(r"(?:https?://)?(?:[\w-]+\.)*(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/\S+", re.I)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
TRANSCRIPT_LANGS = ["ro", "en"]


# ---------- links.txt ----------

def parse_start(value):
    """'90', '90s', '1m30s', '1h2m3s' -> seconds."""
    if not value:
        return 0
    if value.isdigit():
        return int(value)
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", value)
    if not m or not any(m.groups()):
        return 0
    h, mi, s = (int(g or 0) for g in m.groups())
    return h * 3600 + mi * 60 + s


def parse_url(raw):
    """Return (video_id, start_seconds, is_short) or None."""
    url = raw.rstrip(").,;]>\"'")
    if not re.match(r"https?://", url, re.I):
        url = "https://" + url
    u = urllib.parse.urlparse(url)
    host = u.netloc.lower()
    q = urllib.parse.parse_qs(u.query)
    parts = [p for p in u.path.split("/") if p]
    vid, short = None, False
    if host.endswith("youtu.be") and parts:
        vid = parts[0]
    elif "v" in q:
        vid = q["v"][0]
    elif len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v", "e"):
        vid, short = parts[1], parts[0] == "shorts"
    if not vid or not ID_RE.match(vid):
        return None
    start = parse_start((q.get("t") or q.get("start") or [""])[0])
    if not start and u.fragment.startswith("t="):
        start = parse_start(u.fragment[2:])
    return vid, start, short


def read_links():
    """Parse links.txt in order. Text on the same line as a link is kept as a note.
    Lines starting with '#' are comments."""
    entries = {}
    if not LINKS.exists():
        return []
    for line in LINKS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        found = [p for p in (parse_url(u) for u in URL_RE.findall(line)) if p]
        note = re.sub(r"[\s,;|()\[\]<>]+", " ", URL_RE.sub(" ", line)).strip(" -–—:") if found else ""
        if not found and ID_RE.match(line):
            found = [(line, 0, False)]
        for vid, start, short in found:
            if vid not in entries:
                entries[vid] = {"id": vid, "start": start, "short": short, "note": note}
    return list(entries.values())


# ---------- fetching ----------

def http_get(url, binary=False, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "ro,en;q=0.8",
        # skips the EU cookie-consent interstitial on the watch page
        "Cookie": "CONSENT=YES+cb; SOCS=CAI",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def fetch_oembed(vid):
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}")
    d = json.loads(http_get(url))
    return {
        "title": d.get("title"),
        "channel": d.get("author_name"),
        "channel_url": d.get("author_url"),
        "vertical": bool(d.get("width") and d.get("height") and d["height"] > d["width"]),
        "embeddable": True,
    }


def fetch_details(vid):
    html = http_get(f"https://www.youtube.com/watch?v={vid}&hl=ro")
    i = html.find("ytInitialPlayerResponse = ")
    if i < 0:
        raise ValueError("watch page has no player data (consent or bot check?)")
    data, _ = json.JSONDecoder().raw_decode(html, i + len("ytInitialPlayerResponse = "))
    vd = data.get("videoDetails") or {}
    if not vd:
        raise ValueError((data.get("playabilityStatus") or {}).get("reason") or "no videoDetails")
    mf = (data.get("microformat") or {}).get("playerMicroformatRenderer") or {}
    out = {
        "title_alt": vd.get("title"),
        "channel_alt": vd.get("author"),
        "duration": int(vd["lengthSeconds"]) if vd.get("lengthSeconds", "").isdigit() else None,
        "description": vd.get("shortDescription") or "",
        "keywords": vd.get("keywords") or [],
        "views": int(vd["viewCount"]) if vd.get("viewCount", "").isdigit() else None,
        "published": (mf.get("publishDate") or "")[:10] or None,
        "category": mf.get("category"),
        "live": bool(vd.get("isLiveContent")),
    }
    embeddable = (data.get("playabilityStatus") or {}).get("playableInEmbed")
    if embeddable is not None:
        out["embeddable"] = bool(embeddable)
    return out


def fetch_thumb(vid):
    THUMBS.mkdir(parents=True, exist_ok=True)
    last = None
    for name in ("maxresdefault", "sddefault", "hqdefault"):
        try:
            data = http_get(f"https://i.ytimg.com/vi/{vid}/{name}.jpg", binary=True)
        except urllib.error.HTTPError as e:
            last = e
            continue
        (THUMBS / f"{vid}.jpg").write_bytes(data)
        return f"thumbs/{vid}.jpg"
    raise last or ValueError("no thumbnail")


def fetch_transcript(vid):
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        raise RuntimeError("youtube-transcript-api not installed")
    listing = YouTubeTranscriptApi().list(vid)
    try:
        t = listing.find_transcript(TRANSCRIPT_LANGS)
    except Exception:
        t = next(iter(listing))
    rows = t.fetch().to_raw_data()
    # merge captions into ~30s paragraphs so the file reads like text, not subtitles
    lines, buf, block_start = [], [], None
    for r in rows:
        if block_start is None:
            block_start = r["start"]
        buf.append(r["text"].replace("\n", " ").strip())
        if r["start"] + r.get("duration", 0) - block_start >= 30:
            lines.append(f"[{fmt_time(block_start)}] {' '.join(buf)}")
            buf, block_start = [], None
    if buf:
        lines.append(f"[{fmt_time(block_start)}] {' '.join(buf)}")
    TRANSCRIPTS.mkdir(parents=True, exist_ok=True)
    (TRANSCRIPTS / f"{vid}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"file": f"transcripts/{vid}.txt", "lang": t.language_code, "auto": t.is_generated}


def fmt_time(s):
    s = int(s)
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def err(e):
    return f"{type(e).__name__}: {e}"[:300]


def fetch_all(entry, old):
    """Fill entry with everything fetchable; keep previous values where a step fails."""
    vid = entry["id"]
    v = {**{k: old.get(k) for k in ("title", "channel", "channel_url", "vertical", "duration", "description",
                                     "keywords", "views", "published", "category", "live", "embeddable",
                                     "thumb", "transcript")},
         **entry}
    errors = {}
    try:
        v.update(fetch_oembed(vid))
    except urllib.error.HTTPError as e:
        # 401/403: the owner disabled embedding; 404: private or deleted
        errors["oembed"] = f"HTTP {e.code}"
        if e.code in (401, 403):
            v["embeddable"] = False
    except Exception as e:
        errors["oembed"] = err(e)
    try:
        d = fetch_details(vid)
        # oEmbed's title is the original; the watch page may serve a translated one
        v["title"] = v.get("title") or d.get("title_alt")
        v["channel"] = v.get("channel") or d.get("channel_alt")
        v.update({k: val for k, val in d.items() if not k.endswith("_alt")})
    except Exception as e:
        errors["details"] = err(e)
    try:
        v["thumb"] = fetch_thumb(vid)
    except Exception as e:
        errors["thumb"] = err(e)
    try:
        v["transcript"] = fetch_transcript(vid)
    except Exception as e:
        errors["transcript"] = err(e)
    if v.get("title"):
        v["status"] = "ok"
    elif errors.get("oembed", "").startswith("HTTP 4") and "details" in errors:
        v["status"] = "unavailable"
    else:
        v["status"] = "pending"   # network trouble: retried on the next run
    v["errors"] = errors
    v["fetched_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return v


# ---------- catalog ----------

def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync(refresh=False):
    links = read_links()
    old = {v["id"]: v for v in load_json(CATALOG, {"videos": []})["videos"]}
    videos = []
    for n, entry in enumerate(links, 1):
        prev = old.get(entry["id"], {})
        entry["url"] = f"https://www.youtube.com/watch?v={entry['id']}"
        if refresh or prev.get("status") != "ok":
            print(f"[{n}/{len(links)}] fetching {entry['id']}", file=sys.stderr)
            v = fetch_all(entry, prev)
            for step, msg in v["errors"].items():
                print(f"    {step}: {msg}", file=sys.stderr)
        else:
            v = {**prev, **entry}   # note/start may have been edited in links.txt
        v["vertical"] = bool(v.get("vertical") or entry["short"])
        v.pop("short", None)
        v["position"] = n
        videos.append(v)

    keep = {v["id"] for v in videos}
    for folder, ext in ((THUMBS, ".jpg"), (TRANSCRIPTS, ".txt")):
        for f in folder.glob(f"*{ext}") if folder.exists() else []:
            if f.stem not in keep:
                f.unlink()

    new = {"videos": videos}
    if load_json(CATALOG, None) != new:
        write_json(CATALOG, new)
    counts = {s: sum(v["status"] == s for v in videos) for s in ("ok", "pending", "unavailable")}
    print(f"{len(videos)} videos — ok {counts['ok']}, pending {counts['pending']}, unavailable {counts['unavailable']}",
          file=sys.stderr)
    # layout problems are only reported here, so a stale layout.json never blocks the catalog update
    check()
    return 0


def check():
    """Report layout.json problems; returns non-zero if it references unknown or repeated videos."""
    catalog = {v["id"] for v in load_json(CATALOG, {"videos": []})["videos"]}
    layout = load_json(LAYOUT, {})
    placed, problems = [], []
    if layout.get("featured"):
        placed.append(layout["featured"]["id"] if isinstance(layout["featured"], dict) else layout["featured"])
    for s in layout.get("sections", []):
        for item in s.get("videos", []):
            placed.append(item["id"] if isinstance(item, dict) else item)
    for vid in sorted(set(placed) - catalog):
        problems.append(f"layout.json uses {vid}, which is not in links.txt")
    for vid in sorted({p for p in placed if placed.count(p) > 1}):
        problems.append(f"layout.json places {vid} more than once")
    unplaced = [v for v in load_json(CATALOG, {"videos": []})["videos"] if v["id"] not in placed]
    for p in problems:
        print("ERROR " + p, file=sys.stderr)
    if unplaced:
        print(f"{len(unplaced)} not placed yet (shown under 'De aranjat'): "
              + ", ".join(v["id"] for v in unplaced), file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-fetch every link, not only new ones")
    ap.add_argument("--check", action="store_true", help="only validate layout.json against the catalog")
    a = ap.parse_args()
    sys.exit(check() if a.check else sync(a.refresh))
