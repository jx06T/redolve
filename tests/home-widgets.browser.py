"""Homepage widget interactions, privacy, offline drafts and narrow layout."""
import copy
import json
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

NOW = 1791763200000  # 2026-10-12 08:00 Taipei
DAY = 86400000
PREFS = {'todos_visible': True, 'countdowns_visible': True, 'row_version': 0}
def row(ident, text, completed=None, kind='todo', date=None):
    return {'id': ident, 'kind': kind, 'text': text, 'target_date': date, 'completed_at': completed,
            'created_at': NOW-10*DAY, 'updated_at': NOW, 'row_version': 1}
INITIAL = [row('unfinished-123', '一直未完成'), row('today-123456', '今日已完成', NOW),
           row('yesterday-123', '昨日已完成', NOW-DAY), row('expired-12345', '過期已完成', NOW-7*DAY)]
INITIAL += [row('countdown-'+str(i), '考試 '+str(i), kind='countdown', date='2027-01-'+str(21+i)) for i in range(1,7)]
for index, item in enumerate(INITIAL): item['created_at'] += index

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [1280, 390]:
        for authenticated in [False, True]:
            if os.environ.get('WIDGET_AUTH') and str(authenticated) != os.environ['WIDGET_AUTH']: continue
            context = browser.new_context(viewport={'width': width, 'height': 1000}, service_workers='block')
            account = 'widget-user' if authenticated else 'guest'
            database = {'items': copy.deepcopy(INITIAL), 'preferences': copy.deepcopy(PREFS)}
            calls, writes, errors = [], [], []
            failing = [False]
            def fixture(route):
                request = route.request; path = urlparse(request.url).path
                if path.endswith('/image'):
                    return route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="white"/><text x="8" y="35">Public question</text></svg>')
                result = {'items': [], 'collections': [], 'subscriptions': [], 'keys': [], 'memberships': {}, 'invitations': [], 'subject_destinations': []}
                if path == '/api/auth/me': result = {'user': {'id': account, 'name': '小組件測試'} if authenticated else None}
                elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
                elif path == '/api/dashboard': result = {'summary': {'total': 0, 'resolved': 0, 'unsolved': 0}, 'subjects': [], 'top_unsolved_topics': []}
                elif path == '/api/public/items': result = {'items': [{'entry_id':'public-'+str(i),'collection_id':'public-collection','collection_title':'公開測試集','title':'公開題目 '+str(i),'topic_label':'數學','is_subscribed':0} for i in range(4)]}
                elif path == '/api/home-widgets' and request.method == 'GET':
                    calls.append(path)
                    if failing[0]: return route.abort()
                    result = copy.deepcopy(database)
                elif path.startswith('/api/home-widgets'):
                    if failing[0]: return route.abort()
                    data = request.post_data_json; writes.append((path, copy.deepcopy(data)))
                    if path.endswith('/preferences'):
                        database['preferences'].update(data['patch']); result = {'preferences': database['preferences']}
                    elif request.method == 'POST':
                        item = copy.deepcopy(data); item['row_version'] = 1
                        existing = next((i for i in database['items'] if i['id'] == item['id']), None)
                        if not existing: database['items'].append(item)
                        result = {'item': existing or item}
                    else:
                        ident = path.split('/')[-1]; item = next(i for i in database['items'] if i['id'] == ident)
                        if request.method == 'DELETE': database['items'].remove(item); result = {'item': None}
                        else:
                            if any(item[k] != v and item[k] != data['patch'][k] for k,v in data['base'].items()):
                                return route.fulfill(status=409, json={'error': '同欄衝突', 'current': item})
                            item.update(data['patch']); item['row_version'] += 1; result = {'item': item}
                route.fulfill(json=result)
            context.route('**/api/**', fixture)
            context.add_init_script('Date.now = () => '+str(NOW))
            initial = json.dumps({'data': database, 'format': 2}, ensure_ascii=False)
            context.add_init_script('''if (!localStorage.getItem('widget-test-seeded')) {
              localStorage.setItem('rdv:home-widgets:v1:''' + account + '''', ''' + json.dumps(initial) + ''');
              localStorage.setItem('rdv:study:resume:''' + account + '''', '/study?source=saved&subject_id=math&topic_id=vector&status=unsolved&focus=s1');
              localStorage.setItem('widget-test-seeded','1');
            }''')
            page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:4181/'); page.wait_for_load_state('networkidle')
            todo = page.get_by_role('region', name='待辦事項小組件', exact=True)
            countdown = page.get_by_role('region', name='事件倒數小組件', exact=True)
            expect(todo).to_be_visible(); expect(countdown).to_be_visible()
            public = page.get_by_role('region',name='公開探索動態',exact=True)
            secondary = page.locator('[data-home-widgets-secondary]')
            expect(public).to_be_visible()
            assert abs(todo.bounding_box()['height']-secondary.bounding_box()['height']) < 2
            assert countdown.bounding_box()['height'] >= public.bounding_box()['height']*1.8, 'countdown gets more of the secondary column'
            assert public.bounding_box()['y'] >= countdown.bounding_box()['y']+countdown.bounding_box()['height']
            assert page.get_by_text('各科目錯題訂正率',exact=True).evaluate('(el)=>!!(el.compareDocumentPosition(document.querySelector("[data-home-widgets]")) & Node.DOCUMENT_POSITION_FOLLOWING)')
            page.locator('[data-home-widgets]').scroll_into_view_if_needed()
            page.screenshot(path=f'.wrangler/qa/home-widgets-initial-{width}-{authenticated}.png', full_page=True)
            assert page.get_by_role('button', name='接續上次刷題').count() == 1
            assert not countdown.get_by_role('button', name='編輯倒數', exact=False).count()
            assert countdown.get_by_text('考試 6', exact=True).count() == 0
            countdown.get_by_role('button', name='查看其餘 1 個倒數').click()
            dialog = page.get_by_role('dialog', name='所有事件倒數')
            expect(dialog.get_by_text('考試 6', exact=True)).to_be_visible()
            assert not dialog.get_by_role('button', name='編輯倒數', exact=False).count()
            dialog.get_by_role('button', name='關閉對話框').click()
            # Today's completion stays in place; older completion stays above a scroll buffer.
            active = todo.locator('[data-todo-current]')
            expect(active.locator('input')).to_have_count(2)
            assert active.locator('input').evaluate_all('(els)=>els.map(e=>e.value)') == ['一直未完成', '今日已完成']
            assert todo.locator('[data-todo-scroll]').evaluate('(el)=>el.scrollTop') > 0
            todo.get_by_role('button', name='查看已完成', exact=True).click()
            expect(todo.locator('[data-todo-row="yesterday-123"]')).to_be_visible()
            todo.get_by_role('button', name='回到待辦', exact=True).click()
            page.wait_for_timeout(350)  # Finish this explicit smooth navigation before checking insertion.
            # Bulk paste, edit, cancel and check do not create separate settings flows.
            add = todo.get_by_role('textbox', name='新增待辦', exact=True)
            old_scroll = todo.locator('[data-todo-scroll]').evaluate('(el)=>el.scrollTop')
            add.fill('第一件\n第二件'); todo.get_by_role('button', name='新增待辦事項').click()
            expect(todo.locator('[data-todo-current] input')).to_have_count(4)
            page.wait_for_timeout(350)
            new_scroll = todo.locator('[data-todo-scroll]').evaluate('(el)=>el.scrollTop')
            assert abs(new_scroll-old_scroll)<2, ('adding tasks must preserve scroll', old_scroll, new_scroll)
            assert todo.locator('[data-todo-current] [data-todo-row]').first.bounding_box()['height'] <= 38, 'compact todo row'
            editable = todo.locator('[data-todo-current] input').nth(2)
            editable.fill('第一件修改'); editable.press('Enter')
            expect(editable).to_have_value('第一件修改')
            editable.fill('取消的修改'); editable.press('Escape')
            expect(editable).to_have_value('第一件修改')
            todo.get_by_role('checkbox', name='完成：第一件修改').click()
            expect(todo.get_by_role('checkbox', name='完成：第一件修改')).to_have_attribute('aria-checked', 'true')
            # A shared account channel avoids another widget GET on Home -> Settings -> Home.
            before = len(calls)
            countdown.get_by_role('button', name='事件倒數選單').click()
            page.get_by_role('dialog').get_by_role('link', name='前往設定管理倒數與顯示方式').click()
            page.wait_for_url('**/settings?widget=countdowns#profile'); page.wait_for_load_state('networkidle')
            assert len(calls) == before, (before, calls)
            manager = page.get_by_role('region', name='事件倒數小組件', exact=True)
            expect(manager).to_be_visible()
            manager.get_by_role('button', name='編輯倒數：考試 1', exact=True).click()
            editor = page.get_by_role('dialog', name='編輯倒數')
            editor.get_by_label('事件名稱').fill('新考試名稱'); editor.get_by_role('button', name='儲存', exact=True).click()
            expect(manager.get_by_role('button', name='編輯倒數：新考試名稱')).to_be_visible()
            page.get_by_role('switch', name='顯示事件倒數').click()
            page.get_by_role('link', name='總覽', exact=True).first.click(); page.wait_for_load_state('networkidle')
            assert not page.get_by_role('region', name='事件倒數小組件', exact=True).count()
            assert len(calls) == before
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
            if not authenticated: assert not calls and not writes, 'guest widgets must stay local'
            else:
                # Persist failed writes through reload, then explicitly retry after reconnect.
                failing[0] = True
                todo = page.get_by_role('region', name='待辦事項小組件', exact=True)
                todo.get_by_role('textbox', name='新增待辦', exact=True).fill('離線仍保留'); todo.get_by_role('button', name='新增待辦事項').click()
                expect(todo.get_by_role('button', name='重試同步')).to_be_visible()
                page.reload(); page.wait_for_load_state('networkidle')
                todo = page.get_by_role('region', name='待辦事項小組件', exact=True)
                assert '離線仍保留' in todo.locator('input').evaluate_all('(els)=>els.map(e=>e.value)')
                failing[0] = False; todo.get_by_role('button', name='重試同步').click()
                page.wait_for_function("!Object.keys(localStorage).some(k=>k.startsWith('rdv:home-widgets:v1:widget-user:operation:'))")
                assert any(i['text']=='離線仍保留' for i in database['items'])
                # Same-field conflicts must apply the chosen version to the actual editor.
                field = todo.locator('[data-todo-row="unfinished-123"] input')
                for keep_local in [False, True]:
                    field.fill('本機希望保留')
                    remote = next(i for i in database['items'] if i['id']=='unfinished-123')
                    remote['text'] = '其他裝置新內容 '+str(keep_local)
                    field.press('Enter')
                    conflict = page.get_by_role('dialog', name='小組件修改需要確認')
                    expect(conflict).to_be_visible()
                    conflict.get_by_role('button', name='保留本機修改' if keep_local else '採用雲端版本', exact=True).click()
                    expected = '本機希望保留' if keep_local else remote['text']
                    expect(field).to_have_value(expected)
                    page.wait_for_function("!Object.keys(localStorage).some(k=>k.startsWith('rdv:home-widgets:v1:widget-user:operation:'))")
                    assert remote['text'] == expected
            # Crossing a Taiwan day moves yesterday's completion, never unfinished work.
            page.evaluate('Date.now = () => '+str(NOW+DAY))
            page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            page.wait_for_load_state('networkidle')
            todo = page.get_by_role('region', name='待辦事項小組件', exact=True)
            expect(todo.locator('[data-todo-current] [data-todo-row="today-123456"]')).to_have_count(0)
            expect(todo.locator('[data-todo-current] [data-todo-row="unfinished-123"]')).to_have_count(1)
            page.screenshot(path=f'.wrangler/qa/home-widgets-{width}-{authenticated}.png', full_page=True)
            assert not errors, errors
            context.close(); print('PASS widgets', width, 'authenticated' if authenticated else 'guest')
    browser.close()
