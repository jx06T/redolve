"""Adopt cloud then write again across all study sources; synthetic APIs only."""
import copy
import json
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'adoption-user', 'name': '採用測試'}
CO = {'id': 'c1', 'title': '測試集', 'role': 'contributor', 'can_contribute': True,
      'visibility': 'public', 'lifecycle': 'active'}
REMOTE = {'color': '#374151', 'width': 2, 'points': [[10, 20, .5], [35, 20, .5]]}
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        for source in os.environ.get('ADOPTION_SOURCES', 'owned,saved,contributing').split(','):
            context = browser.new_context(viewport={'width': width, 'height': 1000}, service_workers='block')
            cloud = {'ink': {'strokes': [], 'eraserMasks': [], 'baseWidth': 800, 'calcSpaceHeight': 500},
                     'notes': '原筆記', 'inkSeq': 2, 'notesSeq': 3}
            writes, errors = [], []
            item_id = 'q' if source == 'owned' else 's1' if source == 'saved' else 'e1'
            def item():
                return {'id': 'q', 'user_id': USER['id'], 'source': '原題', 'image_url': 'fixture',
                        'draw_data': json.dumps(cloud['ink']), 'typed_notes': cloud['notes'],
                        'draw_seq': cloud['inkSeq'], 'notes_seq': cloud['notesSeq'],
                        'status': 'unsolved', 'review_count': 0, 'keywords': '[]'}
            def fixture(route):
                request = route.request; path = urlparse(request.url).path
                if path.endswith('/image'):
                    return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="white"/></svg>')
                if request.method in ['PUT', 'PATCH'] and (path.endswith(('/draw', '/notes')) or path == '/api/problems/q'):
                    data = request.post_data_json; writes.append((path, copy.deepcopy(data)))
                    if path.endswith('/draw'):
                        seq = data['vector_clock']['seq'] - 1 if source == 'owned' else data['expected_seq']
                        if seq != cloud['inkSeq']:
                            return route.fulfill(status=409, json={'error': {'code': 'CONFLICT', 'message': '雲端版本不同'}})
                        cloud.update(ink=data['draw_data'], inkSeq=seq+1)
                        return route.fulfill(json={'seq': seq+1, 'draw_seq': seq+1})
                    seq = data['expected_notes_seq'] if source == 'owned' else data['expected_seq']
                    if seq != cloud['notesSeq']:
                        return route.fulfill(status=409, json={'error': {'code': 'CONFLICT', 'message': '雲端版本不同'}})
                    cloud.update(notes=data['typed_notes'], notesSeq=seq+1)
                    return route.fulfill(json={'notes_seq': seq+1})
                result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': [], 'memberships': {}}
                if path == '/api/auth/me': result = {'user': USER}
                elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
                elif path == '/api/me/public-profile': result = {'profile': {'display_name': '採用測試'}}
                elif path == '/api/my/collections': result = {'collections': [CO]}
                elif path == '/api/search':
                    row = {'id': item_id, 'origin': 'shared' if source == 'contributing' else source,
                           'title': '原題', 'collection_id': 'c1' if source == 'contributing' else None}
                    if source == 'owned': row['problem'] = item()
                    result = {'items': [row], 'next_offset': None, 'scope': 'mine'}
                elif path == '/api/problems/q': result = {'item': item()}
                elif path == '/api/saved/s1':
                    result = {'saved': {'id': 's1', 'entry_id': 'e1', 'status': 'unsolved', 'row_version': 1},
                              'snapshot': {'source_title': '原題', 'collection_title': '測試集'},
                              'workspace': {'draw_asset_id': 'ink', 'draw_seq': cloud['inkSeq'],
                                            'notes_seq': cloud['notesSeq'], 'typed_notes': cloud['notes']},
                              'layers': [], 'source': {'available': True}}
                elif path == '/api/collections/c1/items/e1':
                    result = {'collection': CO, 'entry': {'id': 'e1', 'generation': 1},
                              'source': {'id': 'other', 'source': '原題', 'contributor_id': 'teacher'},
                              'layers': [{'id': 'l1', 'user_id': USER['id'], 'author_display': '採用測試',
                                          'draw_asset_id': 'ink', 'draw_seq': cloud['inkSeq'],
                                          'notes_seq': cloud['notesSeq'], 'typed_notes': cloud['notes']}],
                              'capabilities': {'can_contribute': True}}
                elif path.endswith('/draw'): result = cloud['ink']
                route.fulfill(json=result)
            context.route('**/api/**', fixture)
            page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('http://127.0.0.1:4181/study?source=' + source + ('&collection_id=c1' if source == 'contributing' else ''))
            page.wait_for_load_state('networkidle')
            card = page.locator(f'[data-problem-id="{item_id}"]')
            notes = card.get_by_label('本題筆記' if source == 'owned' else '我的私人筆記' if source == 'saved' else '我的共用筆記')
            canvas = card.locator('canvas').last; expect(canvas).to_be_visible()
            def line(y):
                rect = canvas.bounding_box()
                page.mouse.move(rect['x']+50, rect['y']+y); page.mouse.down()
                page.mouse.move(rect['x']+110, rect['y']+y, steps=3); page.mouse.up()
            line(70); notes.fill('捨棄的本機筆記')
            # A legacy cloud drawing deliberately omits geometry. Adoption must
            # restore the default, not preserve local height/base-width or undo.
            cloud.update(ink={'strokes': [REMOTE], 'eraserMasks': []}, notes='採用的雲端筆記', inkSeq=9, notesSeq=7)
            dialog = page.get_by_role('dialog'); expect(dialog).to_be_visible(timeout=6000); expect(dialog.get_by_text('採用的雲端筆記', exact=True)).to_be_visible()
            dialog.get_by_role('button', name='保留雲端版本', exact=True).click()
            expect(dialog).to_have_count(0); expect(notes).to_have_value('採用的雲端筆記')
            expect(card.get_by_title('展開推導區 (100px)', exact=True)).to_have_count(0)
            expect(card.get_by_title('收合推導區（保留高度與筆跡）', exact=True)).to_be_visible()
            card.get_by_title('收合推導區（保留高度與筆跡）', exact=True).click()
            expect(card.get_by_title('展開推導區 (100px)', exact=True)).to_be_visible()
            card.get_by_title('展開推導區 (100px)', exact=True).click()
            assert page.evaluate('Object.keys(localStorage).filter(k=>/^rdv:(owned-work|work):v1:/.test(k)&&!k.includes(":backup:")).length') == 0
            assert page.evaluate('Object.keys(localStorage).some(k=>k.includes(":backup:"))')
            count = len(writes)
            card.get_by_title('擴增草稿空間 (+40px)', exact=True).click()
            page.wait_for_timeout(1200)
            data = writes[-1][1]
            assert len(writes) == count+1 and data['draw_data']['strokes'] == [REMOTE], (width, source, writes)
            assert data['draw_data']['calcSpaceHeight'] == 140 and cloud['inkSeq'] == 10
            # Fresh history may undo cloud strokes, but cannot resurrect local ink.
            notes.blur(); line(100); page.wait_for_timeout(1200)
            assert len(cloud['ink']['strokes']) == 2
            page.keyboard.press('Control+z'); page.wait_for_timeout(1200)
            assert cloud['ink']['strokes'] == [REMOTE], cloud
            notes.fill('採用後的新筆記'); page.wait_for_timeout(1200)
            assert cloud['notes'] == '採用後的新筆記' and cloud['notesSeq'] == 8
            expect(card.get_by_role('button', name='核對雲端版本', exact=True)).to_have_count(0)
            page.reload(); page.wait_for_load_state('networkidle')
            expect(page.get_by_label('本題筆記' if source == 'owned' else '我的私人筆記' if source == 'saved' else '我的共用筆記')).to_have_value('採用後的新筆記')
            assert not errors, errors
            context.close(); print('PASS cloud adoption -> geometry, ink/undo, notes, reload:', width, source)
    browser.close()
