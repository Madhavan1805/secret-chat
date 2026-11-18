"""Song search for status and note music.

GET music/search/?q=<text>  ->  [{id, title, artist, art, url}]   (30 second previews; iTunes Search + Deezer Search, merged)

The phone never talks to that API directly: this server does the search, and only preview links from the allowed
hosts below can be stored on a note or status, so nobody can attach an arbitrary link.
"""
import json
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
import urllib.request
from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

SEARCH_URL = 'https://itunes.apple.com/search'
DEEZER_URL = 'https://api.deezer.com/search'
ALLOWED_SUFFIXES = ('.itunes.apple.com', '.mzstatic.com', '.dzcdn.net')
COUNTRY = getattr(settings, 'MUSIC_COUNTRY', 'IN')


def clean_music_url(value):
    """Return the preview URL if it is a https link on an allowed host, else ''."""
    url = (value or '').strip()
    if not url or len(url) > 500:
        return ''
    p = urlparse(url)
    host = (p.hostname or '').lower()
    if p.scheme != 'https' or not any(host.endswith(s) for s in ALLOWED_SUFFIXES):
        return ''
    return url


def clean_clip(data):
    """The part of the song to play: where it starts and how long, in seconds (start 0..3600, length 5..60)."""
    def num(key, default):
        try:
            return int(float(data.get(key)))
        except (TypeError, ValueError):
            return default
    return max(0, min(num('music_start', 0), 3600)), max(5, min(num('music_len', 30), 60))


def clean_text(value, limit):
    return ' '.join(str(value or '').split())[:limit]


def _get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Chatzy'})
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.loads(r.read().decode('utf-8'))


def _https(value):
    value = str(value or '')
    return value if value.startswith('https://') else ''


def _from_itunes(q):
    params = urllib.parse.urlencode({'term': q, 'media': 'music', 'entity': 'song', 'limit': 50, 'country': COUNTRY})
    out = []
    for it in _get_json(f"{SEARCH_URL}?{params}").get('results', []):
        url = clean_music_url(it.get('previewUrl'))
        if url:
            out.append({"id": f"i{it.get('trackId')}", "title": clean_text(it.get('trackName'), 80),
                        "artist": clean_text(it.get('artistName'), 60), "art": _https(it.get('artworkUrl60')), "url": url})
    return out


def _from_deezer(q):
    out = []
    for it in _get_json(f"{DEEZER_URL}?{urllib.parse.urlencode({'q': q, 'limit': 50})}").get('data', []):
        url = clean_music_url(it.get('preview'))
        if url:
            album = it.get('album') or {}
            out.append({"id": f"d{it.get('id')}", "title": clean_text(it.get('title_short') or it.get('title'), 80),
                        "artist": clean_text((it.get('artist') or {}).get('name'), 60),
                        "art": _https(album.get('cover_small') or album.get('cover')), "url": url})
    return out


def merge_songs(*lists, cap=60):
    """Take turns from each source and drop repeats of the same title + artist."""
    seen, out = set(), []
    for i in range(max((len(x) for x in lists), default=0)):
        for lst in lists:
            if i < len(lst):
                song = lst[i]
                key = (song['title'].lower(), song['artist'].lower())
                if key not in seen:
                    seen.add(key)
                    out.append(song)
    return out[:cap]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def music_search(request):
    q = clean_text(request.query_params.get('q'), 80)
    if len(q) < 2:
        return Response([])
    key = f"music2:{COUNTRY}:{q.lower()}"
    out = cache.get(key)
    if out is None:
        results, failed = [], 0
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(_from_itunes, q), pool.submit(_from_deezer, q)]
            for f in futures:
                try:
                    results.append(f.result())
                except Exception:
                    failed += 1
        if failed == len(futures):
            raise ValidationError({"error": "Song search is not available right now. Try again in a moment."})
        out = merge_songs(*results)
        cache.set(key, out, 60 * 60 if out else 60)
    return Response(out)
