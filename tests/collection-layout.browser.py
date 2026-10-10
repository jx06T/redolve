"""Collection settings must fit narrow screens even with long native options.

Run against a Vite preview on port 4181. All API responses are local fixtures.
"""
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

LONG_TOPIC = '平面向量的應用、內積與空間坐標中的直線和平面綜合題型'
LONG_NAME = '一位具有很長公開顯示名稱的數學題目貢獻者'


def fixture(route):
    path = urlparse(route.request.url).path
    result = {}
    if path == '/api/auth/me':
        result = {'user': {'id': 'owner', 'name': '老師', 'email': 'owner@example.test'}}
    elif path == '/api/taxonomy':
        result = {'tree': [{'id': 'math', 'label': '高中數學', 'children': [
            {'id': 'vector', 'label': LONG_TOPIC, 'children': []}]}], 'customNodes': [], 'counts': {}}
    elif path == '/api/collections/c1':
        result = {'collection': {'id': 'c1', 'title': '版面測試', 'public_name': '老師',
            'visibility': 'public', 'lifecycle': 'active', 'is_owner': True,
            'can_contribute': True, 'row_version': 1}, 'items': [], 'next_cursor': None}
    elif path.endswith('/grants'):
        result = {'grants': [{'id': 'g1', 'user_id': 'teacher', 'display_name': LONG_NAME,
            'role': 'contributor', 'revoked_at': None}]}
    elif path.endswith('/owner-transfer'):
        result = {'transfer': None}
    elif path.endswith('/stats'):
        result = {'stats': {'item_count': 0, 'contributor_count': 1, 'subscriber_count': 0, 'saved_count': 0}}
    elif path.endswith('/links'):
        result = {'links': []}
    elif path.endswith('/candidates'):
        result = {'items': [], 'next_cursor': None}
    elif path == '/api/me/public-profile':
        result = {'profile': {'display_name': '老師'}}
    route.fulfill(json=result)


def assert_controls_fit(page, width):
    measurements = page.locator('main select, main input:not([type=checkbox])').evaluate_all('''els => els.map(el => {
      const rect = el.getBoundingClientRect();
      const section = el.closest('section').getBoundingClientRect();
      return {name: el.id || el.getAttribute('aria-label') || el.type,
        left: rect.left, right: rect.right, sectionLeft: section.left, sectionRight: section.right};
    })''')
    assert measurements, 'No settings controls found'
    for control in measurements:
        assert control['left'] >= control['sectionLeft'] and control['right'] <= control['sectionRight'] - 15, (width, control)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Page overflow at {width}px'
    assert page.locator('main').evaluate('(el) => el.scrollWidth <= el.clientWidth'), f'Main overflow at {width}px'


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    context.route('**/api/**', fixture)
    page = context.new_page()
    page.goto('http://127.0.0.1:4181/settings/collections/c1')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='題目管理', exact=True)).to_be_visible()
    for width in [320, 375, 390, 768, 1280]:
        page.set_viewport_size({'width': width, 'height': 844})
        for topic in ['', 'vector']:
            page.get_by_label('依科目與課綱單元篩選').select_option(topic)
            page.locator('#candidate-topic').select_option(topic)
            page.get_by_label('選擇接手管理權的貢獻者').select_option('teacher')
            page.wait_for_load_state('networkidle')
            assert_controls_fit(page, width)
        if width == 390:
            Path('.wrangler').mkdir(exist_ok=True)
            page.get_by_role('heading', name='題目管理', exact=True).scroll_into_view_if_needed()
            page.screenshot(path='.wrangler/collection-settings-mobile.png')
    browser.close()
    print('PASS: collection settings controls and long selected options fit 320/375/390/768/1280px without horizontal overflow')
