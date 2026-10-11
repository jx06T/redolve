"""Verify compact search requests, mode transitions, and scoped navigation against preview :4181."""
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

calls = []
problem = {'id': 'q1', 'user_id': 'projection-test', 'type': 'problem', 'topic_id': None,
           'source': '測試來源', 'image_url': 'fixture-image', 'keywords': '[]', 'status': 'unsolved',
           'typed_notes': '完整筆記', 'draw_data': None, 'review_count': 0, 'created_at': '2026-10-11T00:00:00Z'}

def fixture(route):
    url = urlparse(route.request.url)
    params = parse_qs(url.query, keep_blank_values=True)
    calls.append((url.path, params))
    if url.path == '/api/auth/me': result = {'user': {'id': 'projection-test', 'name': '測試', 'email': 'test@example.test'}}
    elif url.path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
    elif url.path == '/api/my/collections': result = {'collections': [{'id': 'c1', 'title': '可貢獻集合', 'role': 'contributor', 'can_contribute': True}]}
    elif url.path == '/api/search':
        origin = params.get('origin', ['shared'])[0]
        item = {'id': 'q1', 'origin': origin, 'title': '測試來源', 'topic_id': None, 'topic_label': None,
                'keywords': None, 'typed_notes': None, 'status': 'unsolved', 'review_count': 0,
                'created_at': problem['created_at'], 'relevance_score': 0, 'collection_id': 'c1' if origin == 'shared' else None}
        if origin == 'owned' and params.get('projection') == ['full']: item['problem'] = problem
        result = {'items': [item], 'scope': 'mine' if origin != 'shared' else 'shared', 'next_offset': None}
    elif url.path.endswith('/image'):
        route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="white"/></svg>')
        return
    else: result = {'collections': [], 'keys': [], 'invitations': [], 'isAdmin': False}
    route.fulfill(json=result)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    page = browser.new_page(service_workers='block')
    page.route('**/api/**', fixture)
    for width in [390, 1280]:
        page.set_viewport_size({'width': width, 'height': 844})
        calls.clear()
        page.goto('http://127.0.0.1:4181/search?source=owned')
        expect(page.get_by_role('heading', name='來源：測試來源')).to_be_visible()
        page.wait_for_load_state('networkidle')
        request = [params for path, params in calls if path == '/api/search'][-1]
        assert request['q'] == [''] and request['browse'] == ['1'] and request['projection'] == ['compact']
        assert not any(path.startswith('/api/my/collections') for path, _ in calls)
        group = page.get_by_role('group', name='搜尋檢視方式')
        group.get_by_role('button', name='詳細', exact=True).click()
        expect(page.get_by_label('本題筆記').first).to_be_disabled()
        assert [params for path, params in calls if path == '/api/search'][-1]['projection'] == ['full']
        group.get_by_role('button', name='簡單', exact=True).click()
        expect(page.get_by_role('heading', name='來源：測試來源')).to_be_visible()
        page.get_by_role('textbox', name='搜尋目前題目來源').fill('向量')
        with page.expect_response(lambda response: urlparse(response.url).path == '/api/search'
                                  and parse_qs(urlparse(response.url).query).get('q') == ['向量']):
            page.get_by_role('button', name='搜尋', exact=True).click()
        page.wait_for_load_state('networkidle')
        request = [params for path, params in calls if path == '/api/search'][-1]
        assert request['q'] == ['向量'] and request['projection'] == ['compact']
        page.get_by_role('link', name='前往刷題', exact=True).click()
        page.wait_for_url('**/study?**')
        study = parse_qs(urlparse(page.url).query)
        assert study['source'] == ['owned'] and study['q'] == ['向量'] and study['focus'] == ['q1']
        page.wait_for_load_state('networkidle')
        assert [params for path, params in calls if path == '/api/search'][-1]['projection'] == ['full']
        page.go_back()
        expect(page.get_by_role('heading', name='來源：測試來源')).to_be_visible()
        expect(group.get_by_role('button', name='簡單', exact=True)).to_have_attribute('aria-pressed', 'true')
        for source in ['saved', 'contributing']:
            page.goto(f'http://127.0.0.1:4181/search?source={source}&collection_id=c1')
            expect(page.get_by_role('heading', name='來源：測試來源')).to_be_visible()
            request = [params for path, params in calls if path == '/api/search'][-1]
            assert request['projection'] == ['compact']
            if source == 'contributing': assert request['scope'] == ['shared'] and request['collection_id'] == ['c1']
        assert page.locator('main').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
    browser.close()
    print('PASS: blank list projection, full hydration, keyword query, scoped study/back, all three sources, no unused collection requests')
