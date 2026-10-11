"""Work-card sync feedback and blank workspace size on the production build.

Synthetic API responses only; run against preview port 4181.
"""
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'sync-user', 'name': '同步測試'}
CO = {'id': 'c1', 'title': '共用集', 'role': 'contributor', 'can_contribute': True,
      'visibility': 'public', 'lifecycle': 'active'}
LEGACY = {'strokes': [], 'eraserMasks': [], 'baseWidth': 800, 'calcSpaceHeight': 850}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000}, service_workers='block')
        held = []
        def fixture(route):
            request = route.request
            url = urlparse(request.url); path = url.path; query = parse_qs(url.query)
            if path.endswith('/image'):
                return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="#fff"/></svg>')
            if path.endswith(('/notes', '/draw')) and request.method == 'PUT':
                held.append((route, request.post_data_json))
                return
            if path == '/api/auth/me': result = {'user': USER}
            elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
            elif path == '/api/me/public-profile': result = {'profile': {'display_name': '同步測試'}}
            elif path == '/api/my/collections': result = {'collections': [CO]}
            elif path == '/api/my/collections/membership': result = {'memberships': {}}
            elif path == '/api/search':
                origin = 'shared' if query.get('contributing') else query.get('origin', ['owned'])[0]
                sid = 's-resume' if query.get('tag') == ['resume'] else 's-legacy' if query.get('tag') == ['legacy'] else 's1' if origin == 'saved' else 'e1' if origin == 'shared' else 'o1'
                row = {'id': sid, 'origin': origin, 'title': '測試题', 'collection_id': 'c1' if origin == 'shared' else None}
                if origin == 'owned': row['problem'] = {'id': sid, 'user_id': USER['id'], 'source': '測試题', 'image_url': 'fixture',
                    'draw_data': None, 'typed_notes': '', 'status': 'unsolved', 'review_count': 0, 'keywords': '[]', 'created_at': '2026-10-11'}
                result = {'items': [row], 'next_offset': None, 'scope': 'mine'}
            elif path in ['/api/saved/s1', '/api/saved/s-legacy', '/api/saved/s-resume']:
                result = {'saved': {'id': path.split('/')[-1], 'entry_id': 'e1', 'personal_topic_id': None, 'status': 'unsolved', 'row_version': 1},
                    'snapshot': {'source_title': '測試题', 'collection_title': '共用集', 'provider_public_name': '老師'},
                    'workspace': {'draw_asset_id': 'existing' if path.endswith('s-legacy') else None, 'draw_seq': 0, 'notes_seq': 0, 'typed_notes': ''},
                    'layers': [], 'source': {'available': True}}
            elif path == '/api/collections/c1/items/e1':
                result = {'collection': CO, 'entry': {'id': 'e1', 'generation': 1}, 'layers': [],
                    'source': {'source': '測試题', 'contributor_id': 'teacher', 'provider_name': '老師'},
                    'capabilities': {'can_contribute': True, 'can_save': True}}
            elif path.endswith('/draw'): result = LEGACY
            else: result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': []}
            route.fulfill(json=result)
        context.route('**/api/**', fixture)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def visit(source, extra='', wait_idle=True):
            page.goto('http://127.0.0.1:4181/study?source=' + source + ('&collection_id=c1' if source == 'contributing' else '') + extra)
            if wait_idle: page.wait_for_load_state('networkidle')
        def next_write():
            for _ in range(40):
                if held: return held.pop(0)
                page.wait_for_timeout(100)
            raise AssertionError('expected a work sync request')
        def height(card):
            area = card.locator('.transition-\\[height\\]')
            page.wait_for_timeout(250)
            return area.bounding_box()['height']
        visit('owned')
        baseline = height(page.locator('[data-problem-id="o1"]'))
        assert baseline > 0
        for source, sid, label in [('saved', 's1', '我的私人筆記'), ('contributing', 'e1', '我的共用筆記')]:
            visit(source)
            card = page.locator(f'[data-problem-id="{sid}"]')
            assert abs(height(card) - baseline) <= 1, (width, source, baseline, height(card))
            status = card.locator('[data-work-sync-status]')
            expect(status.get_by_role('status')).to_have_text('支援即時打字')
            notes = card.get_by_label(label)
            notes.fill('保留草稿')
            expect(status.get_by_role('status')).to_have_text('等待同步…')
            expect(card.get_by_role('button', name='重試同步')).to_have_count(0)
            route, body = next_write()
            assert body['typed_notes'] == '保留草稿'
            expect(status.get_by_role('status')).to_have_text('正在同步存檔…')
            expect(card.get_by_role('button', name='重試同步')).to_have_count(0)
            route.fulfill(status=503, json={'error': {'message': '同步測試失敗'}})
            expect(status.get_by_role('status')).to_have_text('同步失敗')
            retry = status.get_by_role('button', name='重試同步', exact=True)
            expect(retry).to_be_visible()
            assert retry.evaluate('(el)=>getComputedStyle(el).textDecorationLine') == 'underline'
            assert 'text-text-muted' in retry.get_attribute('class')
            retry.click()
            route, body = next_write()
            expect(status.get_by_role('status')).to_have_text('正在同步存檔…')
            expect(card.get_by_role('button', name='重試同步')).to_have_count(0)
            assert body['typed_notes'] == '保留草稿' and body['expected_seq'] == 0
            route.fulfill(json={'notes_seq': 1})
            expect(status.get_by_role('status')).to_have_text('已同步')
            expect(card.get_by_label(label)).to_have_value('保留草稿')
            # Ink writes use the same feedback slot, not a second message below notes.
            card.get_by_title('擴增草稿空間 (+40px)', exact=True).click()
            expect(status.get_by_role('status')).to_have_text('等待同步…')
            route, body = next_write()
            assert body['draw_data']['calcSpaceHeight'] == 140
            expect(status.get_by_role('status')).to_have_text('正在同步存檔…')
            route.fulfill(json={'draw_seq': 1})
            expect(status.get_by_role('status')).to_have_text('已同步')
            assert len(card.get_by_role('status').all()) == 1
            # Offline is pending, not failure; reconnection retries automatically.
            context.set_offline(True)
            notes.fill('離線草稿')
            page.wait_for_timeout(1100)
            expect(status.get_by_role('status')).to_have_text('尚未同步')
            expect(card.get_by_role('button', name='重試同步')).to_have_count(0)
            context.set_offline(False)
            route, body = next_write()
            assert body['typed_notes'] == '離線草稿'
            route.fulfill(json={'notes_seq': 2})
            expect(status.get_by_role('status')).to_have_text('已同步')
            # Conflicts remain visible even when editing/height controls are disabled.
            notes.fill('另一裝置衝突')
            route, _ = next_write()
            route.fulfill(status=409, json={'error': {'message': '另一裝置已修改'}})
            expect(status.get_by_role('status')).to_have_text('同步衝突')
            expect(notes).to_be_disabled()
            expect(card.get_by_role('button', name='重試同步')).to_have_count(0)
            expect(card.get_by_role('button', name='核對雲端版本')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        visit('saved', '&tag=legacy')
        legacy = page.locator('[data-problem-id="s-legacy"]')
        old_height = height(legacy)
        assert old_height > baseline * 2
        legacy.get_by_title('收合推導區（保留高度與筆跡）', exact=True).click()
        legacy.get_by_title('展開推導區 (850px)', exact=True).click()
        assert abs(height(legacy) - old_height) <= 1
        # Pending drafts from a previous visit resume without a misleading retry button.
        target = {'kind': 'saved', 'savedRefId': 's-resume'}
        key = 'rdv:work:v1:sync-user:' + json.dumps(target, separators=(',', ':'))
        page.evaluate('(key)=>localStorage.setItem(key, JSON.stringify({notes:"恢復草稿",inkSeq:0,notesSeq:0}))', key)
        visit('saved', '&tag=resume', wait_idle=False)
        resumed = page.locator('[data-problem-id="s-resume"]')
        expect(resumed.get_by_label('我的私人筆記')).to_have_value('恢復草稿')
        expect(resumed.get_by_role('button', name='重試同步')).to_have_count(0)
        route, body = next_write()
        assert body['typed_notes'] == '恢復草稿'
        expect(resumed.locator('[data-work-sync-status]').get_by_role('status')).to_have_text('正在同步存檔…')
        route.fulfill(json={'notes_seq': 1})
        expect(resumed.locator('[data-work-sync-status]').get_by_role('status')).to_have_text('已同步')
        assert not held and not errors, (held, errors)
        context.close()
        print(f'PASS work sync pending/saving/error/retry/offline/conflict and default height at {width}px')
    browser.close()
