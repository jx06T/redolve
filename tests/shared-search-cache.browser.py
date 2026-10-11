"""Shared list conditional validation; desktop/mobile preview. Synthetic API only."""
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
import hashlib

calls = []
revision = 1
allowed = True
offline = False

def fixture(route):
    url = urlparse(route.request.url)
    params = parse_qs(url.query, keep_blank_values=True)
    if url.path == '/api/auth/me': result = {'user': {'id': 'cache-test', 'name': 'Test', 'email': 'test@example.test'}}
    elif url.path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
    elif url.path == '/api/my/collections': result = {'collections': [{'id': 'c1', 'title': 'Shared', 'role': 'contributor', 'can_contribute': True}]}
    elif url.path == '/api/search':
        shared = params.get('scope') == ['shared']
        condition = route.request.headers.get('if-none-match')
        tag = 'W/"' + hashlib.sha256((str(revision)+url.query).encode()).hexdigest() + '"'
        if shared and offline:
            calls.append(('offline', condition)); route.abort(); return
        if shared and allowed and condition == tag:
            calls.append(('304', condition)); route.fulfill(status=304, headers={'ETag': tag, 'X-Redolve-Collection-Version': str(revision)}); return
        if shared: calls.append(('200', condition))
        offset = int(params.get('offset', ['0'])[0])
        rows = [{'id': 'q'+str(i), 'origin': 'shared' if shared else 'owned', 'title': '來源'+str(i)+' v'+str(revision),
                 'topic_id': None, 'topic_label': None, 'status': 'unsolved', 'created_at': '2026-10-11T00:00:00Z',
                 'collection_id': 'c1' if shared else None, 'keywords': None, 'typed_notes': None, 'relevance_score': 0}
                for i in range(offset+1, offset+3)] if not shared or allowed else []
        result = {'items': rows, 'scope': 'shared' if shared else 'mine', 'next_offset': 2 if offset == 0 and rows else None}
        route.fulfill(json=result, headers={'ETag': tag, 'X-Redolve-Collection-Version': str(revision)} if shared and allowed else {})
        return
    elif url.path.endswith('/image'):
        route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160"><rect width="600" height="160" fill="white"/></svg>'); return
    else: result = {'collections': [], 'keys': [], 'invitations': [], 'isAdmin': False, 'memberships': {}}
    route.fulfill(json=result)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [390, 1280]:
        calls.clear(); revision = 1; allowed = True; offline = False
        page = browser.new_page(service_workers='block', viewport={'width': width, 'height': 844})
        page.add_init_script('window.cacheClockOffset=0; const realNow=Date.now; Date.now=()=>realNow()+window.cacheClockOffset;')
        page.route('**/api/**', fixture)
        page.goto('http://127.0.0.1:4181/search?source=contributing&collection_id=c1')
        expect(page.get_by_role('heading', name='來源：來源1 v1', exact=True)).to_be_visible()
        source = page.get_by_role('group', name='題目來源')
        # Revocation during paging must clear the previously authorized rows too.
        allowed = False
        page.get_by_role('button', name='載入更多題目', exact=True).click()
        expect(page.get_by_text('目前範圍沒有題目。', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='來源：來源1 v1', exact=True)).to_have_count(0)
        allowed = True
        with page.expect_response(lambda r: '/api/search?' in r.url and 'scope=shared' in r.url):
            page.evaluate("window.dispatchEvent(new Event('redolve:library-refresh'))")
        expect(page.get_by_role('heading', name='來源：來源1 v1', exact=True)).to_be_visible()
        calls.clear()
        page.get_by_role('button', name='載入更多題目', exact=True).click()
        expect(page.get_by_role('heading', name='來源：來源3 v1', exact=True)).to_be_attached()
        page.wait_for_load_state('networkidle'); assert [c[0] for c in calls] == ['200']
        def roundtrip():
            source.get_by_role('link', name='我上傳', exact=True).click()
            with page.expect_response(lambda r: '/api/search?' in r.url and 'scope=shared' in r.url):
                source.get_by_role('link', name='共用中', exact=True).click()
            page.wait_for_load_state('networkidle')
        roundtrip()
        expect(page.get_by_role('heading', name='來源：來源3 v1', exact=True)).to_be_attached()
        assert len(calls) == 2 and calls[-1][0] == '304', calls
        revision = 2; roundtrip()
        expect(page.get_by_role('heading', name='來源：來源1 v2', exact=True)).to_be_visible()
        assert calls[-1][0] == '200' and calls[-1][1], calls
        expect(page.get_by_role('heading', name='來源：來源1 v1', exact=True)).to_have_count(0)
        allowed = False; roundtrip()
        expect(page.get_by_text('目前範圍沒有題目。', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='來源：來源1 v2', exact=True)).to_have_count(0)
        allowed = True; roundtrip()
        expect(page.get_by_role('heading', name='來源：來源1 v2', exact=True)).to_be_visible()
        offline = True
        source.get_by_role('link', name='我上傳', exact=True).click()
        source.get_by_role('link', name='共用中', exact=True).click()
        expect(page.get_by_role('alert').last).to_be_visible()
        expect(page.get_by_role('heading', name='來源：來源1 v2', exact=True)).to_have_count(0)
        offline = False; roundtrip()
        expect(page.get_by_role('heading', name='來源：來源1 v2', exact=True)).to_be_visible()
        before = len(calls); page.evaluate('window.cacheClockOffset+=40001')
        page.wait_for_load_state('networkidle'); assert len(calls) == before
        roundtrip(); assert calls[-1] == ('200', None), calls
        with page.expect_response(lambda r: '/api/search?' in r.url and 'scope=shared' in r.url):
            page.evaluate("window.dispatchEvent(new Event('redolve:library-refresh'))")
        page.wait_for_load_state('networkidle'); assert calls[-1] == ('200', None), calls
        page.close()
    browser.close()
    print('PASS: shared desktop/mobile 304 validation, aggregate paging restore, changed version, revocation, errors, TTL and refresh')
