"""Song search for status and note music.

GET music/search/?q=<text>  ->  [{id, title, artist, art, url}]   (30 second previews, searched through the iTunes Search API)

The phone never talks to that API directly: this server does the search, and only preview links from the allowed
hosts below can be stored on a note or status, so nobody can attach an arbitrary link.
"""
import json
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
ALLOWED_SUFFIXES = ('.itunes.apple.com', '.mzstatic.com')
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


def clean_text(value, limit):
    return ' '.join(str(value or '').split())[:limit]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def music_search(request):
    q = clean_text(request.query_params.get('q'), 80)
    if len(q) < 2:
        return Response([])
    key = f"music:{COUNTRY}:{q.lower()}"
    out = cache.get(key)
    if out is None:
        params = urllib.parse.urlencode({'term': q, 'media': 'music', 'entity': 'song', 'limit': 20, 'country': COUNTRY})
        try:
            req = urllib.request.Request(f"{SEARCH_URL}?{params}", headers={'User-Agent': 'Chatzy'})
            with urllib.request.urlopen(req, timeout=6) as r:
                data = json.loads(r.read().decode('utf-8'))
        except Exception:
            raise ValidationError({"error": "Song search is not available right now. Try again in a moment."})
        out = []
        for it in data.get('results', []):
            url = clean_music_url(it.get('previewUrl'))
            if not url:
                continue
            out.append({
                "id": it.get('trackId'),
                "title": clean_text(it.get('trackName'), 80),
                "artist": clean_text(it.get('artistName'), 60),
                "art": (it.get('artworkUrl60') or '') if str(it.get('artworkUrl60') or '').startswith('https://') else '',
                "url": url,
            })
        cache.set(key, out, 60 * 60)
    return Response(out)
