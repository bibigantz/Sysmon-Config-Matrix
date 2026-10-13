#!/usr/bin/env python3
"""Vendors every esm.sh-hosted ES module dependency (plus the Tailwind CDN script) used by this
app into a local ./vendor/ folder, so the app can run on a fully air-gapped network.

Usage (from the sysmon-config-manager/ directory, with internet access available *once*):
    python requirements/vendor-deps.py

What it does:
  1. Recursively crawls every `import`/`export ... from "..."` and dynamic `import("...")`
     specifier starting from the app's 7 top-level dependencies, mirroring each fetched file
     under vendor/esm.sh/<path>, and rewriting every specifier it finds to a relative path
     pointing at the locally mirrored copy (so no vendored file still reaches out to the CDN).
  2. Writes small alias files (vendor/react.js, vendor/zustand.js, ...) that re-export the real
     mirrored entry point, matching the names used in index.html's import map.
  3. Downloads the Tailwind CDN play script to vendor/tailwindcss-cdn.js.

`index.html` already defaults to these vendored copies (mode 'vendor'), so after running this once
while online, the app just works offline on the next load - no further internet access is
required, and no on-page toggle needs to be touched. The top-bar CDN/Offline badge can still be
used (or ?modules=cdn in the URL) to switch to esm.sh on a machine that does have internet.

Uses only the Python standard library (no pip install needed).
"""
import json
import os
import re
import sys
import urllib.request
from urllib.parse import urljoin, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR_DIR = os.path.join(ROOT, 'vendor')
ESM_SH_DIR = os.path.join(VENDOR_DIR, 'esm.sh')

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
)

# Top-level entry points, matching index.html's CDN_IMPORTS exactly.
ENTRY_POINTS = {
    'react': 'https://esm.sh/react@18.3.1',
    'react-dom-client': 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1',
    'zustand': 'https://esm.sh/zustand@4.5.2?deps=react@18.3.1',
    'fast-xml-parser': 'https://esm.sh/fast-xml-parser@4.5.0',
    'lucide-react': 'https://esm.sh/lucide-react@0.462.0?deps=react@18.3.1',
    'htm': 'https://esm.sh/htm@3.1.1',
    'jszip': 'https://esm.sh/jszip@3.10.1',
}
# These are statically `import Default from '...'` in our source, so their alias file must
# forward the default export too (export * does not re-export `default`).
NEEDS_DEFAULT_EXPORT = {'react', 'react-dom-client', 'htm', 'jszip'}

TAILWIND_CDN_URL = 'https://cdn.tailwindcss.com'

# Minified esm.sh output sometimes omits whitespace entirely (e.g. `import*as __0$ from"x"`,
# `export*from"x"`), so the keyword/`from` boundaries below are \s* (zero-or-more), not \s+.
STATIC_IMPORT_RE = re.compile(r'(?:^|[;\n])\s*(?:import|export)\b\s*(?:[^\'"\n;]*?\bfrom\s*)?["\']([^"\']+)["\']')
DYNAMIC_IMPORT_RE = re.compile(r'import\(\s*["\']([^"\']+)["\']\s*\)')
SOURCEMAP_RE = re.compile(r'^//# sourceMappingURL=.*$', re.MULTILINE)

visited = {}  # absolute URL -> local file path (relative to ROOT, posix-style)


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8'), resp.geturl()


KNOWN_EXTENSIONS = re.compile(r'\.(m?js|css|json)$', re.IGNORECASE)


def local_path_for_url(url):
    parsed = urlparse(url)
    path = parsed.path
    last_seg = path.rsplit('/', 1)[-1]
    # Treat "file" URLs with no recognized file extension (e.g. the /react@18.3.1 proxy, whose
    # last segment is a version string containing dots, as opposed to the real file
    # /react@18.3.1/es2022/react.mjs underneath it) as directories too, by always naming the
    # actual file index.mjs. Otherwise a path can end up needing to be both a file and a
    # directory (the proxy vs. its own subpath) which collide on disk.
    if not path or path.endswith('/') or not KNOWN_EXTENSIONS.search(last_seg):
        path = path.rstrip('/') + '/index.mjs'
    rel = os.path.join('vendor', parsed.netloc, path.lstrip('/'))
    if parsed.query:
        # Plain static file servers (incl. Python's http.server) URL-decode the request path
        # before looking it up on disk, so a percent-encoded query baked into a filename never
        # matches. Use only safe filename characters instead.
        safe_query = re.sub(r'[^A-Za-z0-9._-]+', '_', parsed.query)
        root, ext = os.path.splitext(rel)
        rel = f'{root}__q_{safe_query}{ext or ".mjs"}'
    return rel.replace('\\', '/')


