"""Clipboard content for study and read-only search cards; synthetic APIs only."""
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'text-user', 'name': '測試'}
CO = {'id': 'c1', 'title': '集合資訊', 'role': 'contributor', 'can_contribute': True,
      'visibility': 'public', 'lifecycle': 'active'}
TEXT = '真正的題目內文\n' + 'α + β = 42\n' * 400
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        for source in ['owned', 'saved', 'contributing']:
            for view in ['study', 'search']:
                context = browser.new_context(viewport={'width': width, 'height': 1000}, service_workers='block')
                text_calls, errors = [], []
                response_text = [TEXT]
                ident = 'q' if source == 'owned' else 's1' if source == 'saved' else 'e1'
                text_path = '/api/problems/q/text' if source == 'owned' else '/api/saved/s1/text' if source == 'saved' else '/api/collections/c1/items/e1/text'
                item = {'id': 'q', 'user_id': USER['id'], 'source': '來源資訊', 'image_url': 'fixture',
                        'draw_data': None, 'typed_notes': '私人筆記', 'status': 'unsolved', 'review_count': 0, 'keywords': '[]'}
                def fixture(route):
                    path = urlparse(route.request.url).path
                    if path.endswith('/image'):
                        return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="white"/></svg>')
                    if path.endswith('/text'):
                        text_calls.append(path)
                        return route.fulfill(json={'text': response_text[0]})
                    result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': [], 'memberships': {}}
                    if path == '/api/auth/me': result = {'user': USER}
                    elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
                    elif path == '/api/my/collections': result = {'collections': [CO]}
                    elif path == '/api/search':
                        row = {'id': ident, 'origin': 'shared' if source == 'contributing' else source,
                               'title': '來源資訊', 'collection_id': 'c1' if source == 'contributing' else None}
                        if source == 'owned': row['problem'] = item
                        result = {'items': [row], 'next_offset': None, 'scope': 'mine'}
                    elif path == '/api/problems/q': result = {'item': item}
                    elif path == '/api/saved/s1':
                        result = {'saved': {'id': 's1', 'entry_id': 'e1', 'status': 'unsolved', 'row_version': 1},
                                  'snapshot': {'source_title': '來源資訊', 'collection_title': '集合資訊', 'provider_public_name': '作者資訊'},
                                  'workspace': {'draw_asset_id': None, 'draw_seq': 0, 'notes_seq': 0, 'typed_notes': '私人筆記'},
                                  'layers': [], 'source': {'available': True}}
                    elif path == '/api/collections/c1/items/e1':
                        result = {'collection': CO, 'entry': {'id': 'e1', 'generation': 1},
                                  'source': {'id': 'other', 'source': '來源資訊', 'contributor_id': 'teacher'},
                                  'layers': [], 'capabilities': {'can_contribute': True}}
                    route.fulfill(json=result)
                context.route('**/api/**', fixture)
                context.add_init_script("""
                  window.copiedText = null; window.clipboardWrites = 0;
                  Object.defineProperty(navigator, 'clipboard', {value: {
                    write: async items => {window.clipboardWrites++; window.copiedText = await (await items[0].getType('text/plain')).text();},
                    writeText: async text => {window.clipboardWrites++; window.copiedText = text;}
                  }});
                """)
                page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
                query = f'?source={source}' + ('&collection_id=c1' if source == 'contributing' else '') + ('&view=full' if view == 'search' else '')
                page.goto('http://127.0.0.1:4181/' + view + query)
                page.wait_for_load_state('networkidle')
                button = page.get_by_role('button', name='複製題目文字', exact=True)
                expect(button).to_be_visible()
                assert text_calls == [], 'OCR must be fetched only on copy, not on every card load'
                button.click()
                page.wait_for_function('window.copiedText !== null')
                assert page.evaluate('window.copiedText') == TEXT
                assert text_calls == [text_path], text_calls
                expect(page.get_by_text('已複製題目文字', exact=True)).to_be_visible()
                # Empty OCR must not silently copy source/title/classification/notes.
                response_text[0] = '   '
                page.wait_for_timeout(2100)
                button.click()
                expect(page.get_by_text('這題目前沒有擷取到文字可以複製', exact=True)).to_be_visible()
                assert page.evaluate('window.copiedText') == TEXT
                assert not errors, errors
                print(f'PASS {width}px {source} {view}: full OCR + lazy fetch + empty guard')
                context.close()
    browser.close()
