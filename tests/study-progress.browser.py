"""Progress taps, swipe safety, settings, receipt recovery and cache reuse."""
import copy
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

NOW=1791849600000
PREFS={'visible':True,'order':[],'row_version':0}
INITIAL=[{'id':'plan-one-123','name':'數學講義','unit':'章','target_count':12,'completed_count':2,'created_at':1,'updated_at':1,'row_version':1},
         {'id':'plan-two-123','name':'英文複習','unit':'回','target_count':20,'completed_count':0,'created_at':2,'updated_at':2,'row_version':1}]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,channel='msedge')
    for width in [1280,390]:
        for authenticated in [False,True]:
            context=browser.new_context(viewport={'width':width,'height':900},has_touch=True,service_workers='block')
            account=['progress-user' if authenticated else None]
            db={'plans':copy.deepcopy(INITIAL),'preferences':copy.deepcopy(PREFS)}
            receipts={};reads=[];writes=[];errors=[];failing=[False];lost_response=[False]
            def fixture(route):
                req=route.request;path=urlparse(req.url).path
                result={'items':[],'collections':[],'subscriptions':[],'keys':[],'memberships':{},'invitations':[],'subject_destinations':[]}
                if path=='/api/auth/me': result={'user':{'id':account[0],'name':'進度測試'} if account[0] else None}
                elif path=='/api/taxonomy':result={'tree':[],'customNodes':[],'counts':{}}
                elif path=='/api/dashboard':result={'summary':{'total':0,'resolved':0,'unsolved':0},'subjects':[],'top_unsolved_topics':[]}
                elif path=='/api/home-widgets':result={'items':[],'preferences':{'todos_visible':True,'countdowns_visible':True,'row_version':0}}
                elif path.startswith('/api/progress-plans'):
                    if failing[0]:return route.abort()
                    if account[0]=='different-user':return route.fulfill(json={'plans':[],'preferences':copy.deepcopy(PREFS),'acknowledged':[]})
                    if req.method=='GET' or path.endswith('/sync'):
                        reads.append(path)
                        result=copy.deepcopy(db)
                        ids=req.post_data_json['operation_ids'] if path.endswith('/sync') else []
                        result['acknowledged']=[ident for ident in ids if ident in receipts]
                    else:
                        body=req.post_data_json;writes.append((path,copy.deepcopy(body)))
                        if path.endswith('/preferences'):
                            db['preferences'].update(body['patch']);result={'preferences':copy.deepcopy(db['preferences'])}
                        elif path.endswith('/plans'):
                            plan=copy.deepcopy(body)
                            if not any(p['id']==plan['id'] for p in db['plans']):db['plans'].append(plan)
                            result={'plan':plan}
                        else:
                            ident=path.split('/')[-2] if path.endswith('/step') else path.split('/')[-1]
                            plan=next(p for p in db['plans'] if p['id']==ident)
                            if path.endswith('/step'):
                                op=body['operation_id'];delta=body['delta']
                                if op not in receipts:
                                    before=plan['completed_count']
                                    plan['completed_count']=min(plan['target_count'],before+1) if delta==1 and before<plan['target_count'] else max(0,before-1) if delta==-1 else before
                                    receipts[op]=plan['completed_count']-before;plan['row_version']+=1
                                result={'plan':copy.deepcopy(plan),'effect':receipts[op]}
                                if lost_response[0]:lost_response[0]=False;return route.abort()
                            elif req.method=='DELETE':db['plans'].remove(plan);result={'plan':None}
                            else:
                                if any(plan[k]!=v and plan[k]!=body['patch'][k] for k,v in body['base'].items()):return route.fulfill(status=409,json={'current':copy.deepcopy(plan),'error':'同欄已修改'})
                                plan.update(body['patch']);result={'plan':copy.deepcopy(plan)}
                route.fulfill(json=result)
            context.route('**/api/**',fixture)
            context.add_init_script('Date.now=()=>'+str(NOW))
            seed=json.dumps({'data':db,'acknowledged':[]},ensure_ascii=False)
            context.add_init_script("if(!localStorage.getItem('plan-test-seeded')){localStorage.setItem('rdv:study-progress:v1:"+('progress-user' if authenticated else 'guest')+"',"+json.dumps(seed)+");localStorage.setItem('plan-test-seeded','1')}")
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://127.0.0.1:4181/');page.wait_for_load_state('networkidle')
            nav=page.get_by_role('navigation',name='總覽面板',exact=True)
            label='日常工具' if width>=768 else '計畫'
            def choose():
                nav.get_by_role('button',name=label,exact=True).click()
                index=nav.get_by_role('button').all_text_contents().index(label)
                page.wait_for_function("index=>{const e=document.querySelector('[data-dashboard-carousel]');return Math.abs(e.scrollLeft-index*e.clientWidth)<2}",arg=index)
            choose()
            widget=page.get_by_role('region',name='學習計畫小組件',exact=True)
            card=widget.locator('[data-progress-plan="plan-one-123"]');bar=card.get_by_role('progressbar')
            assert nav.get_by_role('button').count()==(2 if width>=768 else 5)
            expect(bar).to_have_attribute('aria-valuenow','2')
            left=card.get_by_role('button',name='減少進度：數學講義',exact=True);right=card.get_by_role('button',name='增加進度：數學講義',exact=True)
            box=card.bounding_box()
            for zone in [left,right]:
                assert abs(zone.bounding_box()['width']/box['width']-.25)<.01
                assert zone.evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
                assert not zone.locator('svg').count()
            page.mouse.click(box['x']+box['width']*.1,box['y']+box['height']*.5);expect(bar).to_have_attribute('aria-valuenow','1')
            page.mouse.click(box['x']+box['width']*.5,box['y']+box['height']*.5);expect(bar).to_have_attribute('aria-valuenow','1')
            page.touchscreen.tap(box['x']+box['width']*.9,box['y']+box['height']*.5);expect(bar).to_have_attribute('aria-valuenow','2')
            right.press('Enter');expect(bar).to_have_attribute('aria-valuenow','3')
            # A small mouse drag must never turn into a click.
            page.mouse.move(box['x']+box['width']*.9,box['y']+20);page.mouse.down();page.mouse.move(box['x']+box['width']*.9-22,box['y']+20,steps=5);page.mouse.up()
            expect(bar).to_have_attribute('aria-valuenow','3')
            # Mobile swipe starts in the decrement zone; wide layouts swipe across the shared tools page.
            cdp=context.new_cdp_session(page);x=box['x']+box['width']*.12;y=box['y']+box['height']*.5
            swipe_distance=box['width']*.75
            if width>=768:
                track_box=page.locator('[data-dashboard-carousel]').bounding_box()
                x=track_box['x']+track_box['width']*.18;swipe_distance=track_box['width']*.64
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            for step in range(1,9):
                cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+swipe_distance*step/8,'y':y}]});page.wait_for_timeout(20)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach()
            expect(nav.get_by_role('button',name='複習進度' if width>=768 else '倒數／探索',exact=True)).to_have_attribute('aria-current','page')
            choose();expect(bar).to_have_attribute('aria-valuenow','3')
            page.reload();page.wait_for_load_state('networkidle');expect(bar).to_have_attribute('aria-valuenow','3')
            if authenticated:
                # Offline drafts survive reload. Accepted-but-lost responses reconcile without double count.
                failing[0]=True;right.click();expect(bar).to_have_attribute('aria-valuenow','4');expect(widget.get_by_role('button',name='重試同步')).to_be_visible()
                page.reload();page.wait_for_load_state('networkidle');expect(bar).to_have_attribute('aria-valuenow','4')
                failing[0]=False;widget.get_by_role('button',name='重試同步').click()
                page.wait_for_function("!Object.keys(localStorage).some(k=>k.startsWith('rdv:study-progress:v1:progress-user:operation:'))")
                expect(bar).to_have_attribute('aria-valuenow','4');assert db['plans'][0]['completed_count']==4
                lost_response[0]=True;right.click();expect(widget.get_by_role('button',name='重試同步')).to_be_visible()
                page.reload();page.wait_for_load_state('networkidle');expect(bar).to_have_attribute('aria-valuenow','5')
                page.wait_for_function("!Object.keys(localStorage).some(k=>k.startsWith('rdv:study-progress:v1:progress-user:operation:'))")
                assert db['plans'][0]['completed_count']==5
            before_reads=len(reads)
            widget.get_by_role('button',name='學習計畫選單').click();page.get_by_role('dialog').get_by_role('link',name='前往設定管理組件').click()
            page.wait_for_url('**/settings?widget=progress#profile');page.wait_for_load_state('networkidle')
            assert len(reads)==before_reads,'settings reuses the 40-second account cache'
            manager=page.get_by_role('region',name='學習計畫小組件',exact=True)
            manager.get_by_role('button',name='編輯學習計畫：數學講義',exact=True).click()
            dialog=page.get_by_role('dialog',name='編輯學習計畫');dialog.get_by_label('名稱',exact=True).fill('新版講義');dialog.get_by_label('目標',exact=True).fill('2');dialog.get_by_role('button',name='儲存',exact=True).click()
            manager.get_by_role('button',name='新增計畫',exact=True).click();dialog=page.get_by_role('dialog',name='新增學習計畫');dialog.get_by_label('名稱',exact=True).fill('新增計畫測試');dialog.get_by_label('目標',exact=True).fill('4');dialog.get_by_role('button',name='儲存',exact=True).click()
            manager.get_by_role('button',name='拖曳排序計畫：英文複習',exact=True).press('Home')
            assert manager.get_by_role('button',name='編輯學習計畫：',exact=False).first.inner_text().startswith('英文複習')
            manager.get_by_role('button',name='編輯學習計畫：新增計畫測試',exact=True).click();dialog=page.get_by_role('dialog',name='編輯學習計畫');dialog.get_by_role('button',name='移除',exact=True).click();dialog.get_by_role('button',name='確認移除',exact=True).click()
            page.get_by_role('link',name='總覽',exact=True).first.click();page.wait_for_load_state('networkidle');choose()
            assert widget.locator('[data-progress-plan]').count()==2
            expect(card.get_by_role('button',name='增加進度：新版講義',exact=True)).to_be_disabled()
            expect(bar).to_have_attribute('aria-valuenow','2')
            assert ('5／2' if authenticated else '3／2') in card.inner_text()
            count=5 if authenticated else 3
            for i in range(count-1):card.get_by_role('button',name='減少進度：新版講義',exact=True).click()
            expect(bar).to_have_attribute('aria-valuenow','1');expect(card.get_by_role('button',name='增加進度：新版講義',exact=True)).to_be_enabled()
            assert len(reads)==before_reads
            page.wait_for_timeout(250)  # Let the progress width transition settle for visual QA.
            page.screenshot(path=f'.wrangler/qa/study-progress-{width}-{authenticated}.png',full_page=True)
            if authenticated and width==390:
                page.wait_for_function("!Object.keys(localStorage).some(k=>k.startsWith('rdv:study-progress:v1:progress-user:operation:'))")
                widget.get_by_role('button',name='學習計畫選單').click();page.get_by_role('dialog').get_by_role('link',name='前往設定管理組件').click();page.wait_for_load_state('networkidle')
                manager.get_by_role('button',name='編輯學習計畫：新版講義',exact=True).click()
                dialog=page.get_by_role('dialog',name='編輯學習計畫');dialog.get_by_label('名稱',exact=True).fill('本機講義')
                next(p for p in db['plans'] if p['id']=='plan-one-123')['name']='遠端講義'
                dialog.get_by_role('button',name='儲存',exact=True).click()
                conflict=page.get_by_role('dialog',name='學習計畫修改需要確認');expect(conflict).to_be_visible()
                conflict.get_by_role('button',name='採用雲端版本',exact=True).click()
                expect(manager.get_by_role('button',name='編輯學習計畫：遠端講義',exact=True)).to_be_visible()
                assert next(p for p in db['plans'] if p['id']=='plan-one-123')['completed_count']==1
                manager.get_by_role('button',name='編輯學習計畫：遠端講義',exact=True).click()
                dialog=page.get_by_role('dialog',name='編輯學習計畫');dialog.get_by_label('名稱',exact=True).fill('新版講義');dialog.get_by_role('button',name='儲存',exact=True).click()
                page.get_by_role('link',name='總覽',exact=True).first.click();page.wait_for_load_state('networkidle');choose()
            widget.get_by_role('button',name='學習計畫選單').click();page.get_by_role('dialog').get_by_role('link',name='前往設定管理組件').click()
            page.wait_for_url('**/settings?widget=progress#profile');page.wait_for_load_state('networkidle');page.get_by_role('switch',name='顯示學習計畫',exact=True).click()
            page.get_by_role('link',name='總覽',exact=True).first.click();page.wait_for_load_state('networkidle')
            assert nav.get_by_role('button').count()==(2 if width>=768 else 4)
            assert not page.locator('[data-dashboard-segment="progress"]').count()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            if not authenticated:assert not reads and not writes
            else:
                page.wait_for_function("!Object.keys(localStorage).some(k=>k.startsWith('rdv:study-progress:v1:progress-user:operation:'))")
                account[0]='different-user';page.reload();page.wait_for_load_state('networkidle');choose()
                assert widget.locator('[data-progress-plan]').count()==0,'account switching must not reuse prior plans'
            assert not errors,errors
            context.close();print('PASS study progress',width,'authenticated' if authenticated else 'guest')
    browser.close()
