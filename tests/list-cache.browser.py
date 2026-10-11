"""40-second list reuse, paging, refresh and writes against preview :4181; no real account/database."""
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

calls = []
status = 'unsolved'
fail_notes = False

def fixture(route):
    global status
    url = urlparse(route.request.url)
    params = parse_qs(url.query, keep_blank_values=True)
    calls.append((url.path, params, route.request.method))
    if fail_notes and url.path.startswith('/api/problems/') and route.request.method == 'PUT':
        route.abort(); return
    if url.path == '/api/auth/me':
        result = {'user': {'id': 'cache-test', 'name': '測試', 'email': 'test@example.test'}}
    elif url.path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
    elif url.path == '/api/my/collections':
        result = {'collections': [{'id': 'c1', 'title': '共用測試', 'role': 'contributor', 'can_contribute': True}]}
    elif url.path == '/api/search':
        origin = params.get('origin', ['shared'])[0]
        offset = int(params.get('offset', ['0'])[0])
        rows = []
        for i in range(offset + 1, offset + 3):
            row = {'id': f'q{i}', 'origin': origin, 'title': f'來源{i}', 'topic_id': None, 'topic_label': None,
                   'keywords': '[]', 'typed_notes': '原筆記', 'status': status, 'review_count': 0,
                   'created_at': '2026-10-11T00:00:00Z', 'relevance_score': 0,
                   'collection_id': 'c1' if origin == 'shared' else None}
            if origin == 'owned' and params.get('projection') == ['full']:
                row['problem'] = {'id': row['id'], 'user_id': 'cache-test', 'type': 'problem', 'topic_id': None,
                                  'source': row['title'], 'image_url': 'fixture', 'keywords': '[]', 'status': status,
                                  'typed_notes': '原筆記', 'draw_data': None, 'review_count': 0,
                                  'created_at': row['created_at']}
            rows.append(row)
        result = {'items': rows, 'scope': 'mine' if origin != 'shared' else 'shared', 'next_offset': 2 if offset == 0 else None}
    elif url.path.endswith('/status'):
        status = route.request.post_data_json['status']; result = {'status': status}
    elif url.path.endswith('/image'):
        route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160"><rect width="600" height="160" fill="white"/></svg>')
        return
    else: result = {'collections': [], 'keys': [], 'invitations': [], 'isAdmin': False, 'memberships': {}}
    route.fulfill(json=result)