def resolve_specifier(spec, base_url):
    if spec.startswith('http://') or spec.startswith('https://'):
        return spec
    if spec.startswith('/'):
        base = urlparse(base_url)
        return f'{base.scheme}://{base.netloc}{spec}'
    if spec.startswith('./') or spec.startswith('../'):
        return urljoin(base_url, spec)
    print(f'  ! skipping unresolvable bare specifier "{spec}" found in {base_url}', file=sys.stderr)
    return None


def crawl(url):
    """Downloads `url` (and everything it imports) under vendor/esm.sh/, returns its local
    repo-relative path."""
    if url in visited:
        return visited[url]

    rel_path = local_path_for_url(url)
    abs_path = os.path.join(ROOT, rel_path)
    visited[url] = rel_path  # reserve before recursing, in case of cycles

    print(f'  fetching {url}')
    text, final_url = fetch(url)
    text = SOURCEMAP_RE.sub('', text)

    specifiers = set(STATIC_IMPORT_RE.findall(text)) | set(DYNAMIC_IMPORT_RE.findall(text))
    rewrites = {}
    for spec in specifiers:
        target_url = resolve_specifier(spec, final_url)
        if not target_url:
            continue
        target_rel = crawl(target_url)
        target_abs_in_vendor = os.path.join(ROOT, target_rel)
        this_dir = os.path.dirname(abs_path)
        rel_from_this = os.path.relpath(target_abs_in_vendor, this_dir).replace('\\', '/')
        if not rel_from_this.startswith('.'):
            rel_from_this = './' + rel_from_this
        rewrites[spec] = rel_from_this

    for spec, replacement in rewrites.items():
        text = text.replace(f'"{spec}"', f'"{replacement}"').replace(f"'{spec}'", f"'{replacement}'")

    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, 'w', encoding='utf-8') as f:
        f.write(text)

    return rel_path


def write_alias(name, target_rel_path, needs_default):
    alias_path = os.path.join(VENDOR_DIR, f'{name}.js')
    target_from_vendor = os.path.relpath(os.path.join(ROOT, target_rel_path), VENDOR_DIR).replace('\\', '/')
    if not target_from_vendor.startswith('.'):
        target_from_vendor = './' + target_from_vendor
    lines = [f"export * from '{target_from_vendor}'"]
    if needs_default:
        lines.append(f"export {{ default }} from '{target_from_vendor}'")
    with open(alias_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'  wrote vendor/{name}.js -> {target_from_vendor}')


def main():
    os.makedirs(ESM_SH_DIR, exist_ok=True)
    print(f'Vendoring into {VENDOR_DIR} ...\n')

    for name, entry_url in ENTRY_POINTS.items():
        print(f'[{name}]')
        rel_path = crawl(entry_url)
        write_alias(name, rel_path, name in NEEDS_DEFAULT_EXPORT)
        print()

    print('[tailwindcss-cdn]')
    text, _ = fetch(TAILWIND_CDN_URL)
    with open(os.path.join(VENDOR_DIR, 'tailwindcss-cdn.js'), 'w', encoding='utf-8') as f:
        f.write(text)
    print('  wrote vendor/tailwindcss-cdn.js\n')

    manifest = {
        'generated_from': list(ENTRY_POINTS.values()) + [TAILWIND_CDN_URL],
        'file_count': len(visited) + 1,
    }
    with open(os.path.join(VENDOR_DIR, 'MANIFEST.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    print(f'Done. {len(visited)} module files + tailwindcss-cdn.js vendored under {VENDOR_DIR}')
    print('index.html already defaults to these local copies - just open the app and it works offline.')
    print('(Use the top-bar CDN/Offline badge, or ?modules=cdn, to switch back to esm.sh if needed.)')


if __name__ == '__main__':
    main()
