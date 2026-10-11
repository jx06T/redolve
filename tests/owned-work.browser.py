"""Owned autosave race/reload/legacy recovery; synthetic APIs only."""
import copy
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
USER = {'id': 'alice', 'name': '草稿測試'}
BLANK = {'strokes': [], 'eraserMasks': [], 'baseWidth': 800, 'calcSpaceHeight': 100}
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000}, service_workers='block')
        cloud = {'id': 'q', 'user_id': 'alice', 'source': '原題', 'draw_data': json.dumps(BLANK),
                 'typed_notes': '雲端原筆記', 'draw_seq': 7, 'notes_seq': 3, 'vector_clock': '{"seq":999}',
                 'image_url': 'fixture', 'status': 'unsolved', 'review_count': 0, 'keywords': '[]'}
        writes, held, errors = [], [], []
        holding = [False]
        def ack(route, data, path):
            if path.endswith('/draw'):
                seq = data['vector_clock']['seq']
                if seq != cloud['draw_seq'] + 1:
                    return route.fulfill(status=409, json={'error': {'code': 'CONFLICT'}})
                cloud.update(draw_data=json.dumps(data['draw_data']), draw_seq=seq, vector_clock=json.dumps({'seq': seq}))
                return route.fulfill(json={'status': 'ok', 'seq': seq})
            seq = data['expected_notes_seq']
            if seq != cloud['notes_seq']:
                return route.fulfill(status=409, json={'error': {'code': 'CONFLICT'}})
            cloud.update(typed_notes=data['typed_notes'], notes_seq=seq+1)
            route.fulfill(json={'status': 'ok', 'notes_seq': seq+1})
        def fixture(route):
            req = route.request; path = urlparse(req.url).path
            if path.endswith('/image'):
                return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="white"/></svg>')
            if req.method in ['PATCH', 'PUT'] and path.startswith('/api/problems/q'):
                data = req.post_data_json; writes.append((path, data))
                if holding[0]: held.append((route, data)); return
                return ack(route, data, path)
            result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': [], 'memberships': {}}
            if path == '/api/auth/me': result = {'user': USER}
            elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
            elif path == '/api/search': result = {'items': [{'id': 'q', 'origin': 'owned', 'title': '原題', 'problem': copy.deepcopy(cloud)}], 'next_offset': None, 'scope': 'mine'}
            elif path == '/api/problems/q': result = {'item': copy.deepcopy(cloud)}
            route.fulfill(json=result)
        context.route('**/api/**', fixture)
        page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:4181/study?source=owned'); page.wait_for_load_state('networkidle')
        card = page.locator('[data-problem-id="q"]'); canvas = card.locator('canvas').last
        expect(canvas).to_be_visible()
        def line(y):
            rect = canvas.bounding_box()
            page.mouse.move(rect['x']+50, rect['y']+y); page.mouse.down()
            page.mouse.move(rect['x']+120, rect['y']+y, steps=3); page.mouse.up()
        for y in [60, 90, 120]: line(y)
        page.wait_for_timeout(1000)
        dw = [data for path, data in writes if path.endswith('/draw')]
        assert len(dw) == 1, (width, dw)
        assert dw[0]['vector_clock']['seq'] == 8 and len(dw[0]['draw_data']['strokes']) == 3
        expect(card.get_by_role('status')).to_have_text('支援即時打字')
        page.keyboard.press('Control+z'); page.wait_for_timeout(800)
        assert len(json.loads(cloud['draw_data'])['strokes']) == 2
        notes = card.get_by_label('本題筆記'); holding[0] = True
        notes.fill('第一份'); page.wait_for_timeout(700); assert len(held) == 1
        notes.fill('第二份'); page.wait_for_timeout(750); assert len(held) == 1
        route, data = held.pop(0); ack(route, data, '/api/problems/q'); page.wait_for_timeout(100)
        assert len(held) == 1
        route, data = held.pop(0); assert data['expected_notes_seq'] == 4
        holding[0] = False; ack(route, data, '/api/problems/q')
        expect(notes).to_have_value('第二份'); expect(card.get_by_role('status')).to_have_text('支援即時打字')
        notes.fill('重新整理前草稿')
        assert page.evaluate('JSON.parse(localStorage.getItem("rdv:owned-work:v1:alice:q")).notes') == '重新整理前草稿'
        page.reload(); page.wait_for_load_state('networkidle')
        expect(page.get_by_label('本題筆記')).to_have_value('重新整理前草稿')
        expect(page.locator('[data-problem-id="q"]').get_by_role('status')).to_have_text('支援即時打字')
        assert cloud['typed_notes'] == '重新整理前草稿'
        cloud.update(notes_seq=cloud['notes_seq']+1, typed_notes='另一份雲端內容')
        page.get_by_label('本題筆記').fill('需要保留的本機內容'); page.wait_for_timeout(900)
        expect(page.get_by_role('button', name='核對雲端版本', exact=True)).to_be_visible()
        page.reload(); page.wait_for_load_state('networkidle')
        expect(page.get_by_label('本題筆記')).to_have_value('需要保留的本機內容')
        page.get_by_role('button', name='核對雲端版本', exact=True).click()
        dialog = page.get_by_role('dialog'); expect(dialog.get_by_text('另一份雲端內容', exact=True)).to_be_visible()
        dialog.get_by_role('button', name='以本機作業更新雲端', exact=True).click(); page.wait_for_timeout(900)
        assert cloud['typed_notes'] == '需要保留的本機內容'
        assert page.evaluate('Object.keys(localStorage).some(k=>k.startsWith("rdv:owned-work:v1:alice:q:backup:"))')
        page.evaluate('''async()=>{
          const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('redolve_offline_db',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
          await new Promise((resolve,reject)=>{const tx=db.transaction('syncQueue','readwrite');
            tx.objectStore('syncQueue').put({id:'q',ownerId:'alice',typed_notes:'舊版保留的本機草稿',notesSeq:0,blockedReason:'筆記版本衝突',timestamp:Date.now()});
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
        }''')
        page.reload(); page.wait_for_load_state('networkidle')
        expect(page.get_by_label('本題筆記')).to_have_value('舊版保留的本機草稿')
        expect(page.get_by_role('button', name='核對雲端版本', exact=True)).to_be_visible()
        assert cloud['typed_notes'] == '需要保留的本機內容'; assert not errors, errors
        context.close()
        print('PASS:', width, 'ink debounce, undo, slow notes, reload, conflict choice, legacy IDB recovery')
    browser.close()
