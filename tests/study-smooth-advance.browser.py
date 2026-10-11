"""Verify actual animation frames for study completion and paginated advance.

Run against preview port 4181. All account, image and mutation requests are fixtures.
"""
import json
import re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'smooth-test', 'name': '滾動測試'}
INK = {'strokes': [], 'eraserMasks': [], 'baseWidth': 800, 'calcSpaceHeight': 850}
CO = {'id': 'c1', 'title': '滾動共用集', 'role': 'contributor', 'can_contribute': True,
      'visibility': 'public', 'lifecycle': 'active'}


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [390, 1280]:
        for source in ['owned', 'saved', 'contributing']:
            for paginated in [False, True]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
                progress = {}
                writes = []
                errors = []

                def fixture(route):
                    request = route.request
                    parsed = urlparse(request.url)
                    path, query = parsed.path, parse_qs(parsed.query)
                    body = request.post_data_json if request.method in ['PATCH', 'PUT', 'POST'] and request.post_data else {}
                    if path.endswith('/image'):
                        return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#fff"/></svg>')
                    if request.method != 'GET':
                        writes.append(path)
                    if path == '/api/auth/me': result = {'user': USER}
                    elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
                    elif path == '/api/me/public-profile': result = {'profile': {'display_name': '滾動測試'}}
                    elif path == '/api/my/collections': result = {'collections': [CO]}
                    elif path == '/api/my/collections/membership': result = {'memberships': {}}
                    elif path == '/api/search':
                        origin = 'shared' if source == 'contributing' else source
                        offset = int(query.get('offset', ['0'])[0])
                        indices = [0] if paginated and not offset else range(1, 6) if paginated else range(6)
                        rows = []
                        for i in indices:
                            sid = f'{source}{i}'
                            row = {'id': sid, 'origin': origin, 'title': sid, 'collection_id': 'c1' if origin == 'shared' else None}
                            if origin == 'owned':
                                row['problem'] = {'id': sid, 'user_id': USER['id'], 'source': sid, 'image_url': 'fixture',
                                    'status': progress.get(sid, {}).get('status', 'unsolved'), 'review_count': 0, 'keywords': '[]',
                                    'draw_data': json.dumps(INK), 'vector_clock': '{"seq":0}', 'notes_seq': 0, 'created_at': '2026-10-11'}
                            rows.append(row)
                        result = {'items': rows, 'next_offset': 30 if paginated and not offset else None, 'scope': 'mine'}
                    elif re.fullmatch(r'/api/problems/owned\d/status', path):
                        progress[path.split('/')[-2]] = body
                        result = {'success': True}
                    elif re.fullmatch(r'/api/saved/saved\d', path):
                        sid = path.split('/')[-1]
                        current = progress.setdefault(sid, {'status': 'unsolved', 'review_count': 0, 'row_version': 1})
                        if request.method == 'PATCH':
                            current.update(status=body['status'], review_count=body['review_count'], row_version=current['row_version'] + 1)
                        result = {'saved': {'id': sid, 'entry_id': sid, 'personal_topic_id': None, **current},
                            'snapshot': {'source_title': sid, 'collection_title': CO['title'], 'provider_public_name': '老師'},
                            'workspace': {'draw_asset_id': 'ink', 'draw_seq': 0, 'notes_seq': 0, 'typed_notes': ''},
                            'layers': [], 'source': {'available': True}, 'row_version': current['row_version']}
                    elif re.fullmatch(r'/api/collections/c1/items/contributing\d/progress', path):
                        sid = path.split('/')[-2]
                        current = progress.setdefault(sid, {'status': 'unsolved', 'row_version': 0, 'review_count': 0, 'previous_status': 'unsolved'})
                        current.update(status='resolved', row_version=current['row_version'] + 1)
                        result = {'progress': current}
                    elif re.fullmatch(r'/api/collections/c1/items/contributing\d', path):
                        sid = path.split('/')[-1]
                        result = {'collection': CO, 'entry': {'id': sid, 'generation': 1}, 'progress': progress.get(sid),
                            'source': {'id': 'original-' + sid, 'source': sid, 'contributor_id': 'teacher', 'provider_name': '老師'},
                            'layers': [{'id': 'my-layer', 'user_id': USER['id'], 'author_display': '滾動測試', 'draw_asset_id': 'ink', 'draw_seq': 0, 'notes_seq': 0}],
                            'capabilities': {'can_contribute': True, 'can_save': True}}
                    elif path.endswith('/draw'): result = INK
                    else: result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': []}
                    route.fulfill(json=result)

                context.route('**/api/**', fixture)
                context.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(status=200, content_type='text/css', body=''))
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto('http://127.0.0.1:4181/study?source=' + source + ('&collection_id=c1' if source == 'contributing' else ''))
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('button', name='完成當題訂正', exact=True)).to_be_visible()
                stream = page.locator('[data-reader]')
                page.wait_for_timeout(1000)

                def animate(action):
                    stream.evaluate('''el => {
                        window.advanceFrames = [el.scrollTop];
                        const start = performance.now();
                        const record = () => {
                            window.advanceFrames.push(el.scrollTop);
                            if (performance.now() - start < 1100) requestAnimationFrame(record);
                        };
                        requestAnimationFrame(record);
                    }''')
                    action()
                    page.wait_for_timeout(1200)
                    frames = page.evaluate('window.advanceFrames')
                    start, end = frames[0], frames[-1]
                    assert end - start > 100, (width, source, paginated, frames)
                    intermediate = {round(y) for y in frames if start + 3 < y < end - 3}
                    assert len(intermediate) >= 4, f'Instant jump: {width}, {source}, paging={paginated}: {frames}'
                    assert max(abs(b - a) for a, b in zip(frames, frames[1:])) < (end - start) * .65, f'Discontinuous scroll: {frames}'

                animate(lambda: page.get_by_role('button', name='完成當題訂正', exact=True).click())
                assert progress[source + '0']['status'] == 'resolved'
                assert any(source + '0' in path for path in writes)
                assert abs(stream.locator('[data-index="1"]').bounding_box()['y'] - stream.bounding_box()['y']) < 12

                # An already resolved question advances via the same floating action / keyboard command.
                stream.evaluate('(el)=>el.scrollTop=0')
                page.wait_for_timeout(300)
                expect(page.get_by_role('button', name='切換下一題', exact=True)).to_be_visible()
                writes_before = len(writes)
                animate(lambda: page.keyboard.press('Control+Enter'))
                assert len(writes) == writes_before, 'Already resolved advance must not repeat the status mutation'
                assert not errors, errors
                context.close()
                print(f'PASS: smooth completion/keyboard advance, width={width}, source={source}, pagination={paginated}', flush=True)
    browser.close()
