"""Work list loading keeps a bounded window even while detail responses are slow.

Run against preview port 4181. Hold all work detail requests to catch collapsing placeholders.
"""
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        for source in ['saved', 'contributing']:
            context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
            pending, pages, errors = [], [], []

            def fixture(route):
                parsed = urlparse(route.request.url)
                path, query = parsed.path, parse_qs(parsed.query)
                if path.startswith('/api/saved/') or '/items/' in path:
                    pending.append(route)
                    return
                if path == '/api/auth/me':
                    result = {'user': {'id': 'loading-test', 'name': '載入測試'}}
                elif path == '/api/taxonomy':
                    result = {'tree': [], 'customNodes': [], 'counts': {}}
                elif path == '/api/my/collections':
                    result = {'collections': [{'id': 'co', 'title': '共用集', 'role': 'owner', 'can_contribute': True}]}
                elif path == '/api/search':
                    pages.append(query)
                    offset = int(query.get('offset', ['0'])[0])
                    limit = int(query['limit'][0])
                    result = {'items': [{'id': f'e{i}', 'origin': 'saved' if source == 'saved' else 'shared',
                        'title': f'題目{i}', 'collection_id': 'co' if source == 'contributing' else None}
                        for i in range(offset, min(offset + limit, 60))],
                        'next_offset': offset + limit if offset + limit < 60 else None, 'scope': 'mine'}
                else:
                    result = {'items': [], 'collections': [], 'memberships': {}}
                route.fulfill(json=result)

            context.route('**/api/**', fixture)
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:4181/study?source=' + source + ('&collection_id=co' if source == 'contributing' else ''))
            expect(page.locator('[data-reader-loading="true"]').first).to_be_visible()
            page.wait_for_timeout(1200)
            assert 0 < len(pending) <= 8, f'{width}px {source}: {len(pending)} work details requested before scrolling'
            assert len(pages) == 1 and pages[0]['limit'] == ['30'], pages
            heights = page.locator('[data-reader-loading="true"]').evaluate_all('(els)=>els.map(el=>el.getBoundingClientRect().height)')
            assert min(heights) >= 700, heights
            reader = page.locator('[data-reader]')
            reader.dispatch_event('wheel')
            reader.evaluate('(el)=>{el.scrollTop=el.scrollHeight;}')
            expect(page.get_by_role('button', name='載入更多題目', exact=True)).to_be_visible()
            page.wait_for_timeout(200)
            assert len(pages) == 1, 'Scrolling must not automatically fetch the next list page'
            page.get_by_role('button', name='載入更多題目', exact=True).click()
            expect(page.get_by_role('button', name='載入更多題目', exact=True)).to_have_count(0)
            assert len(pages) == 2 and pages[1]['offset'] == ['30'], pages
            assert not errors, errors
            page.goto('about:blank')
            for route in pending:
                try:
                    route.abort()
                except Exception:
                    pass  # Leaving the fixture page may already cancel the request.
            context.unroute_all(behavior='ignoreErrors')
            context.close()
            print(f'PASS bounded slow work loading and manual pagination at {width}px ({source})')
    browser.close()
