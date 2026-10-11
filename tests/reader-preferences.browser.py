"""Remembered reader filters: navigation, reload, deep links, clearing and account isolation.

Run against preview port 4181; all APIs are synthetic local fixtures.
"""
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:4181'

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
        account = ['alice']
        calls, errors = [], []

        def fixture(route):
            url = urlparse(route.request.url)
            path, query = url.path, parse_qs(url.query)
            calls.append((path, query))
            collection = {'id': path.split('/')[-1], 'title': '向量題目集', 'visibility': 'public', 'lifecycle': 'active'}
            if path == '/api/auth/me':
                result = {'user': {'id': account[0], 'name': account[0]}}
            elif path == '/api/taxonomy':
                result = {'tree': [], 'customNodes': [], 'counts': {}}
            elif path == '/api/subscriptions':
                result = {'subscriptions': [{'collection_id': cid, 'title': '訂閱' + cid, 'last_known_title': '訂閱' + cid,
                    'can_read': True, 'subscribed_at': '2026-10-11'} for cid in ['c1', 'c2']]}
            elif path == '/api/public/collections':
                result = {'collections': [{**collection, 'id': 'p1', 'title': '公開題目集'}]}
            elif path == '/api/my/collections':
                result = {'collections': [{**collection, 'id': 'co', 'title': '我的共用集', 'role': 'owner', 'can_contribute': True}]}
            elif path.startswith('/api/collections/'):
                result = {'collection': collection, 'items': [], 'next_cursor': None}
            else:
                result = {'items': [], 'next_offset': None, 'collections': [], 'memberships': {}}
            route.fulfill(json=result)

        context.route('**/api/**', fixture)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))

        def visit(path):
            page.goto(BASE + path)
            page.wait_for_load_state('networkidle')

        def open_controls():
            button = page.get_by_role('button', name='搜尋與篩選', exact=True)
            if button.get_attribute('aria-expanded') != 'true':
                button.click()

        def navigate_tab(path):
            if path == '/explore' and width < 768:
                page.get_by_role('button', name='開啟導覽選單', exact=True).click()
            page.locator(f'a[href="{path}"]:visible').first.click()
            page.wait_for_load_state('networkidle')

        visit('/explore?collection_id=p1&q=math')
        visit('/extended?collection_id=c1&q=vector&state=starred&sort=alphabet&list_q=訂閱')
        open_controls()
        expect(page.get_by_label('閱讀篩選')).to_have_value('starred')
        expect(page.get_by_label('訂閱集排序')).to_have_value('alphabet')

        # Bare navigation returns to the previous scoped filters before loading the first page.
        calls.clear()
        navigate_tab('/explore')
        assert parse_qs(urlparse(page.url).query) == {'collection_id': ['p1'], 'q': ['math']}, page.url
        assert not any(path == '/api/public/items' for path, _ in calls), calls
        open_controls()
        expect(page.get_by_label('搜尋目前觀看範圍')).to_have_value('math')
        page.get_by_role('region', name='題目閱讀選項').get_by_role('button', name='清除搜尋與篩選').click()
        page.get_by_label('選擇公開題目集').select_option('')
        navigate_tab('/extended')
        open_controls()
        expect(page.get_by_label('選擇已訂閱的題目集')).to_have_value('c1')
        expect(page.get_by_label('搜尋目前觀看範圍')).to_have_value('vector')
        expect(page.get_by_label('閱讀篩選')).to_have_value('starred')
        expect(page.get_by_label('尋找已訂閱的集合')).to_have_value('訂閱')
        page.reload()
        page.wait_for_load_state('networkidle')
        assert parse_qs(urlparse(page.url).query)['state'] == ['starred']
        visit('/explore')
        assert not urlparse(page.url).query, page.url

        # Explicit links bypass previous filters, including during authentication hydration.
        visit('/extended?collection_id=c2&focus=e2')
        query = parse_qs(urlparse(page.url).query)
        assert query == {'collection_id': ['c2'], 'focus': ['e2']}, query
        visit('/search?source=contributing&collection_id=co')
        calls.clear()
        visit('/study?source=contributing')
        assert parse_qs(urlparse(page.url).query)['collection_id'] == ['co'], page.url
        assert any(path == '/api/search' and q.get('collection_id') == ['co'] for path, q in calls), calls

        # A different account must not inherit the previous account's selected collection.
        account[0] = 'bob'
        visit('/extended')
        assert not urlparse(page.url).query, page.url
        open_controls()
        expect(page.get_by_label('選擇已訂閱的題目集')).to_have_value('')
        assert not errors, errors
        context.close()
        print(f'PASS remembered reader filters, clearing, deep links and account isolation at {width}px')
    browser.close()
