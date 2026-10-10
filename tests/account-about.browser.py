from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

state = {'guest': False, 'fail': False, 'total': 219, 'nickname': '公開暱稱'}
requests = []

def fixture(route):
    path = urlparse(route.request.url).path
    requests.append(path)
    if path == '/api/auth/logout':
        state['guest'] = True
        result = {'success': True}
    elif path == '/api/auth/me':
        result = {'user': None if state['guest'] else {'id': 'account-test', 'name': '登入名稱', 'email': 'account@example.test'}}
    elif path == '/api/taxonomy': result = {'tree': [], 'customNodes': [], 'counts': {}}
    elif path == '/api/me/public-profile': result = {'profile': {'display_name': state['nickname']}}
    elif path == '/api/dashboard': result = {'summary': {'total': state['total'], 'resolved': 5, 'unsolved': 214, 'processing': 0}, 'subjects': [], 'top_unsolved_topics': []}
    elif path == '/api/my/collections': result = {'collections': [{'id': 'owner', 'title': '自己的集合', 'role': 'owner'}, {'id': 'shared', 'title': '共同貢獻', 'role': 'contributor'}, {'id': 'view', 'title': '僅觀看', 'role': 'viewer'}]}
    elif path == '/api/auth/google/url': result = {'configured': False}
    else: result = {'keys': [], 'invitations': [], 'collections': [], 'isAdmin': False, 'default_collection_id': None}
    if state['fail'] and path in ['/api/dashboard', '/api/me/public-profile']:
        route.fulfill(status=503, json={'error': {'message': '測試失敗'}})
    else: route.fulfill(json=result)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    page = browser.new_page(service_workers='block')
    page.route('**/api/**', fixture)
    for width in [320, 390, 1280]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.goto('http://127.0.0.1:4181/about')
        expect(page.get_by_role('heading', name='把錯題整理成自己的複習流程')).to_be_visible()
        assert page.locator('main').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        page.wait_for_load_state('networkidle')
        baseline = requests.count('/api/dashboard')
        assert baseline == 0 if width == 320 else True, 'Closed account view should not fetch statistics'
        trigger = page.get_by_role('button', name='開啟帳號資訊')
        trigger.click()
        dialog = page.get_by_role('dialog', name='我的帳號')
        expect(dialog.get_by_text('公開暱稱', exact=True)).to_be_visible()
        expect(dialog.locator('dd > span:first-child').nth(0)).to_have_text('219')
        expect(dialog.locator('dd > span:first-child').nth(1)).to_have_text('2')
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        if width == 390: page.screenshot(path='.wrangler/account-summary-mobile.png')
        page.keyboard.press('Escape')
        expect(dialog).to_have_count(0)
        expect(trigger).to_be_focused()
        trigger.click()
        dialog.get_by_role('link', name='前往設定', exact=True).click()
        expect(page).to_have_url('http://127.0.0.1:4181/settings#profile')
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.get_by_role('button', name='開啟帳號資訊').click()
        page.get_by_role('link', name='關於與使用說明', exact=True).click()
        expect(page).to_have_url('http://127.0.0.1:4181/about')
        page.get_by_role('button', name='查看完整快捷鍵與手勢').click()
        expect(page.get_by_role('dialog')).to_have_count(1)
        page.keyboard.press('?')
        expect(page.get_by_role('dialog')).to_have_count(0)

    state['fail'] = True
    page.get_by_role('button', name='開啟帳號資訊').click()
    dialog = page.get_by_role('dialog', name='我的帳號')
    expect(dialog.get_by_text('部分資訊暫時無法取得。')).to_be_visible()
    expect(dialog.locator('dd > span:first-child').nth(0)).to_have_text('暫無法取得')
    expect(dialog.locator('dd > span:first-child').nth(1)).to_have_text('2')
    state.update(fail=False, total=220, nickname='更新後暱稱')
    dialog.get_by_role('button', name='重新讀取').click()
    expect(dialog.get_by_text('更新後暱稱', exact=True)).to_be_visible()
    expect(dialog.locator('dd > span:first-child').nth(0)).to_have_text('220')
    dialog.get_by_role('button', name='登出', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    baseline = requests.count('/api/my/collections')
    page.get_by_role('button', name='登入', exact=True).click()
    guest = page.get_by_role('dialog', name='登入與帳號')
    expect(guest.locator('dd > span:first-child')).to_have_text('0')
    assert requests.count('/api/my/collections') == baseline, 'Guest account view fetched private collections'
    guest.get_by_role('button', name='使用 Google 登入／註冊').click()
    expect(page.get_by_text('目前無法使用 Google 登入，請稍後再試', exact=True)).to_be_visible()
    guest.get_by_role('link', name='關於與使用說明').click()
    expect(page.get_by_role('heading', name='各頁面怎麼用')).to_be_visible()
    browser.close()
    print('PASS: account summary, public nickname, contribution roles, lazy refresh, partial failure/retry, settings/about links, single shortcut dialog, logout/guest login, 320/390/1280 layouts')
