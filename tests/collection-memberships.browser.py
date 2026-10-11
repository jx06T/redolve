"""Membership badges and return navigation against synthetic APIs, including an old API response."""
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'author', 'name': 'Author'}
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [390, 1280]:
        context = browser.new_context(viewport={'width': width, 'height': 844}, service_workers='block')
        removed = [False]
        reads = []
        co = {'id': 'c1', 'title': 'Collection A', 'visibility': 'public', 'lifecycle': 'active',
              'can_contribute': True, 'is_owner': False, 'role': 'contributor'}
        def fixture(route):
            path = urlparse(route.request.url).path
            if path.endswith('/image'):
                return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="white"/></svg>')
            result = {'items': [], 'collections': [], 'subscriptions': [], 'invitations': [],
                      'keys': [], 'isAdmin': False, 'transfer': None, 'next_cursor': None}
            if path == '/api/auth/me': result = {'user': USER}
            elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
            elif path == '/api/my/collections': result = {'collections': [co]}
            elif path == '/api/me/public-profile': result = {'profile': {'display_name': 'Author'}}
            elif path == '/api/search': result = {'items': [{'id': 'q', 'origin': 'owned', 'title': 'Original',
                'problem': {'id': 'q', 'user_id': 'author', 'source': 'Original', 'image_url': 'image',
                            'status': 'unsolved', 'review_count': 0, 'keywords': '[]', 'draw_data': None}}],
                'next_offset': None, 'scope': 'mine'}
            elif path == '/api/my/collections/membership':
                reads.append(path)
                def membership(cid, state, title):
                    return {'entry_id': cid, 'collection_id': cid, 'title': title, 'state': state,
                            'lifecycle': 'active', 'visibility': 'public'}
                # The retained historical row must not use one of the two visible badge slots.
                result = {'memberships': {'q': [membership('old', 'removed', 'Historical'),
                    membership('c1', 'removed' if removed[0] else 'included', 'Collection A'),
                    membership('c2', 'included', 'Collection B')]}}
            elif path == '/api/collections/c1/items/e1' and route.request.method == 'DELETE':
                removed[0] = True
                result = {'status': 'removed'}
            elif path == '/api/collections/c1': result = {'collection': co, 'items': [] if removed[0] else [
                {'id': 'e1', 'title': 'Original', 'contributor_id': 'author', 'generation': 1,
                 'display_order': 1, 'keywords': '[]', 'question_text': 'Question text'}], 'next_cursor': None}
            route.fulfill(json=result)
        context.route('**/api/**', fixture)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:4181/study?source=owned')
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('link', name='公開 · Collection A', exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='公開 · Collection B', exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='公開 · Historical', exact=True)).to_have_count(0)
        page.get_by_role('link', name='公開 · Collection A', exact=True).click()
        page.get_by_role('button', name='從集合移除', exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='確認', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.go_back()
        expect(page.get_by_role('link', name='公開 · Collection B', exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='公開 · Collection A', exact=True)).to_have_count(0)
        assert len(reads) >= 2, 'returning after removal refetches membership independently of list caching'
        assert not errors, errors
        context.close()
    browser.close()
print('PASS: desktop/mobile badges, legacy removed rows, and remove/return within list cache lifetime')
