"""Outline loading is opt-in by subject; search navigation preserves the study scope.

Run against the production preview on port 4181 with synthetic API responses.
"""
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'outline-user', 'name': '大綱測試'}
COLLECTION = {'id': 'c1', 'title': '共用集', 'role': 'contributor', 'can_contribute': True}
TREE = [{'id': 'math', 'label': '數學', 'children': [
    {'id': 'vector', 'label': '向量', 'children': []}]}]

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
        calls = []
        def fixture(route):
            parsed = urlparse(route.request.url)
            query = parse_qs(parsed.query)
            if parsed.path == '/api/auth/me': result = {'user': USER}
            elif parsed.path == '/api/taxonomy': result = {'tree': TREE, 'customNodes': [], 'counts': {}}
            elif parsed.path == '/api/my/collections': result = {'collections': [COLLECTION]}
            elif parsed.path == '/api/search':
                calls.append(query)
                # No cards are needed to verify scope/navigation; outline requests
                # still return metadata so stale outline clearing is observable.
                items = [{'id': 'outline1', 'origin': 'owned', 'title': '測試', 'topic_id': 'vector',
                          'status': 'unsolved', 'review_count': 0, 'created_at': '2026-10-11'}] if query.get('metadata_only') else []
                result = {'items': items, 'next_offset': None, 'scope': 'mine'}
            else: result = {'items': [], 'memberships': {}, 'collections': [], 'keys': []}
            route.fulfill(json=result)
        context.route('**/api/**', fixture)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def settle():
            page.wait_for_timeout(150)
            page.wait_for_load_state('networkidle')
        def open_sidebar():
            if width < 1024 and page.get_by_role('button', name='開啟刷題側邊欄', exact=True).count():
                page.get_by_role('button', name='開啟刷題側邊欄', exact=True).click()
        def metadata_calls(): return [q for q in calls if q.get('metadata_only')]
        for source in ['owned', 'saved', 'contributing']:
            calls.clear()
            url = f'http://127.0.0.1:4181/study?source={source}' + ('&collection_id=c1' if source == 'contributing' else '')
            page.goto(url); settle(); open_sidebar()
            expect(page.get_by_label('搜尋目前題目來源')).to_have_count(0)
            expect(page.get_by_text('選擇科目後載入題目大綱。', exact=True)).to_be_visible()
            assert not metadata_calls(), (source, calls)
            sidebar = page.locator('aside' if width >= 1024 else '#study-mobile-sidebar')
            sidebar.get_by_role('button', name='所有科目', exact=True).click()
            sidebar.get_by_role('button', name='數學', exact=True).click(); settle()
            assert metadata_calls() and all(q.get('topic_id') == ['math'] for q in metadata_calls()), (width, source, page.url, calls)
            count = len(metadata_calls())
            open_sidebar()
            sidebar.get_by_role('button', name='選擇分類向量', exact=True).click(); settle()
            assert len(metadata_calls()) == count, 'changing units in the same subject must reuse its outline'
            open_sidebar()
            sidebar.get_by_label('篩選標籤').fill('vector')
            sidebar.get_by_label('篩選標籤').press('Enter'); settle()
            before = len(calls)
            target = sidebar.get_by_role('link', name='前往搜尋', exact=True)
            scope = parse_qs(urlparse(target.get_attribute('href')).query)
            assert scope['source'] == [source] and scope['topic_id'] == ['vector']
            assert scope['subject_id'] == ['math'] and scope['tag'] == ['vector']
            assert scope['exclude_archived'] == ['yes'] and 'focus' not in scope
            assert (scope.get('collection_id') == ['c1']) == (source == 'contributing')
            target.click(); settle()
            assert '/search?' in page.url
            expect(page.get_by_label('搜尋目前題目來源')).to_be_visible()
            requests = calls[before:]
            assert requests and all(not q.get('metadata_only') for q in requests), (width, source, page.url, requests, calls)
            assert requests[-1]['topic_id'] == ['vector'] and requests[-1]['tag'] == ['vector']
            assert requests[-1]['exclude_archived'] == ['yes']
            page.go_back(); settle(); open_sidebar()
            sidebar.get_by_role('button', name='數學', exact=True).click()
            sidebar.get_by_role('button', name='所有科目', exact=True).click(); settle(); open_sidebar()
            count = len(metadata_calls())
            expect(page.get_by_text('選擇科目後載入題目大綱。', exact=True)).to_be_visible()
            expect(page.get_by_text('錯題大綱清單 (1 題)', exact=True)).to_have_count(0)
            page.wait_for_timeout(150)
            assert len(metadata_calls()) == count
        assert not errors, errors
        context.close()
        print(f'PASS outline gating and scoped search navigation at {width}px')
    browser.close()
