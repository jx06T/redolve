"""Long countdown lists drag across the settings page without losing capture."""
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

items=[{'id':'long-countdown-'+str(i),'kind':'countdown','text':'事件 '+str(i),'target_date':'2027-01-22',
        'completed_at':None,'created_at':i,'updated_at':i,'row_version':0} for i in range(40)]
data={'items':items,'preferences':{'todos_visible':True,'countdowns_visible':True,'countdown_order':[],'row_version':0}}
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,channel='msedge')
    for width in [1280,390]:
        context=browser.new_context(viewport={'width':width,'height':900},has_touch=True,service_workers='block')
        def fixture(route):
            path=urlparse(route.request.url).path
            result={'items':[],'collections':[],'subscriptions':[],'keys':[],'invitations':[],'subject_destinations':[]}
            if path=='/api/auth/me':result={'user':None}
            elif path=='/api/taxonomy':result={'tree':[],'customNodes':[],'counts':{}}
            route.fulfill(json=result)
        context.route('**/api/**',fixture)
        context.add_init_script("if(!localStorage.getItem('rdv:home-widgets:v1:guest'))localStorage.setItem('rdv:home-widgets:v1:guest',"+json.dumps(json.dumps({'data':data,'format':2},ensure_ascii=False))+");")
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:4181/settings?widget=countdowns#profile');page.wait_for_load_state('networkidle')
        manager=page.get_by_role('region',name='事件倒數小組件',exact=True)
        handle=manager.get_by_role('button',name='拖曳排序倒數：事件 0',exact=True);handle.scroll_into_view_if_needed()
        box=handle.bounding_box();main=page.locator('main');bounds=main.bounding_box();before=main.evaluate('(e)=>e.scrollTop')
        x=box['x']+box['width']/2;y=box['y']+box['height']/2
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,bounds['y']+bounds['height']-(68 if width<768 else 28),steps=12);page.wait_for_timeout(500)
        assert main.evaluate('(e)=>e.scrollTop')>before+50,'settings page should scroll during a held drag'
        page.mouse.up()
        ids=manager.locator('[data-reorder-id]').evaluate_all('(rows)=>rows.map(e=>e.dataset.reorderId)')
        assert ids.index('long-countdown-0')>3
        handle.press('Home')
        assert manager.locator('[data-reorder-id]').first.get_attribute('data-reorder-id')=='long-countdown-0'
        handle.scroll_into_view_if_needed();box=handle.bounding_box();target=manager.locator('[data-reorder-id]').nth(2).bounding_box()
        cdp=context.new_cdp_session(page);x=box['x']+box['width']/2;y=box['y']+box['height']/2
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        for step in range(1,9):
            cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y+(target['y']+target['height']-4-y)*step/8}]});page.wait_for_timeout(20)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});cdp.detach()
        assert manager.locator('[data-reorder-id]').first.get_attribute('data-reorder-id')=='long-countdown-0','pointercancel must discard preview'
        page.reload();page.wait_for_load_state('networkidle')
        assert manager.locator('[data-reorder-id]').first.get_attribute('data-reorder-id')=='long-countdown-0'
        assert not manager.get_by_role('button',name='上移倒數：',exact=False).count()
        page.screenshot(path=f'.wrangler/qa/countdown-drag-settings-{width}.png',full_page=True)
        assert not errors,errors
        context.close();print('PASS long countdown drag',width)
    browser.close()
