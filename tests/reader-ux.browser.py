"""Run against vite preview with webapp-testing/scripts/with_server.py.
Uses request fixtures so destructive actions never touch a real account.
"""
import json
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
         'source_item_id': 'original', 'contributor_id': 'teacher', 'is_starred': 0, 'is_read': 0}

def run():
  with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, service_workers='block')
    writes, saved, calls = [], [], []
    fail_batch = [True]
    scroll_rows = [False]
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
      elif path == '/api/subscriptions': result={'subscriptions':[{'collection_id':'c1','title':CO['title'],'last_known_title':CO['title'],'can_read':True,'subscribed_at':'2026-10-09T00:00:00Z'}]}
      elif path == '/api/saved/inspect': result={'existing_id':None,'own_source':False}
      elif path == '/api/saved' and request.method == 'POST':
        saved.append('s1');result={'saved_id':'s1','status':'saved'}
      elif path == '/api/saved/s1': result={'saved':{'id':'s1','entry_id':'entry1','row_version':1,'status':'unsolved','personal_topic_id':'math'},'snapshot':{'source_title':'共用測試題','collection_title':CO['title'],'provider_public_name':'老師'},'workspace':{'draw_asset_id':None,'draw_seq':0,'typed_notes':'','notes_seq':0},'layers':[],'source':{'available':True}}
      elif path == '/api/collections/c1': result={'collection':CO,'items':[ENTRY],'next_cursor':None}
      elif path == '/api/collections/c1/items/entry1': result={'collection':CO,'entry':ENTRY,'source':SOURCE,'layers':[],'capabilities':{'can_contribute':True,'can_save':True}}
      elif path.endswith('/notes'):
        writes.append((path,body));result={'notes_seq':body['expected_seq']+1}
      elif path.endswith('/draw') and request.method == 'PUT': result={'draw_seq':body['expected_seq']+1}
      elif path.endswith('/star'): result={'starred':body['starred']}
      elif path == '/api/collections/c1/candidates': result={'items':[{'id':'candidate2' if query.get('topic_id') else 'candidate1','title':'數學題' if query.get('topic_id') else '其他題','created_at':'2026-10-09'}],'next_cursor':None}
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
    expect(page.get_by_role('link',name='已公開於〔測試共用集〕',exact=True)).to_be_visible()
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

    page.get_by_role('group',name='題目來源').get_by_role('link',name='我共用中',exact=True).click()
    page.get_by_label('選擇可貢獻的共用集').select_option('c1')
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
    page.get_by_label('我的私人筆記').fill('私人筆記測試')
    page.evaluate("window.history.pushState({},'', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))");page.wait_for_timeout(1300)
    assert any(p=='/api/saved/s1/workspace/notes' for p,_ in writes),writes
    page.goto(BASE+'/settings/collections/c1');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('switch',name='向觀看者展示共用筆跡')).to_have_attribute('aria-checked','false')
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
    # Search is read-only and returns to its query and display mode.
    page.goto(BASE+'/search?source=owned&q=題目&view=full');page.wait_for_load_state('networkidle')
    expect(page.get_by_label('搜尋檢視方式')).to_have_value('full')
    expect(page.locator('aside')).to_have_count(0)
    expect(page.get_by_role('button',name='完成訂正',exact=True)).to_have_count(0)
    expect(page.get_by_label('本題筆記').first).to_be_disabled()
    page.locator('[data-reader]').evaluate('(el)=>el.scrollTop=1600');page.wait_for_timeout(400)
    page.get_by_role('link',name='前往刷題',exact=True).first.click();page.wait_for_load_state('networkidle')
    expect(page.locator('header').get_by_role('navigation',name='主要導覽')).to_be_visible()
    page.get_by_role('button',name='返回上一步',exact=True).click();page.wait_for_load_state('networkidle');page.wait_for_timeout(1100)
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
    page.goto(BASE+'/settings/collections/c1');page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading',name='題目管理',exact=True)).to_be_visible()
    expect(page.get_by_role('link',name='前往共用書寫',exact=True)).to_have_count(0)
    page.goto(BASE+'/study?source=owned');page.wait_for_load_state('networkidle');page.screenshot(path='.wrangler/study-restored.png',full_page=True)
    context.close()
    mobile=browser.new_context(**pw.devices['iPhone 13'],service_workers='block')
    mobile.route('**/api/**',fixture);p=mobile.new_page();p.goto(BASE+'/extended?collection_id=c1');p.wait_for_load_state('networkidle')
    expect(p.get_by_role('navigation',name='主要導覽').get_by_role('link')).to_have_count(5)
    expect(p.get_by_role('navigation',name='主要導覽').get_by_role('link',name='延伸題目',exact=True)).to_be_visible()
    p.screenshot(path='.wrangler/reader-mobile.png',full_page=True)
    p.goto(BASE+'/study?source=owned');p.wait_for_load_state('networkidle')
    mobile_nav=p.locator('nav').filter(has=p.get_by_role('link',name='延伸題目',exact=True)).last
    expect(mobile_nav).to_be_visible()
    expect(mobile_nav.get_by_role('link')).to_have_count(5)
    expect(mobile_nav.get_by_role('link',name='刷題',exact=True)).to_have_attribute('aria-current','page')
    expect(p.locator('header input')).to_have_count(0)
    toolbar=p.get_by_title('展開工具列',exact=True).locator('..').bounding_box()
    sources=p.locator('[data-study-sources]').bounding_box()
    assert toolbar['y']>=sources['y']+sources['height'], 'Pen tools obscure floating source controls'
    p.locator('[data-reader]').evaluate('(el)=>el.scrollTop=el.scrollHeight');p.wait_for_timeout(200)
    expect(mobile_nav).to_be_visible()
    nav_box=mobile_nav.bounding_box();reader_box=p.locator('[data-reader]').bounding_box()
    assert reader_box['y']+reader_box['height']<=nav_box['y']+1,'Reader extends beneath bottom navigation'
    p.screenshot(path='.wrangler/study-mobile-nav.png',full_page=True)
    mobile_nav.get_by_role('link',name='搜尋',exact=True).click();p.wait_for_load_state('networkidle')
    mobile_nav.get_by_role('link',name='刷題',exact=True).click();p.wait_for_load_state('networkidle')
    p.get_by_role('button',name='開啟章節導航與篩選',exact=True).click()
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

    assert not errors,errors
    mobile.close();browser.close()
    print('PASS: source isolation, manual pagination/retry/dedup/offset shifts, read-only search, history restoration, profile/settings, batch selection, app dialogs, mobile upload/navigation')

if __name__=='__main__':
  Path('.wrangler').mkdir(exist_ok=True)
  run()