def searches(origin='owned'):
    return [p for path, p, method in calls if path == '/api/search' and p.get('origin', ['shared'])[0] == origin]

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [390, 1280]:
        status = 'unsolved'; calls.clear()
        page = browser.new_page(service_workers='block', viewport={'width': width, 'height': 844})
        # The injected clock advances freshness without a 40-second blocking wait.
        page.add_init_script('window.cacheClockOffset=0; const realNow=Date.now; Date.now=()=>realNow()+window.cacheClockOffset;')
        page.route('**/api/**', fixture)
        page.goto('http://127.0.0.1:4181/search?source=owned')
        expect(page.get_by_role('heading', name='來源：來源1', exact=True)).to_be_visible()
        page.wait_for_load_state('networkidle'); assert len(searches()) == 1
        source = page.get_by_role('group', name='題目來源')
        source.get_by_role('link', name='我存入', exact=True).click()
        expect(page.get_by_role('heading', name='來源：來源1', exact=True)).to_be_visible()
        source.get_by_role('link', name='我上傳', exact=True).click()
        page.wait_for_load_state('networkidle'); assert len(searches()) == 1 and len(searches('saved')) == 1
        # Mode changes need separate projections; switching back reuses compact data.
        mode = page.get_by_role('group', name='搜尋檢視方式')
        mode.get_by_role('button', name='詳細', exact=True).click()
        expect(page.get_by_label('本題筆記').first).to_be_disabled()
        mode.get_by_role('button', name='簡單', exact=True).click()
        page.wait_for_load_state('networkidle'); assert len(searches()) == 2
        # Aggregated pages survive a source round trip without restarting pagination.
        page.get_by_role('button', name='載入更多題目', exact=True).click()
        expect(page.get_by_role('heading', name='來源：來源3', exact=True)).to_be_attached()
        assert len(searches()) == 3
        source.get_by_role('link', name='我存入', exact=True).click()
        source.get_by_role('link', name='我上傳', exact=True).click()
        expect(page.get_by_role('heading', name='來源：來源3', exact=True)).to_be_attached()
        page.wait_for_load_state('networkidle'); assert len(searches()) == 3
        # No background polling at expiry; only the next use refetches.
        page.evaluate('window.cacheClockOffset+=40001')
        page.wait_for_load_state('networkidle'); assert len(searches()) == 3
        source.get_by_role('link', name='我存入', exact=True).click()
        source.get_by_role('link', name='我上傳', exact=True).click()
        expect(page.get_by_role('heading', name='來源：來源1', exact=True)).to_be_visible()
        page.wait_for_load_state('networkidle'); assert len(searches()) == 4
        # Manual refresh bypasses still-fresh data.
        with page.expect_response(lambda response: '/api/search?' in response.url):
            page.evaluate("window.dispatchEvent(new Event('redolve:library-refresh'))")
        page.wait_for_load_state('networkidle'); assert len(searches()) == 5
        # Reentering a shared scope always reaches the server, even within 40 seconds.
        source.get_by_role('link', name='共用中', exact=True).click()
        with page.expect_response(lambda response: '/api/search?' in response.url and 'scope=shared' in response.url):
            page.get_by_label('選擇可貢獻的共用集').select_option('c1')
        expect(page.get_by_role('heading', name='來源：來源1', exact=True)).to_be_visible()
        source.get_by_role('link', name='我上傳', exact=True).click()
        with page.expect_response(lambda response: '/api/search?' in response.url and 'scope=shared' in response.url):
            source.get_by_role('link', name='共用中', exact=True).click()
        page.wait_for_load_state('networkidle'); assert len(searches('shared')) == 2, searches('shared')
        page.get_by_role('button', name='載入更多題目', exact=True).click()
        expect(page.get_by_role('heading', name='來源：來源3', exact=True)).to_be_attached()
        source.get_by_role('link', name='我上傳', exact=True).click()
        page.go_back()
        expect(page.get_by_role('heading', name='來源：來源3', exact=True)).to_be_attached()
        page.wait_for_load_state('networkidle'); assert len(searches('shared')) == 5
        # Writing in study invalidates search; returning gets current server state.
        source.get_by_role('link', name='我上傳', exact=True).click()
        page.get_by_role('link', name='前往刷題', exact=True).first.click()
        expect(page.get_by_role('button', name='完成訂正', exact=True).first).to_be_visible()
        page.get_by_role('button', name='完成訂正', exact=True).first.click()
        page.wait_for_load_state('networkidle'); assert status == 'resolved'
        before = len(searches()); page.go_back()
        expect(page.get_by_role('heading', name='來源：來源1', exact=True)).to_be_visible()
        page.wait_for_load_state('networkidle'); assert len(searches()) == before + 1
        # Cached full data must not roll back a local note waiting for synchronization.
        page.get_by_role('link', name='前往刷題', exact=True).first.click()
        notes = page.get_by_label('本題筆記').first
        expect(notes).to_be_enabled(); fail_notes = True
        notes.fill('尚未同步的本機筆記')
        source.get_by_role('link', name='我存入', exact=True).click()
        source.get_by_role('link', name='我上傳', exact=True).click()
        expect(notes).to_have_value('尚未同步的本機筆記')
        fail_notes = False
        page.close()
    browser.close()
    print('PASS: desktop/mobile 40-second source/mode reuse, pagination restoration, no polling, forced refresh, shared revalidation and mutation invalidation')
