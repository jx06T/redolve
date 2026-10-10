"""Floating reader controls regression. Run against preview port 4181.

All API/image responses are local fixtures.
"""
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

COLLECTION = {'id': 'c1', 'title': '老師的向量與數學訂閱題目集', 'visibility': 'public', 'lifecycle': 'active'}
ENTRY = {'id': 'e1', 'generation': 1, 'contributor_id': 'teacher', 'display_order': 1}


def fixture(route):
    path = urlparse(route.request.url).path
    if path.endswith('/image'):
        return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#fff"/><text x="40" y="100">Question</text></svg>')
    if path == '/api/auth/me':
        result = {'user': {'id': 'student', 'name': '學生'}}
    elif path == '/api/taxonomy':
        result = {'tree': [], 'customNodes': [], 'counts': {}}
    elif path == '/api/subscriptions':
        result = {'subscriptions': [{'collection_id': 'c1', 'title': COLLECTION['title'], 'last_known_title': COLLECTION['title'], 'can_read': True, 'subscribed_at': '2026-10-11'}]}
    elif path == '/api/public/collections':
        result = {'collections': [{**COLLECTION, 'id': 'c2', 'title': '公開數學題目集'}]}
    elif path == '/api/public/items':
        result = {'items': [{**ENTRY, 'entry_id': f'e{i}', 'collection_id': 'c2'} for i in range(12)], 'next_offset': None}
    elif path in ['/api/collections/c1', '/api/collections/c2']:
        result = {'collection': {**COLLECTION, 'id': path.split('/')[-1]}, 'items': [{**ENTRY, 'id': f'e{i}'} for i in range(12)], 'next_cursor': None}
    elif '/items/' in path:
        result = {'collection': COLLECTION, 'entry': ENTRY, 'source': {'source': '測試題', 'provider_name': '老師', 'topic_id': None}, 'layers': [], 'capabilities': {'can_save': True}}
    else:
        result = {}
    route.fulfill(json=result)


def fits(page):
    assert page.locator('main').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), 'Reader overflow'
    rect = page.get_by_role('region', name='題目閱讀選項').bounding_box()
    assert rect['x'] >= 0 and rect['x'] + rect['width'] <= page.viewport_size['width']
    if page.viewport_size['width'] < 768:
        nav = page.get_by_role('navigation', name='主要導覽').last
        assert rect['y'] + rect['height'] <= nav.bounding_box()['y'], 'Panel overlaps bottom navigation'


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    page = browser.new_page(service_workers='block')
    page.route('**/api/**', fixture)
    for width in [320, 390, 1280]:
        page.set_viewport_size({'width': width, 'height': 844})
        for destination in ['/explore', '/extended?collection_id=c1']:
            page.goto('http://127.0.0.1:4181' + destination)
            page.wait_for_load_state('networkidle')
            trigger = page.get_by_role('button', name='搜尋與篩選', exact=True)
            panel = page.get_by_role('region', name='題目閱讀選項')
            stream = page.locator('[data-reader]')
            expect(trigger).to_have_attribute('aria-expanded', 'false')
            expect(page.get_by_label('搜尋目前觀看範圍')).to_be_hidden()
            before = stream.bounding_box()
            trigger.click()
            expect(panel).to_be_visible()
            fits(page)
            assert abs(stream.bounding_box()['height'] - before['height']) < 1
            assert abs(stream.bounding_box()['y'] - before['y']) < 1, 'Opening controls moves questions'
            page.get_by_label('搜尋目前觀看範圍').fill('向量')
            panel.get_by_role('button', name='收合', exact=True).click()
            trigger.click()
            expect(page.get_by_label('搜尋目前觀看範圍')).to_have_value('向量')
            panel.get_by_role('button', name='搜尋', exact=True).click()
            page.wait_for_load_state('networkidle')
            assert parse_qs(urlparse(page.url).query)['q'] == ['向量']
            expect(trigger).to_have_attribute('aria-expanded', 'false')
            expect(page.get_by_label('已套用搜尋或篩選')).to_be_visible()
            trigger.click()
            fits(page)
            if destination.startswith('/extended'):
                page.get_by_label('閱讀篩選').select_option('starred')
                assert parse_qs(urlparse(page.url).query)['state'] == ['starred']
            page.keyboard.press('Escape')
            expect(trigger).to_be_focused()
            expect(panel).to_be_hidden()
            trigger.click()
            panel.get_by_role('button', name='清除搜尋與篩選').click()
            expect(page.get_by_label('搜尋目前觀看範圍')).to_have_value('')
            expect(page.get_by_label('已套用搜尋或篩選')).to_have_count(0)
            # Clicking the title is outside the panel but inside its wrapper;
            # use a point in the bottom of the question stream instead.
            box = stream.bounding_box()
            page.mouse.click(box['x'] + 10, box['y'] + box['height'] - 10)
            expect(panel).to_be_hidden()
            position = trigger.bounding_box()['y']
            stream.evaluate('(el)=>el.scrollTop=2000')
            page.wait_for_timeout(300)
            assert abs(trigger.bounding_box()['y'] - position) < 1, 'Controls scroll away'
            if width == 390:
                Path('.wrangler').mkdir(exist_ok=True)
                trigger.click()
                page.screenshot(path=f'.wrangler/reader-controls-{destination.split("?")[0][1:]}.png')
                panel.get_by_role('button', name='收合', exact=True).click()
    page.goto('http://127.0.0.1:4181/extended')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='搜尋與篩選')).to_have_attribute('aria-expanded', 'true')
    page.get_by_label('選擇已訂閱的題目集').select_option('c1')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='搜尋與篩選')).to_have_attribute('aria-expanded', 'false')
    expect(page.get_by_role('img', name='測試題').first).to_be_visible()
    browser.close()
    print('PASS: floating controls preserve layout/drafts, apply/reset URL filters, close with Escape/outside click, stay visible while scrolling, and select subscriptions at 320/390/1280px')
