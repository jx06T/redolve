"""Real native touch scrolling, persistent panels, responsive regrouping and retained inputs."""
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

USER={'id':'pager-user','name':'滑動測試'}
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,channel='msedge')
    for width in [1024,390]:
        context=browser.new_context(viewport={'width':width,'height':900},has_touch=True,service_workers='block')
        calls=[];errors=[]
        account=[dict(USER)];show_todo=[True]
        def fixture(route):
            req=route.request;path=urlparse(req.url).path;calls.append((path,req.method))
            result={'items':[],'collections':[],'subscriptions':[],'keys':[],'memberships':{},'invitations':[]}
            if path=='/api/progress-plans':result={'plans':[],'preferences':{'visible':False,'order':[],'row_version':0}}
            elif path=='/api/auth/me':result={'user':account[0]}
            elif path=='/api/taxonomy':result={'tree':[],'customNodes':[],'counts':{}}
            elif path=='/api/dashboard':result={'summary':{'total':60,'resolved':20,'unsolved':40,'unclassified':2},
                'subjects':[{'subject_id':'s'+str(i),'subject_label':'科目 '+str(i),'total':10,'resolved':i%5} for i in range(12)],
                'top_unsolved_topics':[{'topic_id':'t'+str(i),'topic_label':'單元 '+str(i),'unsolved_count':6-i} for i in range(5)]}
            elif path=='/api/home-widgets':result={'items':[
                {'id':'todo-'+str(i),'kind':'todo','text':'待辦 '+str(i),'completed_at':None,'target_date':None,'created_at':1700000000000+i,'updated_at':1700000000000,'row_version':1} for i in range(18)] +
                [{'id':'count-'+str(i),'kind':'countdown','text':'事件 '+str(i),'completed_at':None,'target_date':'2027-01-'+str(22+i),'created_at':1700000000000+i,'updated_at':1700000000000,'row_version':1} for i in range(6)],
                'preferences':{'todos_visible':show_todo[0],'countdowns_visible':True,'row_version':1}}
            route.fulfill(json=result)
        context.route('**/api/**',fixture)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:4181/');page.wait_for_load_state('networkidle')
        pager=page.locator('[data-dashboard-pager]');track=page.locator('[data-dashboard-carousel]')
        nav=page.get_by_role('navigation',name='總覽面板',exact=True)
        def settled(label):
            expect(nav.get_by_role('button',name=label,exact=True)).to_have_attribute('aria-current','page')
            index=nav.get_by_role('button').all_text_contents().index(label)
            page.wait_for_function("index=>{const e=document.querySelector('[data-dashboard-carousel]');return Math.abs(e.scrollLeft-index*e.clientWidth)<2}",arg=index)
        def choose(label):nav.get_by_role('button',name=label,exact=True).click();settled(label)
        session=context.new_cdp_session(page)
        def swipe(direction='left',box=None):
            box=box or track.bounding_box();y=box['y']+min(box['height']*.5,220)
            start=box['x']+box['width']*(.82 if direction=='left' else .18)
            end=box['x']+box['width']*(.18 if direction=='left' else .82)
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start,'y':y}]})
            for i in range(1,9):
                session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':start+(end-start)*i/8,'y':y+2}]})
                page.wait_for_timeout(20)
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        settled('複習進度' if width>=768 else '複習重點')
        hero_before=page.locator('[data-dashboard-hero]').bounding_box()
        assert not any('/' in label and label.replace(' ','').replace('/','').isdigit() for label in nav.all_text_contents()),'panel labels already identify each page'
        stats_box=page.locator('[data-dashboard-stats]').bounding_box()
        assert abs(stats_box['x']-hero_before['x'])<1 and abs(stats_box['width']-hero_before['width'])<1,'panels align with the hero edges'
        left_card=page.locator('section[aria-label="最需複習單元 Top 5"]').bounding_box()
        right_card=page.locator('section[aria-label="待辦事項小組件"]' if width>=768 else 'section[aria-label="各科目錯題訂正率"]').bounding_box()
        gap=right_card['x']-left_card['x']-left_card['width']
        assert abs(gap-(track.bounding_box()['width']-hero_before['width']))<2 and gap>=16,'adjacent pages retain the combined edge gutters'
        assert page.get_by_role('region',name='最需複習單元 Top 5').get_by_role('button').count()==5
        stats=page.locator('[data-dashboard-stats] > div').all();ys=[s.bounding_box()['y'] for s in stats]
        assert max(ys)-min(ys)<2,'three horizontal statistics'
        baseline=list(calls);history=page.evaluate('history.length')
        swipe()
        settled('日常工具' if width>=768 else '各科進度')
        assert urlparse(page.url).path=='/','swiping a clickable topic must not navigate to study'
        if width<768:
            subject_scroll=page.get_by_role('region',name='各科目錯題訂正率').locator('div.overflow-y-auto')
            subject_scroll.evaluate('(e)=>e.scrollTop=100');subject_top=subject_scroll.evaluate('(e)=>e.scrollTop')
            swipe();settled('待辦')
        new_todo=page.get_by_role('textbox',name='新增待辦',exact=True)
        new_todo.fill('尚未送出的待辦')
        if width<768:
            swipe(box=new_todo.bounding_box());page.wait_for_timeout(200);settled('待辦')
            expect(new_todo).to_have_value('尚未送出的待辦')
            swipe();settled('倒數／探索')
        expect(page.get_by_role('region',name='事件倒數小組件')).to_be_visible()
        assert not page.get_by_role('button',name='編輯倒數',exact=False).count()
        hero_after=page.locator('[data-dashboard-hero]').bounding_box()
        assert hero_after['x']+hero_after['width']<=track.bounding_box()['x']+1,'hero scrolls out with the first panel'
        assert not page.get_by_role('heading',name='保持心流，完成今日訂正').count(),'offscreen hero is not an active heading'
        assert abs(track.bounding_box()['y']-hero_before['y'])<1,'other panels use the full dashboard height'
        assert calls==baseline,'panel switching must not request data'
        assert page.evaluate('history.length')==history,'panel switches must replace history'
        # Resize uses separate saved pages but retains the same mounted editor.
        page.set_viewport_size({'width':390 if width>=768 else 1024,'height':900})
        expect(pager).to_have_attribute('data-layout','compact' if width>=768 else 'wide')
        choose('待辦' if width>=768 else '日常工具')
        expect(page.get_by_role('textbox',name='新增待辦',exact=True)).to_have_value('尚未送出的待辦')
        page.set_viewport_size({'width':width,'height':900})
        expect(pager).to_have_attribute('data-layout','wide' if width>=768 else 'compact')
        settled('日常工具' if width>=768 else '倒數／探索')
        if width<768:
            choose('各科進度');assert abs(subject_scroll.evaluate('(e)=>e.scrollTop')-subject_top)<2
            choose('倒數／探索')
        assert calls==baseline,'rotation must not remount data panels'
        # Reload with no explicit hash: account/layout storage chooses the last panel.
        page.goto('http://127.0.0.1:4181/');page.wait_for_load_state('networkidle')
        settled('日常工具' if width>=768 else '倒數／探索')
        page.screenshot(path=f'.wrangler/qa/dashboard-pager-{width}.png',full_page=True)
        # Keyboard is an alternate input path, not required for touch users.
        track.focus();track.press('Home');settled('複習進度' if width>=768 else '複習重點')
        assert track.evaluate('(e)=>getComputedStyle(e).outlineStyle')=='none','no outer blue carousel frame'
        page.screenshot(path=f'.wrangler/qa/dashboard-pager-overview-{width}.png',full_page=True)
        choose('日常工具' if width>=768 else '待辦')
        account[0]={'id':'second-user','name':'另一帳號'}
        page.goto('http://127.0.0.1:4181/');page.wait_for_load_state('networkidle')
        settled('複習進度' if width>=768 else '複習重點')
        account[0]=dict(USER);show_todo[0]=False
        page.goto('http://127.0.0.1:4181/');page.wait_for_load_state('networkidle')
        settled('日常工具' if width>=768 else '複習重點')
        assert nav.get_by_role('button').count()==(2 if width>=768 else 3),'no empty hidden todo page'
        assert not nav.get_by_role('button',name='待辦',exact=True).count()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'page must not horizontally overflow'
        assert not errors,errors
        context.close();print('PASS native dashboard pager, draft, resize, storage and request count:',width)
    browser.close()
