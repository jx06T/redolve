"""External images start before reference ink, retry, and disappear on denied recheck.

Run against Vite preview on port 4181. This test uses API fixtures; actual HTTP
cache reuse is verified separately with image-revalidation.test.mjs's harness.
"""
import asyncio
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, channel='msedge')
        for width in [390, 1280]:
            context = await browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
            gate = asyncio.Event()
            image_calls = []
            layer_started = []
            denied = [False]
            fail_image = [False]
            errors = []

            async def fixture(route):
                path = urlparse(route.request.url).path
                value = {'items': [], 'collections': [], 'subscriptions': [], 'invitations': [], 'keys': [], 'memberships': {}}
                if path == '/api/auth/me':
                    value = {'user': None}
                elif path == '/api/taxonomy':
                    value = {'tree': [], 'customNodes': [], 'counts': {}}
                elif path == '/api/public/items':
                    value = {'items': [{'entry_id': 'entry', 'collection_id': 'co', 'collection_title': '集合', 'title': '原題', 'is_subscribed': 0}], 'next_offset': None}
                elif path == '/api/collections/co/items/entry':
                    if denied[0]:
                        await route.fulfill(status=404, json={'error': {'code': 'NOT_FOUND', 'message': '來源已撤下'}})
                        return
                    value = {'collection': {'id': 'co', 'title': '集合', 'visibility': 'public'},
                             'entry': {'id': 'entry', 'generation': 1},
                             'source': {'id': 'q', 'source': '原題', 'provider_name': '作者', 'contributor_id': 'a', 'keywords': '[]'},
                             'capabilities': {'can_create_share': False},
                             'layers': [{'id': 'source:q', 'user_id': 'a', 'author_display': '作者', 'has_draw': True, 'is_source': True, 'typed_notes': '參考筆記'}]}
                elif path.endswith('/layers/source%3Aq/draw') or path.endswith('/layers/source:q/draw'):
                    layer_started.append(True)
                    await gate.wait()
                    value = {'strokes': [], 'eraserMasks': [], 'calcSpaceHeight': 0, 'baseWidth': 800}
                elif path == '/api/collections/co/items/entry/image':
                    image_calls.append(path)
                    if fail_image[0]:
                        await route.fulfill(status=503, body='unavailable')
                    else:
                        await route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="white"/><text x="8" y="30">Question</text></svg>')
                    return
                await route.fulfill(json=value)

            await context.route('**/api/**', fixture)
            page = await context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            await page.goto('http://127.0.0.1:4181/explore')
            image = page.locator('article img.exam-paper-image')
            await expect(image).to_be_visible()
            await page.wait_for_function("document.querySelector('article img')?.naturalWidth>0")
            assert layer_started and not gate.is_set(), 'image must load while reference ink is pending'
            assert len(image_calls) == 1
            gate.set()
            await expect(page.get_by_role('heading', name='作者的公開題目', exact=True)).to_be_visible()
            assert len(image_calls) == 1, 'loading metadata must retain the same image node'
            fail_image[0] = True
            await page.reload()
            await expect(page.get_by_text('題圖暫時無法載入，請重試。', exact=False)).to_be_visible()
            fail_image[0] = False
            await page.get_by_role('button', name='重新載入', exact=True).click()
            await expect(image).to_be_visible()
            await page.wait_for_function("document.querySelector('article img')?.naturalWidth>0")
            await expect(page.get_by_role('heading', name='作者的公開題目', exact=True)).to_be_visible()
            assert len(image_calls) == 3, image_calls
            denied[0] = True
            await page.evaluate("window.dispatchEvent(new Event('focus'))")
            await expect(page.get_by_text('來源已撤下', exact=False)).to_be_visible()
            await expect(image).to_have_count(0)
            assert not errors, errors
            await context.close()
            print('PASS parallel image loading, stable image node, retry and denied recheck:', width)
        await browser.close()


asyncio.run(main())
