"""Run against vite preview with webapp-testing/scripts/with_server.py.
Uses request fixtures so destructive actions never touch a real account.
"""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:4181'
USER = {'id': 'reader-test', 'name': '測試使用者', 'email': 'test@example.test'}
INK = {'strokes': [], 'eraserMasks': [], 'baseWidth': 800, 'calcSpaceHeight': 850}
CO = {'id': 'c1', 'title': '測試共用集', 'public_name': '老師', 'lifecycle': 'active', 'visibility': 'public',
      'listed': 1, 'row_version': 1, 'role': 'owner', 'can_contribute': True, 'is_owner': True,
      'show_shared_ink': 0, 'show_shared_notes': 0, 'item_count': 2, 'contributor_count': 2}
SOURCE = {'id': 'original', 'source': '共用測試題', 'provider_name': '老師', 'contributor_id': 'teacher',
          'content_seq': 1, 'topic_id': 'math'}
ENTRY = {'id': 'entry1', 'title': '共用測試題', 'display_order': 1, 'shared_seq': 0, 'generation': 1,
         'source_item_id': 'original', 'contributor_id': 'teacher', 'is_starred': 0, 'is_read': 0, 'question_text':'共用題目文字摘要'}

def run():
  with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, service_workers='block')
    writes, saved, calls = [], [], []
    fail_batch = [True]
    subscriptions = {'c1'}
    invitation_pending = [True]
    public_sets = [{**CO,'id':cid,'title':name,'is_owner':False,'role':'viewer','can_contribute':False} for cid,name in [('c2','公開數學集'),('c3','公開物理集')]]
    activity_updates = [False]
    external_scroll = [False]
    link_co={**CO,'id':'c4','title':'持連結限定集','visibility':'link','is_owner':False,'role':'viewer','can_contribute':False}
    scroll_rows = [False]
    work_scroll = [False]
    work_progress = {}
    paging = [False]; fail_more = [True]; paging_archived = [False]
    def fixture(route):
      request = route.request
      from urllib.parse import urlparse, parse_qs
      parsed = urlparse(request.url); path = parsed.path; query = parse_qs(parsed.query)
      calls.append((request.method, path, query))
      body = request.post_data_json if request.method in ('PUT','POST','PATCH') and request.post_data else {}
      if path.endswith('/image'):
        return route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#fff"/><text x="50" y="100" font-size="35">Question fixture</text></svg>')
      result = {}
      if path == '/api/auth/me': result={'user':USER}
      elif path == '/api/taxonomy': result={'tree':[{'id':'math','label':'數學','children':[{'id':'algebra','label':'代數','children':[{'id':'vector','label':'向量','children':[]}]}]}], 'customNodes':[], 'counts':{}}
      elif path == '/api/search':
        source=query.get('origin',[''])[0]
        items=[{'id':sid,'origin':'saved','title':'共用測試題','collection_id':None} for sid in saved] if source=='saved' else [
          {'id':'entry1','origin':'shared','collection_id':'c1','title':'共用測試題'}] if query.get('contributing') else [
          {'id':'owned1','origin':'owned','title':'自己上傳測試題','problem':{'id':'owned1','user_id':USER['id'],'source':'自己上傳測試題','image_url':'fixture','status':'unsolved','review_count':0,'keywords':'[]','draw_data':json.dumps(INK),'vector_clock':'{"seq":0}','notes_seq':0,'created_at':'2026-10-10T00:00:00Z'}}]
        if work_scroll[0]:
          origin='saved' if source=='saved' else 'shared' if query.get('contributing') else 'owned'
          prefix={'saved':'ws','shared':'wsh','owned':'wo'}[origin]
          items=[{'id':f'{prefix}{i}','origin':origin,'collection_id':'c1' if origin=='shared' else None,'title':f'回捲測試 {i}',
                  'problem':{'id':f'{prefix}{i}','user_id':USER['id'],'source':f'回捲測試 {i}','image_url':'fixture','status':'unsolved','review_count':0,'keywords':'[]','draw_data':json.dumps(INK),'vector_clock':'{"seq":0}','created_at':'2026-10-10'}} for i in range(18)]
        if scroll_rows[0] and source=='owned':
          items=[{**items[0],'id':f'owned{i}','title':f'題目 {i}','problem':{**items[0]['problem'],'id':f'owned{i}','source':f'題目 {i}'}} for i in range(8)]
        if paging[0] and source=='owned':
          offset=int(query.get('offset',['0'])[0]); index=offset//30
          if not query.get('metadata_only') and offset==30 and fail_more[0]:
            fail_more[0]=False
            return route.fulfill(status=503,json={'error':'fixture temporary failure'})
          base=items[0]
          def row(i): return {**base,'id':f'page{i}','title':f'續載題 {i}','problem':{**base['problem'],'id':f'page{i}','source':f'續載題 {i}'}}
          available=[1,2] if paging_archived[0] else [0,1,2]
          items=[row(i) for i in available] if query.get('metadata_only') else [row(available[index])]
          next_offset=None if query.get('metadata_only') or index==len(available)-1 else offset+30
          result={'items':items,'scope':'mine','next_offset':next_offset}
        else: result={'items':items,'scope':'mine','next_offset':None}
      elif paging[0] and path=='/api/problems/page0/status':
        paging_archived[0]=body['status']=='archived';result={'success':True}
      elif path == '/api/my/collections': result={'collections':[CO]}
      elif path == '/api/my/collections/membership': result={'memberships':{'owned1':[{'entry_id':'entry1','collection_id':'c1','title':'測試共用集','state':'included','lifecycle':'active','visibility':'public'}]}}
      elif path == '/api/me/public-profile': result={'profile':{'display_name':'測試使用者'}}
      elif path == '/api/subscriptions': result={'subscriptions':[{'collection_id':c['id'],'title':c['title'],'last_known_title':c['title'],'can_read':True,'subscribed_at':'2026-10-09T00:00:00Z'} for c in [CO,*public_sets,link_co] if c['id'] in subscriptions]}
      elif path in ['/api/subscriptions/c2','/api/subscriptions/c3','/api/subscriptions/c4']:
        cid=path.split('/')[-1]
        if request.method=='PUT': subscriptions.add(cid)
        elif request.method=='DELETE': subscriptions.discard(cid)
        result={'status':'ok'}
      elif path == '/api/public/collections': result={'collections':[c for c in public_sets if not query.get('exclude_subscribed') or c['id'] not in subscriptions]}
      elif external_scroll[0] and path == '/api/public/items': result={'items':[{**ENTRY,'entry_id':f'scroll{i}','collection_id':'c2','collection_title':'公開數學集','is_subscribed':0,'is_owner':False} for i in range(12)],'next_offset':None}
      elif external_scroll[0] and re.fullmatch(r'/api/collections/c2/items/scroll[0-9]+',path): result={'collection':public_sets[0],'entry':{**ENTRY,'id':path.split('/')[-1]},'source':SOURCE,'layers':[],'capabilities':{'can_contribute':False,'can_save':True}}
      elif path == '/api/public/items': result={'items':[{**ENTRY,'entry_id':'entry'+c['id'][-1],'collection_id':c['id'],'collection_title':c['title'],'is_subscribed':int(c['id'] in subscriptions),'is_owner':False} for c in public_sets if not query.get('exclude_subscribed') or c['id'] not in subscriptions],'next_offset':None}
      elif path == '/api/subscriptions/feed': result={'items':[{**ENTRY,'entry_id':'entry1','collection_id':'c1','collection_title':CO['title']}] if activity_updates[0] else []}
      elif path == '/api/my/invitations': result={'invitations':[{'id':'inv1','collection_id':'c3','title':'公開物理集','public_name':'老師','role':'viewer','expires_at':'2099-01-01'}] if invitation_pending[0] else []}
      elif path == '/api/invitations/accept':
        assert body.get('invitation_id')=='inv1'
        invitation_pending[0]=False;result={'status':'accepted','collection_id':'c3','role':'viewer'}
      elif path == '/api/saved/inspect': result={'existing_id':None,'own_source':False}
      elif path == '/api/saved' and request.method == 'POST':
        saved.append('s1');result={'saved_id':'s1','status':'saved'}
      elif work_scroll[0] and re.fullmatch(r'/api/saved/ws[0-9]+',path):
        sid=path.split('/')[-1]
        progress=work_progress.setdefault(sid,{'status':'unsolved','row_version':1,'review_count':0})
        if request.method=='PATCH': progress.update({k:v for k,v in body.items() if k in ['status','review_count']});progress['row_version']+=1
        result={'saved':{'id':sid,'entry_id':'e'+sid,'personal_topic_id':'math',**progress},'snapshot':{'source_title':sid,'collection_title':CO['title'],'provider_public_name':'老師'},'workspace':{'draw_asset_id':'ink','draw_seq':0,'typed_notes':'','notes_seq':0},'layers':[],'source':{'available':True},'row_version':progress['row_version']}
      elif work_scroll[0] and re.fullmatch(r'/api/collections/c1/items/wsh[0-9]+/progress',path):
        sid=path.split('/')[-2];progress=work_progress.setdefault(sid,{'status':'unsolved','row_version':0,'review_count':0,'previous_status':'unsolved'})
        progress.update(status='resolved' if body['action']=='resolve' else 'archived',row_version=progress['row_version']+1)
        result={'progress':progress}
      elif work_scroll[0] and re.fullmatch(r'/api/collections/c1/items/wsh[0-9]+',path):
        sid=path.split('/')[-1]
        result={'collection':CO,'entry':{**ENTRY,'id':sid},'source':SOURCE,'layers':[], 'progress':work_progress.get(sid), 'capabilities':{'can_contribute':True,'can_save':True}}
      elif path == '/api/saved/s1': result={'saved':{'id':'s1','entry_id':'entry1','row_version':1,'status':'unsolved','personal_topic_id':'math'},'snapshot':{'source_title':'共用測試題','collection_title':CO['title'],'provider_public_name':'老師'},'workspace':{'draw_asset_id':None,'draw_seq':0,'typed_notes':'','notes_seq':0},'layers':[],'source':{'available':True}}
      elif path == '/api/collections/c1': result={'collection':CO,'items':[ENTRY],'next_cursor':None}
      elif path == '/api/collections/c1/items/entry1': result={'collection':CO,'entry':ENTRY,'source':SOURCE,'layers':[{'id':'layer1','user_id':'teacher','author_display':'老師','draw_asset_id':'ink1','draw_seq':0,'notes_seq':0,'typed_notes':'參考筆記'}],'capabilities':{'can_contribute':True,'can_save':True}}
      elif path == '/api/collections/c4': result={'collection':link_co,'items':[{**ENTRY,'id':'entry4'}],'next_cursor':None}
      elif path == '/api/collections/c4/items/entry4': result={'collection':link_co,'entry':{**ENTRY,'id':'entry4'},'source':SOURCE,'layers':[],'capabilities':{'can_contribute':False,'can_save':True}}
      elif path in ['/api/collections/c2','/api/collections/c3']:
        c=next(c for c in public_sets if c['id']==path.split('/')[-1]);result={'collection':c,'items':[{**ENTRY,'id':'entry'+c['id'][-1]}],'next_cursor':None}
      elif path in ['/api/collections/c2/items/entry2','/api/collections/c3/items/entry3']:
        c=next(c for c in public_sets if c['id']==path.split('/')[3]);result={'collection':c,'entry':{**ENTRY,'id':path.split('/')[-1]},'source':SOURCE,'layers':[],'capabilities':{'can_contribute':False,'can_save':True}}
      elif path.endswith('/notes'):
        writes.append((path,body));result={'notes_seq':body['expected_seq']+1}
      elif path.endswith('/draw') and request.method == 'GET': result=INK
      elif path.endswith('/draw') and request.method == 'PUT': result={'draw_seq':body['expected_seq']+1}
      elif path.endswith('/star'): result={'starred':body['starred']}
      elif path == '/api/collections/c1/candidates': result={'items':[{'id':'candidate2' if query.get('topic_id') else 'candidate1','title':'數學題' if query.get('topic_id') else '其他題','created_at':'2026-10-09','question_text':'候選題目辨識內容'}],'next_cursor':None}
      elif path.endswith('/items/batch'):
        ids=body['item_ids'];result={'results':[{'item_id':i,**({'error':'fixture failure'} if fail_batch[0] and i=='candidate2' else {'status':'included'})} for i in ids]};fail_batch[0]=False
      elif path.endswith('/owner-transfer'): result={'transfer':None}
      elif path.endswith('/stats'): result={'stats':{'item_count':2,'contributor_count':2,'subscriber_count':1,'saved_count':1}}
      elif path.endswith('/grants'): result={'grants':[]}
      elif path.endswith('/links'): result={'links':[]}
      elif path == '/api/admin/me': result={'isAdmin':False}
      else: result={'items':[], 'layers':[], 'collections':[], 'invitations':[], 'keys':[]}
      route.fulfill(json=result)
    context.route('**/api/**', fixture)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/study?source=owned');page.wait_for_load_state('networkidle')
    expect(page.locator('main > header')).to_have_count(0)
    expect(page.locator('header').get_by_role('navigation',name='主要導覽')).to_be_visible()
    expect(page.locator('header').get_by_role('navigation',name='主要導覽').get_by_role('link')).to_have_count(5)
    expect(page.locator('header input')).to_have_count(0)
    expect(page.get_by_text('章節大綱導航',exact=True)).to_be_visible()
    expect(page.get_by_role('group',name='題目來源').get_by_role('link')).to_have_count(3)
    expect(page.get_by_role('link',name='公開 · 測試共用集',exact=True)).to_be_visible()
    expect(page.get_by_role('link',name='公開 · 測試共用集',exact=True)).to_have_attribute('href','/settings/collections/c1')
    tree=page.locator('#study-taxonomy-tree')
    page.get_by_role('button',name='展開數學',exact=True).click()
    expect(page.get_by_role('button',name='收合數學',exact=True)).to_have_attribute('aria-expanded','true')
    page.get_by_role('button',name='隱藏樹狀圖',exact=True).click();expect(tree).to_be_hidden()
    page.get_by_role('button',name='顯示樹狀圖',exact=True).click();expect(tree).to_be_visible()
    expect(page.get_by_role('button',name='收合數學',exact=True)).to_have_attribute('aria-expanded','true')
    area=page.locator('#problem-owned1 .transition-\\[height\\]')
    page.wait_for_timeout(400);initial=area.bounding_box()['height'];assert initial>400
    for _ in range(3):
      page.get_by_title('收合推導區（保留高度與筆跡）',exact=True).click();page.wait_for_timeout(250)
      assert area.bounding_box()['height']<=1
      page.get_by_title('展開推導區 (850px)',exact=True).click();page.wait_for_timeout(250)
      assert abs(area.bounding_box()['height']-initial)<=1
    assert not any(p.endswith('/draw') for p,_ in writes), 'Folding must never save zero height'
    page.get_by_role('button',name='封存此題目（確定不會再錯）',exact=True).click()
    expect(page.get_by_role('button',name='解除封存',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='重新套用篩選',exact=True)).to_be_visible()

    page.get_by_role('group',name='題目來源').get_by_role('link',name='共用中',exact=True).click()
    page.get_by_label('選擇可貢獻的共用集').select_option('c1')
    toggle=page.get_by_role('button',name='老師 · 參考筆跡',exact=True)
    expect(toggle).to_have_attribute('aria-pressed','true')
    active_color=toggle.evaluate('(el)=>getComputedStyle(el).backgroundColor')
    toggle.click();expect(toggle).to_have_attribute('aria-pressed','false')
    assert toggle.evaluate('(el)=>getComputedStyle(el).backgroundColor')!=active_color
    page.get_by_label('我的共用筆記').fill('共用筆記測試')
    page.evaluate("window.history.pushState({},'', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))")
    page.wait_for_timeout(1300)
    assert any('/api/collections/c1/items/entry1/layers/notes' == p for p,_ in writes), writes
    assert not any('/problems/' in p for p,_ in writes), writes
    page.go_back();page.wait_for_load_state('networkidle')
    expect(page.get_by_label('選擇可貢獻的共用集')).to_have_value('c1')
    expect(page.get_by_label('我的共用筆記')).to_have_value('共用筆記測試')
    page.goto(BASE+'/extended?collection_id=c1');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('img',name='共用測試題',exact=True)).to_be_visible()
    page.get_by_role('button',name='標記星號',exact=True).click()
    expect(page.get_by_role('button',name='取消星號',exact=True)).to_be_visible();assert not saved
    page.get_by_role('button',name='存入我的題庫',exact=True).click()
    page.get_by_role('link',name='已存入 · 前往訂正',exact=True).click()
    expect(page.get_by_role('group',name='題目來源').get_by_role('link',name='我存入',exact=True)).to_have_attribute('aria-current','page')
    expect(page.get_by_text('我的科目與單元',exact=True)).to_have_count(0)
    expect(page.get_by_role('button',name='檢查來源更新',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='移除我的已存版本',exact=True)).to_be_visible()
    page.get_by_title('點擊以變更題目分類',exact=True).click()
    expect(page.get_by_role('dialog',name='修改題目分類',exact=True)).to_be_visible()
    page.get_by_role('button',name='關閉對話框').click()
    page.get_by_label('我的私人筆記').fill('私人筆記測試')
    page.evaluate("window.history.pushState({},'', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))");page.wait_for_timeout(1300)
    assert any(p=='/api/saved/s1/workspace/notes' for p,_ in writes),writes
    page.goto(BASE+'/settings/collections/c1');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('switch',name='向觀看者展示共用筆跡')).to_have_attribute('aria-checked','false')
    expect(page.get_by_text('共用題目文字摘要',exact=True)).to_be_visible()
    expect(page.get_by_text('候選題目辨識內容',exact=True)).to_be_visible()
    thumbnail=page.get_by_role('button',name='檢視 其他題 圖片',exact=True)
    assert thumbnail.locator('img').bounding_box()['width']>=120
    thumbnail.click();expect(page.get_by_role('checkbox').first).not_to_be_checked()
    expect(page.get_by_title('關閉檢視器 (Esc)',exact=True)).to_be_visible()
    page.get_by_title('關閉檢視器 (Esc)',exact=True).click()
    page.get_by_role('heading',name='加入我上傳的原題',exact=True).locator('..').screenshot(path='.wrangler/collection-candidates.png')
    page.get_by_text('向觀看者展示共用筆跡',exact=True).click()
    expect(page.get_by_role('switch',name='向觀看者展示共用筆跡')).to_have_attribute('aria-checked','false')
    page.get_by_role('checkbox').first.check()
    page.locator('#candidate-topic').select_option('math')
    page.get_by_role('button',name='套用搜尋與分類').click()
    expect(page.get_by_text('已選 1 題，其中 1 題在目前篩選外',exact=True)).to_be_visible()
    page.get_by_role('checkbox').first.check()
    expect(page.get_by_role('button',name='加入選取的 2 題')).to_be_enabled()
    page.get_by_role('button',name='加入選取的 2 題').click()
    expect(page.get_by_text('已加入 1 題；1 題未成功，可重試。',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='加入選取的 1 題')).to_be_enabled()
    page.get_by_role('button',name='加入選取的 1 題').click()
    expect(page.get_by_text('已選 0 題',exact=True)).to_be_visible()

    page.get_by_role('button',name='刪除集合',exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.get_by_role('button',name='關閉對話框').click()
    page.screenshot(path='.wrangler/reader-management.png',full_page=True)
    scroll_rows[0]=True;page.goto(BASE+'/study?source=owned');page.wait_for_load_state('networkidle')
    page.locator('[data-reader]').evaluate('(el)=>el.scrollTop=2000');page.wait_for_timeout(600)
    before_scroll=page.locator('[data-reader]').evaluate('(el)=>el.scrollTop')
    page.evaluate("window.history.pushState({},'', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))")
    page.go_back();page.wait_for_load_state('networkidle');page.wait_for_timeout(1200)
    after_scroll=page.locator('[data-reader]').evaluate('(el)=>el.scrollTop')
    assert abs(before_scroll-after_scroll)<80, {'before':before_scroll,'after':after_scroll}
    scroll_rows[0]=False
    # Manual pagination keeps its cursor after failure and rejects duplicate clicks.
    paging[0]=True;page.goto(BASE+'/study?source=owned&tag=pagination-test');page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='載入更多題目',exact=True).click()
    expect(page.get_by_role('button',name='重試載入更多',exact=True)).to_be_visible()
    page.get_by_role('button',name='重試載入更多',exact=True).evaluate('(el)=>{el.click();el.click();}')
    page.wait_for_load_state('networkidle')
    more_calls=[c for c in calls if c[1]=='/api/search' and c[2].get('offset')==['30'] and not c[2].get('metadata_only')]
    assert len(more_calls)==2,more_calls # one failed attempt, one retry
    page.get_by_role('button',name='載入更多題目',exact=True).click();page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button',name='載入更多題目',exact=True)).to_have_count(0)
    expect(page.locator('#problem-page2')).to_be_attached()
    # Archiving shifts offset-based pages: rescan and merge rather than skip a row.
    page.goto(BASE+'/study?source=owned&tag=shift-test');page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='封存此題目（確定不會再錯）',exact=True).click();page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='載入更多題目',exact=True).click();page.wait_for_load_state('networkidle')
    page.locator('[data-reader]').evaluate('(el)=>el.scrollTop=el.scrollHeight');page.wait_for_timeout(200)
    expect(page.locator('#problem-page1')).to_be_attached()
    page.get_by_role('button',name='載入更多題目',exact=True).click();page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button',name='載入更多題目',exact=True)).to_have_count(0)
    expect(page.locator('#problem-page2')).to_be_attached()
    paging[0]=False;scroll_rows[0]=True
    # Compact search is an image grid, with no notes or writing UI.
    page.goto(BASE+'/search?source=owned&q=題目&view=compact');page.wait_for_load_state('networkidle')
    grid=page.locator('[data-search-grid]').first
    expect(grid.locator('article')).to_have_count(2)
    first,second=[el.bounding_box() for el in grid.locator('article').all()]
    assert abs(first['y']-second['y'])<1 and second['x']>first['x']
    expect(grid.get_by_role('img')).to_have_count(2)
    page.screenshot(path='.wrangler/search-compact.png',full_page=True)
    expect(page.get_by_label('本題筆記')).to_have_count(0)
    search_header=page.locator('main header')
    expect(search_header.get_by_label('搜尋檢視方式')).to_be_visible()
    grid.get_by_role('link',name='前往刷題',exact=True).nth(1).click();page.wait_for_load_state('networkidle')
    assert 'focus=owned1' in page.url
    # Search is read-only and returns to its query and display mode.
    page.goto(BASE+'/search?source=owned&q=題目&view=full');page.wait_for_load_state('networkidle')
    expect(page.get_by_label('搜尋檢視方式')).to_have_value('full')
    expect(page.locator('aside')).to_have_count(0)
    expect(page.get_by_role('button',name='完成訂正',exact=True)).to_have_count(0)
    expect(page.get_by_label('本題筆記').first).to_be_disabled()
    page.locator('[data-reader]').evaluate('(el)=>el.scrollTop=1600');page.wait_for_timeout(400)
    page.get_by_role('link',name='前往刷題',exact=True).first.click();page.wait_for_load_state('networkidle')
    expect(page.locator('header').get_by_role('navigation',name='主要導覽')).to_be_visible()
    page.get_by_role('button',name='返回',exact=True).click();page.wait_for_load_state('networkidle');page.wait_for_timeout(1100)
    assert 'view=full' in page.url and 'q=' in page.url
    expect(page.get_by_label('搜尋檢視方式')).to_have_value('full')
    assert page.locator('[data-reader]').evaluate('(el)=>el.scrollTop')>1000
    scroll_rows[0]=False
    page.goto(BASE+'/settings#collections');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('group',name='設定分類').get_by_role('button')).to_have_count(5)
    expect(page.get_by_role('link',name='探索公開題目',exact=True)).to_have_count(0)
    page.get_by_role('button',name='個人檔案',exact=True).click();page.wait_for_load_state('networkidle')
    expect(page.get_by_label('公開顯示名稱')).to_be_visible()
    expect(page.get_by_label('預設上傳目的地')).to_be_visible()
    profile_card=page.get_by_role('heading',name='個人檔案',exact=True).locator('..')
    expect(profile_card.get_by_role('heading',name='iOS 捷徑 API Key 管理',exact=True)).to_be_visible()
    page.screenshot(path='.wrangler/profile-settings.png',full_page=True)
    inbox=page.get_by_role('region',name='收到的邀請')
    expect(inbox.get_by_text('公開物理集',exact=True)).to_be_visible()
    inbox.get_by_role('button',name='接受邀請',exact=True).click()
    expect(inbox.get_by_role('link',name='觀看題目集與設定訂閱',exact=True)).to_be_visible()
    assert 'c3' not in subscriptions, 'Invitation acceptance must not subscribe'
    page.goto(BASE+'/');page.wait_for_load_state('networkidle')
    private=page.get_by_role('region',name='共用與訂閱動態')
    public=page.get_by_role('region',name='公開探索動態')
    expect(private).to_have_count(0);expect(public).to_be_visible()
    activity_updates[0]=True;page.reload();page.wait_for_load_state('networkidle')
    expect(private).to_be_visible();expect(public).to_be_visible()
    expect(public.get_by_text('我的共用集',exact=False)).to_have_count(0)
    page.screenshot(path='.wrangler/dashboard-sections.png',full_page=True)
    public.get_by_role('link',name='探索公開題目',exact=True).click();page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading',name='公開探索',exact=True)).to_be_visible()
    page.get_by_role('button',name='訂閱題目集',exact=True).first.click();expect(page).to_have_url(re.compile(r'/extended\?'));page.wait_for_load_state('networkidle')
    assert '/extended' in page.url and 'c2' in subscriptions, {'url':page.url,'subscriptions':list(subscriptions)}
    expect(page.get_by_text('已訂閱',exact=True)).to_be_visible()
    page.goto(BASE+'/explore');page.wait_for_load_state('networkidle')
    expect(page.get_by_label('選擇公開題目集').locator('option[value="c2"]')).to_have_count(0)
    expect(page.get_by_role('link',name='公開數學集',exact=True)).to_have_count(0)
    page.screenshot(path='.wrangler/public-explore.png',full_page=True)
    page.goto(BASE+'/extended');page.wait_for_load_state('networkidle')
    picker=page.get_by_label('選擇已訂閱的題目集')
    expect(page.get_by_role('img',name='共用測試題',exact=True)).to_have_count(0)
    expect(picker.locator('option[value="c3"]')).to_have_count(0)
    for cid in ['c2','c1','c2']:
      picker.select_option(cid);page.wait_for_load_state('networkidle')
      expect(picker).to_have_value(cid)
      expect(page.get_by_role('img',name='共用測試題',exact=True)).to_be_visible()
    page.get_by_label('尋找已訂閱的集合').fill('不符合任何名稱')
    expect(picker).to_have_value('c2')
    expect(picker.locator('option[value="c2"]')).to_have_count(1)
    page.screenshot(path='.wrangler/extended-selection.png',full_page=True)
    page.goto(BASE+'/explore?collection_id=c2');page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='取消訂閱題目集',exact=True).click();expect(page).to_have_url(re.compile(r'/explore\?'));page.wait_for_load_state('networkidle')
    assert '/explore' in page.url and 'c2' not in subscriptions
    expect(page.get_by_role('button',name='訂閱題目集',exact=True)).to_be_visible()
    page.goto(BASE+'/extended?collection_id=c2');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('img',name='共用測試題',exact=True)).to_have_count(0)
    expect(page.get_by_text('此集合未訂閱或目前無法觀看。',exact=False)).to_be_visible()
    # Read-only virtualization retains row height while remounted content is slow.
    external_scroll[0]=True
    page.add_init_script(r"""const nativeFetch=window.fetch;window.fetch=(...args)=>nativeFetch(...args).then(async response=>{if(/collections\/c2\/items\/scroll/.test(String(args[0]))&&!String(args[0]).endsWith('/image'))await new Promise(resolve=>setTimeout(resolve,700));return response;});""")
    page.goto(BASE+'/explore');page.wait_for_load_state('networkidle');page.wait_for_timeout(900)
    stream=page.locator('[data-reader]')
    row=stream.locator('[data-index="0"]');first_height=row.bounding_box()['height']
    stream.evaluate('(el)=>el.scrollTop=4500');page.wait_for_timeout(1000)
    expect(row).to_have_count(0)
    stream.evaluate('(el)=>el.scrollTop=0');page.wait_for_timeout(100)
    expect(row.locator('[data-reader-loading="true"]')).to_be_attached()
    assert abs(row.bounding_box()['height']-first_height)<2,{'initial':first_height,'reload':row.bounding_box()['height']}
    page.wait_for_timeout(850)
    assert stream.evaluate('(el)=>el.scrollTop')<2
    external_scroll[0]=False
    # Nearby work cards/images survive reverse scroll; distant remounts reserve
    # height during slow API loads. Offscreen work cards do not retain live canvas.
    work_scroll[0]=True
    page.add_init_script(r"""const workFetch=window.fetch;window.fetch=(...args)=>workFetch(...args).then(async response=>{if(/\/saved\/ws\d+$|\/collections\/c1\/items\/wsh\d+$/.test(String(args[0])))await new Promise(resolve=>setTimeout(resolve,500));return response;});""")
    for source,prefix in [('saved','ws'),('contributing','wsh'),('owned','wo')]:
      page.goto(BASE+f'/study?source={source}'+('&collection_id=c1' if source=='contributing' else ''))
      page.wait_for_load_state('networkidle');page.wait_for_timeout(700)
      stream=page.locator('[data-reader]');row=stream.locator('[data-index="0"]')
      first_height=row.bounding_box()['height'];row.evaluate('(el)=>el.dataset.retained="yes"')
      detail='/api/saved/ws0' if source=='saved' else '/api/collections/c1/items/wsh0'
      before=sum(p==detail for _,p,_ in calls)
      stream.evaluate('(el,y)=>el.scrollTop=y',first_height*2);page.wait_for_timeout(700)
      expect(row).to_have_attribute('data-retained','yes')
      expect(row.locator('canvas')).to_have_count(0)
      stream.evaluate('(el)=>el.scrollTop=0');page.wait_for_timeout(150)
      expect(row).to_have_attribute('data-retained','yes')
      assert sum(p==detail for _,p,_ in calls)==before, 'Reverse scroll refetched a retained work card'
      expect(page.get_by_role('button',name='完成當題訂正',exact=True)).to_be_visible()
      stream.evaluate('(el)=>el.scrollTop=15000');page.wait_for_timeout(800)
      expect(row).to_have_count(0)
      stream.evaluate('(el)=>el.scrollTop=0');page.wait_for_timeout(100)
      if source!='owned':
        expect(row.locator('[data-reader-loading="true"]').first).to_be_attached()
        assert abs(row.bounding_box()['height']-first_height)<2, {'source':source,'before':first_height,'loading':row.bounding_box()['height']}
      page.wait_for_timeout(700)
      assert stream.evaluate('(el)=>el.scrollTop')<2, f'{source} jumped when scrolling back'
      card=row.locator('[data-problem-id]');footer=card.locator('button[aria-label="完成訂正"]').locator('..')
      assert card.bounding_box()['x']+card.bounding_box()['width']-(footer.bounding_box()['x']+footer.bounding_box()['width'])<30
      page.get_by_role('button',name='完成當題訂正',exact=True).click();page.wait_for_timeout(800)
      assert stream.evaluate('(el)=>el.scrollTop')>first_height-100, f'{source} did not advance'
      stream.evaluate('(el)=>el.scrollTop=0');page.wait_for_timeout(250)
      expect(page.get_by_role('button',name='切換下一題',exact=True)).to_be_visible()
      page.get_by_role('button',name='切換下一題',exact=True).click();page.wait_for_timeout(350)
      assert stream.evaluate('(el)=>el.scrollTop')>first_height-100
    work_scroll[0]=False
    # Entry links open a single read-only card; they do not subscribe or open an editor.
    page.goto(BASE+'/collections/c2/items/entry2');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('img',name='共用測試題',exact=True)).to_have_count(1)
    expect(page.get_by_label('本題筆記')).to_have_count(0)
    page.get_by_role('button',name='分享連結',exact=True).click()
    expect(page.get_by_label('題目分享網址')).to_have_value(BASE+'/collections/c2/items/entry2')
    page.get_by_role('button',name='關閉對話框').click()
    assert 'c2' not in subscriptions
    page.goto(BASE+'/collections/c2');expect(page).to_have_url(re.compile(r'/explore\?collection_id=c2'));page.wait_for_load_state('networkidle')
    # Cancelling a link-only collection must preserve its authorized reader entry.
    subscriptions.add('c4');page.goto(BASE+'/extended?collection_id=c4');page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='取消訂閱題目集',exact=True).click()
    expect(page).to_have_url(re.compile(r'/collections/c4\?'));page.wait_for_load_state('networkidle')
    expect(page.get_by_role('img',name='共用測試題',exact=True)).to_be_visible()
    assert 'c4' not in subscriptions
    page.goto(BASE+'/settings/collections/c1');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading',name='題目管理',exact=True)).to_be_visible()
    expect(page.get_by_role('link',name='前往共用書寫',exact=True)).to_have_count(0)
    page.goto(BASE+'/study?source=owned');page.wait_for_load_state('networkidle');page.screenshot(path='.wrangler/study-restored.png',full_page=True)
    context.close()
    mobile=browser.new_context(**pw.devices['iPhone 13'],service_workers='block')
    mobile.route('**/api/**',fixture);p=mobile.new_page();p.goto(BASE+'/extended?collection_id=c1');p.wait_for_load_state('networkidle')
    expect(p.get_by_role('navigation',name='主要導覽').get_by_role('link')).to_have_count(5)
    expect(p.get_by_role('navigation',name='主要導覽').get_by_role('link',name='延伸題目',exact=True)).to_be_visible()
    scroll_rows[0]=True
    p.goto(BASE+'/search?source=owned&view=compact');p.wait_for_load_state('networkidle')
    grid=p.locator('[data-search-grid]').first
    first,second=[el.bounding_box() for el in grid.locator('article').all()]
    assert second['y']>first['y'] and abs(first['x']-second['x'])<1
    assert p.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Compact results overflow mobile viewport'
    p.screenshot(path='.wrangler/search-compact-mobile.png',full_page=True)
    scroll_rows[0]=False
    p.goto(BASE+'/extended?collection_id=c1');p.wait_for_load_state('networkidle')
    p.screenshot(path='.wrangler/reader-mobile.png',full_page=True)
    p.goto(BASE+'/study?source=owned');p.wait_for_load_state('networkidle')
    mobile_nav=p.locator('nav').filter(has=p.get_by_role('link',name='延伸題目',exact=True)).last
    expect(mobile_nav).to_be_visible()
    expect(mobile_nav.get_by_role('link')).to_have_count(4)
    expect(mobile_nav.get_by_role('button',name='開啟刷題側邊欄',exact=True)).to_have_attribute('aria-current','page')
    boxes=[el.bounding_box() for el in mobile_nav.locator(':scope > *').all()]
    assert max(b['width'] for b in boxes)-min(b['width'] for b in boxes)<=1
    expect(p.locator('header input')).to_have_count(0)
    toolbar=p.get_by_title('展開工具列',exact=True).locator('..').bounding_box()
    sources=p.locator('[data-study-sources]').bounding_box()
    assert toolbar['y']>=sources['y']+sources['height'], 'Pen tools obscure floating source controls'
    assert sources['y']<p.locator('[data-reader]').bounding_box()['y']+32, 'Sources should float at the top'
    p.locator('[data-reader]').evaluate('(el)=>el.scrollTop=el.scrollHeight');p.wait_for_timeout(200)
    expect(mobile_nav).to_be_visible()
    nav_box=mobile_nav.bounding_box();reader_box=p.locator('[data-reader]').bounding_box()
    assert reader_box['y']+reader_box['height']<=nav_box['y']+1,'Reader extends beneath bottom navigation'
    assert sources['y']+sources['height']<=nav_box['y']+1,'Sources extend beneath bottom navigation'
    p.screenshot(path='.wrangler/study-mobile-nav.png',full_page=True)
    mobile_nav.get_by_role('link',name='搜尋',exact=True).click();p.wait_for_load_state('networkidle')
    mobile_nav.get_by_role('link',name='刷題',exact=True).click();p.wait_for_load_state('networkidle')
    mobile_nav.get_by_role('button',name='開啟刷題側邊欄',exact=True).click()
    drawer=p.locator('#study-mobile-sidebar');expect(drawer).to_be_visible()
    drawer_box=drawer.bounding_box();nav_box=mobile_nav.bounding_box()
    assert drawer_box['y']+drawer_box['height']<=nav_box['y']+1
    mobile_nav.get_by_role('button',name='關閉刷題側邊欄',exact=True).click();expect(drawer).to_have_count(0)
    mobile_nav.get_by_role('button',name='開啟刷題側邊欄',exact=True).click()
    p.get_by_role('button',name='選擇分類數學',exact=True).click()
    p.wait_for_load_state('networkidle');assert 'topic_id=math' in p.url
    # A local anonymous upload fixture verifies the multi-select file picker.
    mobile.route('**/api/auth/me',lambda r:r.fulfill(json={'user':None}))
    p.reload();p.wait_for_load_state('networkidle')
    p.goto(BASE+'/');p.wait_for_load_state('networkidle')
    p.get_by_role('button',name='批次上傳題目').click()
    import base64
    png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOmcAAAAASUVORK5CYII=')
    picker=p.get_by_label('選擇考卷圖片');assert picker.get_attribute('multiple') is not None
    picker.set_input_files([{'name':name,'mimeType':'image/png','buffer':png} for name in ['one.png','two.png']])
    expect(p.get_by_text('待上傳圖片清單 (2 張)',exact=True)).to_be_visible()
    p.get_by_role('button',name='預覽 one.png',exact=True).click();p.get_by_title('關閉檢視器 (Esc)',exact=True).click()
    expect(p.get_by_text('待上傳圖片清單 (2 張)',exact=True)).to_be_visible()
    p.get_by_role('button',name='移除 two.png',exact=True).click()
    expect(p.get_by_text('待上傳圖片清單 (1 張)',exact=True)).to_be_visible()

    p.get_by_role('button',name='關閉上傳視窗',exact=True).click() if p.get_by_role('button',name='關閉上傳視窗',exact=True).count() else p.keyboard.press('Escape')
    for destination in ['/extended','/study?source=saved','/settings#profile','/settings#taxonomy','/settings#subscriptions','/settings#collections']:
      p.goto(BASE+destination);p.wait_for_load_state('networkidle')
      notice=p.get_by_role('region',name='登入提示')
      expect(notice).to_have_count(1)
      expect(notice.get_by_role('button',name='登入',exact=True)).to_be_visible()
    assert not errors,errors
    mobile.close();browser.close()
    print('PASS: source isolation, pagination/retry/history, image-only preview, responsive compact search, separate activity, invitation acceptance, explicit subscription/cancellation, collection switching, mobile upload/navigation')

if __name__=='__main__':
  Path('.wrangler').mkdir(exist_ok=True)
  run()
