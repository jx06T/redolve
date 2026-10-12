"""Dashboard -> study scope and origin regressions against synthetic APIs."""
import copy
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

USER = {'id': 'entry-user', 'name': '入口測試'}
TREE = [{'id': 'math', 'label': '數學', 'children': [
    {'id': 'vector', 'label': '向量', 'children': [{'id': 'dot', 'label': '內積', 'children': []}]},
    {'id': 'algebra', 'label': '代數', 'children': []}]},
    {'id': 'physics', 'label': '物理', 'children': []}]

def hit(origin, ident, topic, date, status='unsolved'):
    row = {'id': ident, 'origin': origin, 'topic_id': topic, 'title': ident, 'status': status,
           'created_at': date, 'review_count': 0}
    if origin == 'owned':
        row['problem'] = {'id': ident, 'user_id': USER['id'], 'type': 'problem', 'source': ident,
                          'topic_id': topic, 'image_url': 'fixture', 'draw_data': None, 'typed_notes': '',
                          'status': status, 'review_count': 0, 'keywords': '[]', 'created_at': date}
    return row

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000}, service_workers='block')
        rows = [hit('saved', 'saved-dot', 'dot', '2026-10-12'),
                hit('owned', 'owned-algebra', 'algebra', '2026-10-11'),
                hit('owned', 'resolved', 'dot', '2026-10-13', 'resolved'),
                hit('owned', 'other', 'physics', '2026-10-14')]
        calls, errors = [], []
        fail_lookup = [False]
        def fixture(route):
            parsed = urlparse(route.request.url); path = parsed.path; q = parse_qs(parsed.query)
            if path.endswith('/image'):
                return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="white"/></svg>')
            result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': [], 'memberships': {}}
            if path == '/api/auth/me': result = {'user': USER}
            elif path == '/api/taxonomy': result = {'tree': TREE, 'customNodes': [], 'counts': {}}
            elif path == '/api/dashboard':
                result = {'summary': {'total': 4, 'resolved': 1, 'unsolved': 3, 'processing': 0, 'unclassified': 0},
                          'subjects': [{'subject_id': 'math', 'subject_label': '數學', 'total': 3, 'resolved': 1}],
                          'top_unsolved_topics': [{'topic_id': 'vector', 'topic_label': '向量', 'unsolved_count': 1}]}
            elif path == '/api/search':
                calls.append(copy.deepcopy(q))
                if q.get('origin') == ['all'] and fail_lookup[0]:
                    return route.fulfill(status=503, json={'error': {'message': '測試查找失敗'}})
                selected = list(rows)
                if q.get('origin', ['all'])[0] != 'all': selected = [r for r in selected if r['origin'] == q['origin'][0]]
                if q.get('status'): selected = [r for r in selected if r['status'] == q['status'][0]]
                if q.get('topic_id'):
                    topic = q['topic_id'][0]
                    descendants = {'math': ['math', 'vector', 'dot', 'algebra'], 'vector': ['vector', 'dot']}.get(topic, [topic])
                    selected = [r for r in selected if r['topic_id'] in descendants]
                selected.sort(key=lambda r: (r['created_at'], r['origin'], r['id']), reverse=True)
                result = {'items': selected[:int(q.get('limit', ['30'])[0])], 'scope': 'mine', 'next_offset': None}
            elif path == '/api/saved':
                result = {'items': [{'id': 'saved-dot', 'source_title': '已存內積', 'personal_topic_id': 'dot', 'status': 'resolved'}]}
            elif path.endswith('/source-update'): result = {'available': True, 'changed': True, 'changes': ['題目內容']}
            elif path == '/api/saved/saved-dot':
                result = {'saved': {'id': 'saved-dot', 'status': next((r['status'] for r in rows if r['id']=='saved-dot'), 'unsolved'), 'personal_topic_id': 'dot', 'row_version': 1},
                          'snapshot': {'source_title': '已存內積', 'collection_title': '測試集'}, 'layers': [],
                          'workspace': {'draw_asset_id': None, 'draw_seq': 0, 'notes_seq': 0, 'typed_notes': ''}, 'source': {'available': True}}
            route.fulfill(json=result)
        context.route('**/api/**', fixture)
        page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        def home():
            page.goto('http://127.0.0.1:4181/'); page.wait_for_load_state('networkidle')
            page.get_by_role('navigation',name='總覽面板',exact=True).get_by_role('button',name='複習進度' if width>=768 else '複習重點',exact=True).click()
        def verify(button, source, topic=None, focus=None, subject='math'):
            if width<768 and not topic:
                page.get_by_role('navigation',name='總覽面板',exact=True).get_by_role('button',name='各科進度',exact=True).click()
            calls.clear(); button.click(); page.wait_for_url('**/study?**'); page.wait_for_load_state('networkidle')
            params = parse_qs(urlparse(page.url).query)
            assert params['source'] == [source] and params['subject_id'] == [subject] and params['status'] == ['unsolved'], params
            assert params.get('topic_id') == ([topic] if topic else None), params
            assert params.get('focus') == ([focus] if focus else None), params
            assert not set(params).intersection(['q', 'tag', 'collection_id', 'exclude_self']), params
            lookup = [q for q in calls if q.get('origin') == ['all']]
            assert len(lookup) == 1 and lookup[0]['limit'] == ['1'] and lookup[0]['metadata_only'] == ['1'], calls
            assert lookup[0]['status'] == ['unsolved'] and lookup[0].get('topic_id') == ([topic or subject] if subject!='all' else None)
            assert all(q.get('status') == ['unsolved'] for q in calls), calls
            assert all(q.get('origin') in [['all'], [source]] for q in calls), calls
            if width < 1024: page.get_by_role('button', name='開啟刷題側邊欄', exact=True).click()
            sidebar = page.locator('aside' if width >= 1024 else '#study-mobile-sidebar')
            expect(sidebar.get_by_role('button', name='數學' if subject=='math' else '所有科目', exact=True)).to_be_visible()
            assert 'text-primary' in sidebar.get_by_role('button', name='未訂正', exact=True).get_attribute('class')
            if topic: expect(sidebar.get_by_role('button', name='選擇分類向量', exact=True)).to_have_attribute('aria-pressed', 'true')
        # Prior tab/source scope must not leak into an explicit dashboard entry.
        page.goto('http://127.0.0.1:4181/search?source=owned&topic_id=physics&status=resolved&q=prior&tag=prior')
        page.wait_for_load_state('networkidle'); home()
        verify(page.get_by_role('button', name='數學 2 題待複習', exact=False), 'saved', focus='saved-dot')
        home(); verify(page.get_by_role('button', name='#1 向量', exact=False), 'saved', 'vector', 'saved-dot')
        home(); verify(page.get_by_role('button', name='進入刷題', exact=True), 'owned', focus='other', subject='all')
        # Move the latest unresolved item to owned; a newer resolved item cannot win.
        rows.insert(0, hit('owned', 'owned-dot', 'dot', '2026-10-15'))
        # Invalidate transport cache by reloading a fresh browser context page.
        home(); verify(page.get_by_role('button', name='數學 2 題待複習', exact=False), 'owned', focus='owned-dot')
        home(); verify(page.get_by_role('button', name='#1 向量', exact=False), 'owned', 'vector', 'owned-dot')
        # Single saved update follows the user's classification, including resolved items.
        next(r for r in rows if r['id']=='saved-dot')['status']='resolved'
        home(); page.get_by_role('navigation',name='總覽面板',exact=True).get_by_role('button',name='日常工具' if width>=768 else '倒數／探索',exact=True).click()
        page.get_by_role('button',name='共用與訂閱動態 · 1 項更新',exact=True).click()
        link = page.get_by_role('link', name='已存題目 · 來源有更新 已存內積', exact=False)
        params = parse_qs(urlparse(link.get_attribute('href')).query)
        assert params == {'source': ['saved'], 'subject_id': ['math'], 'topic_id': ['dot'], 'status': ['resolved'], 'focus': ['saved-dot']}, params
        link.click(); page.wait_for_url('**/study?**'); page.wait_for_load_state('networkidle')
        expect(page.locator('[data-problem-id="saved-dot"]')).to_be_visible()
        # Empty scopes stay scoped and unresolved, without an impossible focus target.
        rows[:] = [r for r in rows if r['topic_id'] == 'physics']
        home(); verify(page.get_by_role('button', name='#1 向量', exact=False), 'owned', 'vector')
        expect(page.get_by_text('目前範圍沒有題目。', exact=True)).to_be_visible()
        # Failed lookups leave the dashboard usable rather than choosing a wrong origin.
        fail_lookup[0] = True; home(); page.get_by_role('button', name='#1 向量', exact=False).click()
        expect(page.get_by_text('測試查找失敗', exact=True)).to_be_visible()
        assert urlparse(page.url).path == '/'
        expect(page.get_by_role('button', name='#1 向量', exact=False)).to_be_enabled()
        assert not errors, errors
        context.close(); print('PASS dashboard subject/unit/single/empty/failure scope:', width)
        guest = browser.new_context(viewport={'width': width, 'height': 1000}, service_workers='block')
        guest_calls = []
        def guest_fixture(route):
            path = urlparse(route.request.url).path; guest_calls.append(path)
            if path == '/api/auth/me': result = {'user': None}
            elif path == '/api/taxonomy': result = {'tree': TREE, 'customNodes': [], 'counts': {}}
            else: result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': []}
            route.fulfill(json=result)
        guest.route('**/api/**', guest_fixture)
        page = guest.new_page(); page.goto('http://127.0.0.1:4181/'); page.wait_for_load_state('networkidle')
        page.evaluate('''async()=>{
          const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('redolve_offline_db',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
          await new Promise((resolve,reject)=>{const tx=db.transaction('offlineProblems','readwrite');
            for(const [id,status,timestamp] of [['temp-entry','unsolved',1700000000000],['temp-resolved','resolved',1800000000000]]){
              tx.objectStore('offlineProblems').put({id,status,timestamp,topicId:'dot',source:'本機內積',
                fileData:new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"></svg>').buffer,fileType:'image/svg+xml'});
            }tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
        }''')
        for label, topic in [('數學 1 題待複習', None), ('#1 內積', 'dot')]:
            page.goto('http://127.0.0.1:4181/'); page.wait_for_load_state('networkidle')
            page.get_by_role('navigation',name='總覽面板',exact=True).get_by_role('button',name='複習進度' if width>=768 else '各科進度' if topic is None else '複習重點',exact=True).click()
            page.get_by_role('button', name=label, exact=False).click(); page.wait_for_url('**/study?**')
            page.wait_for_load_state('networkidle'); params = parse_qs(urlparse(page.url).query)
            assert params['source'] == ['owned'] and params['subject_id'] == ['math'] and params['status'] == ['unsolved']
            assert params.get('topic_id') == ([topic] if topic else None) and params['focus'] == ['temp-entry'], params
            expect(page.locator('[data-problem-id="temp-entry"]')).to_be_visible()
        assert '/api/search' not in guest_calls and '/api/dashboard' not in guest_calls, guest_calls
        guest.close(); print('PASS guest local subject/unit scope without remote query:', width)
    browser.close()
