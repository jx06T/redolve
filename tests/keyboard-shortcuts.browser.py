"""Keyboard/gesture undo must persist the right vectors across all study sources.

Run against preview port 4181. No requests reach a real account.
"""
import copy
import json
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

USER={'id':'keyboard-user','name':'鍵盤測試'}
BLANK={'strokes':[],'eraserMasks':[],'baseWidth':800,'calcSpaceHeight':850}
COLLECTION={'id':'c1','title':'共用集','role':'contributor','can_contribute':True,'is_owner':False,'visibility':'public','lifecycle':'active'}
draws={}; draw_writes=[]; status_writes=[]
progress={}


def fixture(route):
    request=route.request
    url=urlparse(request.url); path=url.path; query=parse_qs(url.query)
    body=request.post_data_json if request.method in ['POST','PUT','PATCH'] and request.post_data else {}
    if path.endswith('/image'):
        return route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#fff"/></svg>')
    if path.endswith('/draw'):
        if request.method in ['PUT','PATCH']:
            draws[path]=copy.deepcopy(body['draw_data']); draw_writes.append((path,copy.deepcopy(body['draw_data'])))
        result=draws.get(path,BLANK) if request.method=='GET' else {'status':'ok','draw_seq':body.get('expected_seq',0)+1}
    elif path=='/api/auth/me': result={'user':USER}
    elif path=='/api/taxonomy': result={'tree':[],'customNodes':[],'counts':{}}
    elif path=='/api/me/public-profile': result={'profile':{'display_name':'鍵盤測試'}}
    elif path=='/api/my/collections': result={'collections':[COLLECTION]}
    elif path=='/api/my/collections/membership': result={'memberships':{}}
    elif path=='/api/search':
        origin='saved' if query.get('origin')==['saved'] else 'shared' if query.get('contributing') else 'owned'
        prefix={'saved':'s','shared':'e','owned':'o'}[origin]
        rows=[]
        for i in range(2):
            sid=f'{prefix}{i}'
            row={'id':sid,'origin':origin,'collection_id':'c1' if origin=='shared' else None,'title':'測試題'}
            if origin=='owned': row['problem']={'id':sid,'user_id':USER['id'],'source':'測試題','image_url':'fixture','draw_data':json.dumps(draws.get(f'/api/problems/{sid}/draw',BLANK)),'typed_notes':'','status':progress.get(sid,{}).get('status','unsolved'),'review_count':0,'keywords':'[]','notes_seq':0,'vector_clock':'{"seq":0}','created_at':'2026-10-11'}
            rows.append(row)
        result={'items':rows,'scope':'mine','next_offset':None}
    elif re.fullmatch(r'/api/saved/s[0-1]',path):
        sid=path.split('/')[-1]
        p=progress.setdefault(sid,{'status':'unsolved','row_version':1,'review_count':0})
        if request.method=='PATCH': p.update({k:v for k,v in body.items() if k in ['status','review_count']});p['row_version']+=1;status_writes.append(path)
        result={'saved':{'id':sid,'entry_id':'e'+sid[-1],'personal_topic_id':None,**p},'snapshot':{'source_title':'測試題','collection_title':'共用集','provider_public_name':'老師'},'workspace':{'draw_asset_id':'ink' if f'{path}/workspace/draw' in draws else None,'draw_seq':0,'typed_notes':'','notes_seq':0},'layers':[],'source':{'available':True},'row_version':p['row_version']}
    elif re.fullmatch(r'/api/collections/c1/items/e[0-1]/progress',path):
        sid=path.split('/')[-2];p=progress.setdefault(sid,{'status':'unsolved','row_version':0,'review_count':0})
        p.update(status='resolved',row_version=p['row_version']+1);status_writes.append(path);result={'progress':p}
    elif re.fullmatch(r'/api/collections/c1/items/e[0-1]',path):
        sid=path.split('/')[-1]
        result={'collection':COLLECTION,'entry':{'id':sid,'generation':1},'source':{'source':'測試題','topic_id':None,'contributor_id':'teacher','provider_name':'老師'},'layers':[], 'progress':progress.get(sid),'capabilities':{'can_contribute':True,'can_save':True}}
    elif path.endswith('/status'):
        sid=path.split('/')[-2];progress[sid]={'status':body['status']};status_writes.append(path);result={'success':True}
    elif path.endswith('/notes'): result={'notes_seq':body.get('expected_seq',0)+1,'status':'ok'}
    else: result={'items':[],'collections':[],'subscriptions':[],'invitations':[],'keys':[]}
    route.fulfill(json=result)


def latest(path): return copy.deepcopy(draws.get(path,BLANK))
def wait_ink(page,path,predicate):
    for _ in range(45):
        if path in draws and predicate(draws[path]): return latest(path)
        page.wait_for_timeout(100)
    raise AssertionError((path,latest(path)))


