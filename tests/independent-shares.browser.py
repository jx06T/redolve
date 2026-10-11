"""Production-build UI regression with synthetic APIs; no real sharing or writes."""
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'share-ui', 'name': '測試帳號'}
CO = {'id': 'c1', 'title': '集合', 'visibility': 'restricted', 'lifecycle': 'active', 'can_contribute': True, 'role': 'contributor'}
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [390, 1280]:
        context = browser.new_context(viewport={'width': width, 'height': 844}, service_workers='block')
        state = {'guest': False, 'allowed': True, 'links': [], 'expired': False}
        writes = []
        def fixture(route):
            req = route.request; url = urlparse(req.url); path = url.path; query = parse_qs(url.query)
            if '/share/' in path and req.resource_type == 'document': return route.continue_()
            if path.endswith('/image'):
                return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="3000"><rect width="800" height="1000" fill="#fff"/></svg>')
            if path == '/api/auth/me': result = {'user': None if state['guest'] else USER}
            elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
            elif path == '/api/me/public-profile': result = {'profile': {'display_name': '測試帳號'}}
            elif path == '/api/my/collections': result = {'collections': [CO]}
            elif path == '/api/my/collections/membership': result = {'memberships': {}}
            elif path == '/api/search':
                kind = 'shared' if query.get('contributing') else query.get('origin', ['owned'])[0]
                sid = 'e1' if kind == 'shared' else 's1' if kind == 'saved' else 'o1'
                row = {'id': sid, 'origin': kind, 'title': '題目', 'collection_id': 'c1' if kind == 'shared' else None}
                if kind == 'owned': row['problem'] = {'id': sid, 'user_id': USER['id'], 'source': '題目', 'image_url': 'img', 'status': 'unsolved', 'review_count': 0, 'keywords': '[]', 'typed_notes': '', 'draw_data': None}
                result = {'items': [row], 'next_offset': None, 'scope': 'mine'}
            elif path == '/api/saved/s1':
                result = {'saved': {'id': 's1', 'entry_id': 'e1', 'status': 'unsolved', 'personal_topic_id': None, 'row_version': 1},
                    'snapshot': {'source_title': '題目', 'collection_title': '集合', 'provider_public_name': '老師'},
                    'workspace': {'draw_asset_id': None, 'draw_seq': 0, 'notes_seq': 0, 'typed_notes': ''}, 'layers': [], 'source': {'available': True}, 'capabilities': {'can_create_share': state['allowed']}}
            elif path == '/api/collections/c1/items/e1': result = {'collection': CO, 'entry': {'id': 'e1', 'generation': 1}, 'source': {'source': '題目', 'contributor_id': 'teacher', 'provider_name': '老師'}, 'layers': [], 'capabilities': {'can_contribute': True, 'can_save': True, 'can_create_share': True}}
            elif path.endswith('/shares') or path == '/api/me/question-shares': result = {'shares': state['links'], 'next_cursor': None}
            elif path.endswith('/share') and req.method == 'POST':
                writes.append((path, req.post_data_json))
                state['links'] = [{'token': 'qs_demo', 'source': '題目', 'origin_kind': 'saved', 'allow_ink': True, 'allow_notes': True, 'expires_at': None, 'created_at': '2026-10-11'}]
                result = {'token': 'qs_demo'}
            elif path.startswith('/api/me/question-shares/') and req.method == 'DELETE':
                state['links'] = []; result = {'status': 'revoked'}
            elif path == '/share/qs_demo':
                if state['expired']: return route.fulfill(status=410, json={'error': {'message': '此分享連結已過期'}})
                result = {'item': {'id': 'share:qs_demo', 'source': '題目來源', 'typed_notes': '分享者筆記', 'keywords': '[]'}, 'share': {'token': 'qs_demo', 'allow_ink': False, 'allow_notes': True, 'fixed_version': True}, 'origin': {'kind': 'collection', 'provider_name': '老師', 'can_visit': False, 'access_hint': 'login'}}
            else: result = {'items': [], 'collections': [], 'subscriptions': [], 'invitations': [], 'keys': [], 'isAdmin': False}
            route.fulfill(json=result)
        context.route('**/api/**', fixture); context.route('**/share/**', fixture)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        for source, path in [('owned', '/api/problems/o1/share'), ('saved', '/api/saved/s1/share'), ('contributing', '/api/collections/c1/items/e1/share')]:
            page.goto('http://127.0.0.1:4181/study?source='+source+('&collection_id=c1' if source == 'contributing' else ''))
            page.get_by_role('button', name='分享此題').click()
            modal = page.get_by_role('dialog', name='分享此題')
            expect(modal.get_by_role('switch', name='包含我的筆跡')).to_be_visible()
            modal.get_by_role('button', name='建立獨立分享連結').click()
            expect(modal.get_by_label('題目分享網址')).to_have_value('http://127.0.0.1:4181/share/qs_demo')
            assert writes[-1][0] == path
            assert modal.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
            page.keyboard.press('Escape')
        state['allowed'] = False
        page.goto('http://127.0.0.1:4181/study?source=saved')
        page.get_by_role('button', name='分享此題').click()
        expect(page.get_by_role('button', name='建立獨立分享連結')).to_be_disabled()
        expect(page.get_by_text('此版本未取得再分享授權。集合開啟再分享後，可重新更新來源取得授權。')).to_be_visible()
        page.keyboard.press('Escape')
        page.goto('http://127.0.0.1:4181/settings#profile')
        page.get_by_text('我的單題分享連結', exact=True).click()
        page.get_by_role('button', name='撤銷', exact=True).click()
        expect(page.get_by_text('尚無獨立分享連結。')).to_be_visible()
        state['guest'] = True
        page.goto('http://127.0.0.1:4181/share/qs_demo')
        expect(page.get_by_text('單題分享 · 建立連結時的版本')).to_be_visible()
        expect(page.get_by_text('分享者筆記', exact=True)).to_be_attached()
        assert page.get_by_role('link', name='前往公開集合').count() == 0
        page.get_by_role('button', name='登入以查看來源').click()
        expect(page.get_by_role('dialog', name='登入與帳號')).to_be_visible()
        page.keyboard.press('Escape')
        page.wait_for_load_state('networkidle')
        page.wait_for_function("document.querySelector('img[alt=\"分享題目圖片\"]')?.complete")
        root = page.locator('.h-full.overflow-y-auto.bg-page-bg')
        assert root.evaluate('(el)=>el.scrollHeight>el.clientHeight'), root.evaluate('(el)=>({scroll:el.scrollHeight,height:el.clientHeight,image:el.querySelector(\"img\").clientHeight})')
        assert root.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        if width == 390: page.screenshot(path='.wrangler/independent-share-mobile.png')
        state['expired'] = True
        page.reload()
        expect(page.get_by_text('此分享連結已過期')).to_be_visible()
        assert not errors, errors
        context.close()
    browser.close()
print('PASS: uploaded/saved/shared modal, disabled permission, global revocation, anonymous read/login, expiry, scroll and responsive widths')
