from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:4181'
api_requests = []


def fixture(route):
    path = urlparse(route.request.url).path
    api_requests.append((route.request.method, path))
    if path == '/api/auth/me':
        result = {'user': None, 'isGuest': True}
    elif path == '/api/taxonomy':
        result = {'tree': [], 'customNodes': [], 'counts': {}}
    elif path == '/api/auth/google/url':
        result = {'configured': False}
    else:
        result = {}
    route.fulfill(json=result)


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width in [320, 390, 768, 1024, 1280]:
        context = browser.new_context(viewport={'width': width, 'height': 844}, service_workers='block')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/api/**', fixture)
        page.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(status=200, content_type='text/css', body=''))
        page.goto(base + '/about')
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('heading', name='隱私與服務條款')).to_be_attached()
        if width < 1024:
            menu = page.get_by_role('button', name='開啟導覽選單')
            expect(menu).to_be_visible()
            menu.click()
            nav = page.get_by_role('navigation', name='行動導覽')
        else:
            nav = page.get_by_role('navigation', name='主要導覽')
        about_link = nav.get_by_role('link', name='關於', exact=True)
        expect(about_link).to_be_visible()
        expect(about_link).to_have_attribute('aria-current', 'page')
        assert page.locator('body').evaluate('(el)=>el.scrollWidth<=window.innerWidth'), f'Header overflow at {width}'
        if width < 1024:
            menu.click()

        page.get_by_role('link', name='隱私權政策', exact=True).click()
        expect(page).to_have_url(base + '/about/privacy')
        expect(page.get_by_role('heading', name='隱私權政策', exact=True)).to_be_visible()
        expect(page.locator('main')).to_contain_text('訪客模式不代表圖片不會傳送給 AI')
        expect(page.locator('main')).to_contain_text('新公開及私人集合都預設允許存入後再分享')
        assert page.locator('a[href="mailto:50313tjx06@gmail.com"]').count() == 2
        expect(page.get_by_role('heading', name='目前使用的服務供應商')).to_be_attached()
        expect(page.get_by_role('button', name='登入', exact=True)).to_be_visible()
        assert page.locator('main').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), f'Privacy overflow at {width}'
        assert '待確認' not in page.locator('main').inner_text()
        if width == 390:
            page.screenshot(path='.wrangler/legal-privacy-mobile.png')
        if width == 1280:
            page.screenshot(path='.wrangler/legal-privacy-desktop.png')

        page.get_by_role('link', name='服務條款與免責聲明', exact=True).click()
        expect(page.get_by_role('heading', name='服務條款與免責聲明', exact=True)).to_be_visible()
        expect(page.locator('main')).to_contain_text('依法不得免除的責任與使用者權利')
        assert page.locator('main').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), f'Terms overflow at {width}'
        page.get_by_role('button', name='切換深淺色模式').click()
        expect(page.locator('html')).to_have_class('dark')
        page.get_by_role('link', name='返回關於', exact=True).click()
        expect(page.get_by_role('heading', name='把錯題整理成自己的複習流程')).to_be_visible()
        if width < 768:
            expect(page.locator('nav').last.locator('a, button')).to_have_count(5)

        # Both public documents also work when opened directly without an account.
        page.goto(base + '/about/terms')
        expect(page.get_by_role('heading', name='服務條款與免責聲明', exact=True)).to_be_visible()
        page.goto(base + '/about/privacy')
        expect(page.get_by_role('heading', name='隱私權政策', exact=True)).to_be_visible()
        assert not errors, errors
        context.close()

    assert all(method == 'GET' for method, _ in api_requests), api_requests
    assert not any('/collections' in path or '/saved' in path or '/shares' in path for _, path in api_requests), api_requests
    browser.close()
    print('PASS: public policy routes, About entry, header/burger navigation, mobile five tabs, 320/390/768/1024/1280 layout, dark theme, contact links, no content API requests or writes')
