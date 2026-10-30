"""Download the public QQ Agent site without contacting any write endpoints."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote, quote
import hashlib
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://kondius.cn"
BASE = ORIGIN + "/qq-agent/"
ASSET_EXT = r"(?:html|css|js|json|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm)"
API = {
    "/api/community/plugins": "plugins",
    "/api/community/skills": "skills",
    "/api/community/personas": "personas",
    "/data/market-tags.json": "tags",
    "/qq-agent/comment/comments.json": "comments",
    "/qq-agent/comment/likes.json": "commentLikes",
    "/qq-agent/holyshits/holyshits.json": "holyshits",
    "/qq-agent/holyshits/likes.json": "holyshitsLikes",
    "/qq-agent/api/telemetry/summary": "telemetry",
}
seen, records, errors = set(), {}, {}
REFRESH = "--refresh" in sys.argv
PREVIOUS = json.loads((ROOT / "mirror-manifest.json").read_text(encoding="utf-8")) if (ROOT / "mirror-manifest.json").exists() else {"files": {}}


def prompt_id(pathname):
    match = re.fullmatch(r"/api/community/personas/([A-Za-z0-9_-]+)/prompt", pathname)
    return match[1] if match else None


def normalize(url, base=BASE):
    url = unescape(url).replace("\\/", "/").strip()
    if not url or any(c in url for c in "\n\r<>\"'{}") or url.startswith(("data:", "#", "javascript:")):
        return None
    parsed = urlsplit(urljoin(base, url))
    if parsed.hostname not in ("kondius.cn", "www.kondius.cn"):
        return None
    pathname = unquote(parsed.path)
    if ".." in pathname.split("/"):
        return None
    if pathname in API or prompt_id(pathname):
        return ORIGIN + pathname
    if not pathname.startswith("/qq-agent/"):
        return None
    if pathname.endswith("/"):
        pathname += "index.html"
    if not re.search(r"\." + ASSET_EXT + r"$", pathname, re.I):
        return None
    return ORIGIN + quote(pathname, safe="/:@-._~!$&()*+,;=")


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value and key in ("src", "href", "poster"):
                self.links.append(value)


def references(text, url):
    refs = []
    if url.endswith(".html"):
        parser = Links()
        parser.feed(text)
        refs.extend((value, url) for value in parser.links)
    if url.endswith(".css"):
        refs.extend((m.group(1), url) for m in re.finditer(r"url\(\s*['\"]?([^\s)'\"]+)", text))
    if url.endswith(".js") and "/vendor/" not in url and not url.endswith("offline-data.js"):
        # Site scripts resolve their resource strings against Q.BASE, not the JS directory.
        refs.extend((m.group(1), BASE) for m in re.finditer(
            r"['\"]((?:https?://|/|\.?\.?/)?[A-Za-z0-9_@%./+?=&-]+\." + ASSET_EXT + r")(?:[?#][^'\"\s]*)?['\"]", text, re.I))
        refs.extend((m.group(1), BASE) for m in re.finditer(
            r"['\"]((?:assets|data|captcha-sdk)/[^'\"\s<>]+?\." + ASSET_EXT + r")[\"']", text, re.I))
        refs.extend((m.group(1), BASE) for m in re.finditer(r"\b(?:src|href)=[\"']([\w./-]+\.(?:png|jpg|jpeg|webp|svg|html))[\"']", text))
    if url.endswith(".json"):
        # Read resource fields only: text such as “picture.jpg” is not an attachment.
        def attachments(value, key=""):
            if isinstance(value, dict):
                for child_key, child in value.items():
                    attachments(child, child_key)
            elif isinstance(value, list):
                for child in value:
                    attachments(child, key)
            elif isinstance(value, str) and key in ("images", "url", "image", "avatar", "cover", "thumbnail"):
                if re.search(r"\.(?:png|jpe?g|webp|gif|svg)(?:\?.*)?$", value, re.I):
                    refs.append((value, url))
        attachments(json.loads(text))
    if url == ORIGIN + "/api/community/personas":
        for item in json.loads(text).get("items", []):
            if item.get("hasPrompt"):
                refs.append(("/api/community/personas/" + item["id"] + "/prompt", BASE))
    return {candidate for value, base in refs if (candidate := normalize(value, base))}


def download(url):
    parsed = urlsplit(url)
    pathname = unquote(parsed.path)
    if pathname in API:
        target = ROOT / "snapshots" / (API[pathname] + ".json")
    elif ident := prompt_id(pathname):
        target = ROOT / "snapshots" / "persona-prompts" / (ident + ".json")
    else:
        target = ROOT / pathname.lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    previous = PREVIOUS["files"].get(url)
    if not REFRESH and previous and target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == previous["sha256"]:
        found = references(target.read_text(encoding="utf-8"), url) if previous["mime"] in ("text/html", "text/css", "application/javascript", "application/json") else set()
        return url, previous, None, found
    temporary = target.with_name(target.name + ".download")
    result = subprocess.run([
        "curl.exe", "--noproxy", "*", "--fail", "--silent", "--show-error", "--location",
        "--retry", "1", "--connect-timeout", "10", "--max-time", "60", "--max-filesize", "40000000",
        url, "--output", str(temporary), "--write-out", "%{content_type}",
    ], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        temporary.unlink(missing_ok=True)
        return url, None, result.stderr.strip(), set()
    data = temporary.read_bytes()
    mime = result.stdout.strip().split(";")[0]
    if (pathname in API or prompt_id(pathname) or pathname.endswith(".json")):
        try:
            json.loads(data)
        except (ValueError, UnicodeError):
            temporary.unlink(missing_ok=True)
            return url, None, "Expected JSON; received " + mime, set()
    elif not pathname.endswith(".html") and (mime == "text/html" or data.lstrip().lower().startswith(b"<!doctype html")):
        temporary.unlink(missing_ok=True)
        return url, None, "Rejected HTML fallback for asset", set()
    temporary.replace(target)
    record = {"file": target.relative_to(ROOT).as_posix(), "bytes": len(data),
              "mime": mime, "sha256": hashlib.sha256(data).hexdigest()}
    found = references(data.decode("utf-8", errors="replace"), url) if mime in ("text/html", "text/css", "application/javascript", "application/json") else set()
    return url, record, None, found


def main():
    seeds = ["index.html", "thanks.html", "comments/index.html", "holyshits/index.html",
             "skill-market/index.html", "plugin-market/index.html", "persona-plaza/index.html",
             "admin/index.html", "u/index.html", "data/thanks.json", "data/offline-data.js",
             "assets/audio/cover.jpg", "assets/audio/track.mp3", "sponsor-wechat.jpg", "group-qrcode.jpg"]
    pending = {normalize(value) for value in seeds} | {ORIGIN + route for route in API}
    while pending:
        batch = sorted(pending - seen)
        pending = set()
        if len(seen) + len(batch) > 1000:
            raise RuntimeError("Unexpectedly large public resource graph")
        seen.update(batch)
        with ThreadPoolExecutor(max_workers=3) as pool:
            for url, record, error, found in pool.map(download, batch):
                if error:
                    errors[url] = error
                    print("FAILED", url, error, flush=True)
                else:
                    records[url] = record
                    pending.update(found - seen)
                    print("SAVED", record["file"], record["bytes"], flush=True)
        manifest = {"source": BASE, "capturedAt": datetime.now(timezone.utc).isoformat(),
                    "api": API, "files": records, "failures": errors,
                    "notes": "Public HTTP snapshot. No server login or backend source. Downloads/external links remain online."}
        (ROOT / "mirror-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"files": len(records), "bytes": sum(x["bytes"] for x in records.values()), "failures": errors}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