with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,channel='msedge')
    page=browser.new_page(viewport={'width':1280,'height':1000},service_workers='block')
    page.route('**/api/**',fixture)
    for source,sid,path in [('owned','o0','/api/problems/o0/draw'),('saved','s0','/api/saved/s0/workspace/draw'),('contributing','e0','/api/collections/c1/items/e0/layers/draw')]:
        page.goto('http://127.0.0.1:4181/study?source='+source+('&collection_id=c1' if source=='contributing' else ''))
        page.wait_for_load_state('networkidle');page.wait_for_timeout(500)
        card=page.locator(f'[data-problem-id="{sid}"]')
        canvas=card.locator('canvas').last
        expect(canvas).to_be_visible()
        def line(y=80,start=80,end=180):
            rect=canvas.bounding_box()
            page.mouse.move(rect['x']+start,rect['y']+y);page.mouse.down()
            page.mouse.move(rect['x']+end,rect['y']+y,steps=8);page.mouse.up()
        page.keyboard.press('p');line()
        original=wait_ink(page,path,lambda ink:len(ink['strokes'])==1)
        for undo,redo in [('Control+z','Control+Shift+z'),('Meta+z','Meta+Shift+z'),('Control+z','Control+y')]:
            page.keyboard.press(undo);wait_ink(page,path,lambda ink:not ink['strokes'])
            page.keyboard.press(redo);restored=wait_ink(page,path,lambda ink:len(ink['strokes'])==1)
            assert restored['strokes']==original['strokes'],f'{source}: redo changed vector coordinates'
        def touch_gesture(count):
            canvas.evaluate('''(canvas,count)=>{
                const root=canvas.parentElement;
                const touches=Array.from({length:count},(_,identifier)=>new Touch({identifier,target:root,clientX:100+identifier*30,clientY:100}));
                root.dispatchEvent(new TouchEvent('touchstart',{touches,targetTouches:touches,changedTouches:touches,bubbles:true,cancelable:true}));
                root.dispatchEvent(new TouchEvent('touchend',{touches:[],targetTouches:[],changedTouches:touches,bubbles:true,cancelable:true}));
            }''',count)
        touch_gesture(2);wait_ink(page,path,lambda ink:not ink['strokes'])
        page.wait_for_timeout(400)
        touch_gesture(3);wait_ink(page,path,lambda ink:ink['strokes']==original['strokes'])
        page.keyboard.press('e');line(start=130,end=130)
        erased=wait_ink(page,path,lambda ink:ink['strokes']!=original['strokes'])
        page.keyboard.press('Control+z');wait_ink(page,path,lambda ink:ink['strokes']==original['strokes'])
        page.keyboard.press('Control+Shift+z');wait_ink(page,path,lambda ink:ink['strokes']==erased['strokes'])
        page.keyboard.press('Control+z');wait_ink(page,path,lambda ink:ink['strokes']==original['strokes'])
        page.keyboard.press('1');line(y=140)
        branched=wait_ink(page,path,lambda ink:len(ink['strokes'])==2)
        page.keyboard.press('Control+Shift+z');page.wait_for_timeout(1200)
        assert latest(path)['strokes']==branched['strokes'],'New drawing must clear redo'
        notes=card.locator('textarea');notes.fill('筆記');notes.press('End');notes.press('x');notes.press('Control+z')
        expect(notes).to_have_value('筆記')
        notes.press('p');expect(notes).to_have_value('筆記p');page.wait_for_timeout(1200)
        assert latest(path)['strokes']==branched['strokes'],'Typing shortcut changed ink'
        notes.blur()
        # IME and browser modifier combinations must not be consumed.
        for config in [{'key':'z','ctrlKey':True,'isComposing':True},{'key':'[','ctrlKey':True},{'key':'1','altKey':True}]:
            assert page.evaluate('(config)=>window.dispatchEvent(new KeyboardEvent("keydown",{...config,bubbles:true,cancelable:true}))',config)
        page.keyboard.press('?');expect(page.get_by_role('dialog',name='快捷鍵與手勢')).to_be_visible()
        expect(page.get_by_text('FAB',exact=False)).to_have_count(0)
        expect(page.locator('kbd').get_by_text('Ctrl + Z',exact=True)).to_be_visible()
        page.keyboard.press('Control+z');page.wait_for_timeout(1200)
        assert latest(path)['strokes']==branched['strokes'],'Help dialog did not block drawing shortcuts'
        page.keyboard.press('Escape')
        stream=page.locator('[data-reader]');height=stream.locator('[data-index="0"]').bounding_box()['height']
        count=len(status_writes)
        page.keyboard.press('Control+Enter');page.wait_for_timeout(1000)
        assert len(status_writes)==count+1 and stream.evaluate('(el)=>el.scrollTop')>height-100,(source,status_writes)
        stream.evaluate('(el)=>el.scrollTop=0');page.wait_for_timeout(250)
        page.keyboard.press('Control+Enter');page.wait_for_timeout(500)
        assert len(status_writes)==count+1,'Resolved question was resolved again'
        # Read-only search results must not expose drawing history commands.
        page.goto(f'http://127.0.0.1:4181/search?source={source}&view=full'+('&collection_id=c1' if source=='contributing' else ''))
        page.wait_for_load_state('networkidle')
        before=len(draw_writes);page.keyboard.press('Control+z');page.wait_for_timeout(600)
        assert len(draw_writes)==before,'Read-only search changed ink'
    page.keyboard.press('?')
    for width in [320,390,1280]:
        page.set_viewport_size({'width':width,'height':844})
        dialog=page.get_by_role('dialog',name='快捷鍵與手勢')
        expect(dialog).to_be_visible()
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth'),'Shortcut guide overflows'
        if width==390:
            Path('.wrangler').mkdir(exist_ok=True);page.screenshot(path='.wrangler/keyboard-guide-mobile.png')
    page.keyboard.press('?');expect(page.get_by_role('dialog',name='快捷鍵與手勢')).to_have_count(0)
    browser.close()
    print('PASS: owned/saved/shared drawing and eraser undo/redo; Ctrl/Cmd aliases, touch gestures, color shortcut exits eraser, text/IME/modal/read-only guards, resolve/next shortcut, responsive guide without FAB')
