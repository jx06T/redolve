"""Synthetic browser regression for canonical source work and exclude-self navigation."""
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

USER={'id':'source-author','name':'作者'}
CO={'id':'co','title':'同步集合','role':'contributor','can_contribute':True,'visibility':'public','lifecycle':'active'}
INK={'strokes':[],'eraserMasks':[],'calcSpaceHeight':100}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,channel='msedge')
 for width in [1280,390]:
  context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block');state={'notes':'原題既有筆記','notes_seq':3,'draw_seq':4,'status':'unsolved','version':1};calls=[];writes=[];errors=[]
  def fixture(route):
   req=route.request;url=urlparse(req.url);path=url.path;query=parse_qs(url.query)
   if path.endswith('/image') or path=='/api/images/q':return route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="150"><rect width="600" height="150" fill="white"/></svg>')
   if path=='/api/auth/me':result={'user':USER}
   elif path=='/api/taxonomy':result={'tree':[{'id':'math','label':'數學','level':0,'children':[]}],'customNodes':[],'counts':{}}
   elif path=='/api/my/collections':result={'collections':[CO]}
   elif path=='/api/my/collections/membership':result={'memberships':{}}
   elif path=='/api/me/public-profile':result={'profile':{'display_name':'作者'}}
   elif path=='/api/search':
    calls.append(query);shared=query.get('contributing')==['yes'];owned=query.get('origin')==['owned'];ids=['other'] if query.get('exclude_self')==['yes'] else ['entry','other'] if shared else ['q'] if owned else []
    rows=[]
    for sid in ids:
     row={'id':sid,'origin':'shared' if shared else 'owned','title':'同一原題' if sid!='other' else '他人的題目','topic_id':'math','topic_label':'數學','status':state['status'] if sid!='other' else 'unsolved','review_count':1,'collection_id':'co' if shared else None}
     if owned:row['problem']={'id':'q','user_id':USER['id'],'source':'同一原題','image_url':'q','draw_data':json.dumps(INK),'draw_seq':state['draw_seq'],'typed_notes':state['notes'],'notes_seq':state['notes_seq'],'vector_clock':json.dumps({'seq':state['draw_seq']}),'status':state['status'],'review_count':1,'keywords':'[]'}
     rows.append(row)
    result={'items':rows,'next_offset':None,'scope':'shared' if shared else 'mine'}
   elif path in ['/api/collections/co/items/entry','/api/collections/co/items/other']:
    own=path.endswith('/entry');result={'collection':CO,'entry':{'id':'entry' if own else 'other','generation':1},'source':{'id':'q' if own else 'peer','source':'同一原題' if own else '他人的題目','contributor_id':USER['id'] if own else 'peer-author','provider_name':'作者' if own else '他人'},'layers':[{'id':'source:q' if own else 'source:peer','user_id':USER['id'] if own else 'peer-author','author_display':'作者' if own else '他人','is_source':True,'has_draw':True,'draw_asset_id':None,'draw_seq':state['draw_seq'],'notes_seq':state['notes_seq'],'typed_notes':state['notes'] if own else '別人的原題筆記'}], 'progress':{'status':state['status'] if own else 'unsolved','previous_status':'unsolved','review_count':1,'row_version':state['version'] if own else 0},'capabilities':{'can_contribute':True,'can_save':not own}}
    if own:result['layers'].append({'id':'legacy','user_id':USER['id'],'author_display':'作者 · 舊共用作業','legacy_source':True,'draw_asset_id':'old-ink','draw_seq':0,'notes_seq':0,'typed_notes':'舊獨立共用筆記'})
   elif path.endswith('/layers/notes') and req.method=='PUT':
    body=req.post_data_json;writes.append((path,body))
    if '/entry/' in path:state['notes']=body['typed_notes'];state['notes_seq']+=1
    result={'notes_seq':state['notes_seq'] if '/entry/' in path else 1}
   elif path.endswith('/progress') and req.method=='PUT':
    writes.append((path,req.post_data_json));state['status']='resolved';state['version']+=1;result={'progress':{'status':'resolved','previous_status':'unsolved','review_count':1,'row_version':state['version']}}
   elif path.endswith('/draw'):result=INK
   else:result={'items':[],'collections':[],'subscriptions':[],'keys':[],'memberships':{}}
   route.fulfill(json=result)
  context.route('**/api/**',fixture);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  legacy_target={'kind':'shared','collectionId':'co','entryId':'entry','generation':1}
  old_key='rdv:work:v1:source-author:'+json.dumps(legacy_target,separators=(',',':'))
  page.add_init_script('localStorage.setItem('+json.dumps(old_key)+',JSON.stringify({notes:"舊獨立共用草稿",inkSeq:0,notesSeq:0}));')
  url='http://127.0.0.1:4181/study?source=contributing&collection_id=co&status=all'
  page.goto(url);card=page.locator('[data-problem-id="entry"]');notes=card.get_by_label('我的共用筆記');expect(notes).to_have_value('原題既有筆記');legacy=card.get_by_role('button',name='作者 · 舊共用作業 · 參考筆跡',exact=True);expect(legacy).to_have_attribute('aria-pressed','false');legacy.click();expect(legacy).to_have_attribute('aria-pressed','true');legacy.click();page.wait_for_timeout(1100);assert not writes,'old independent draft must not replay into original'
  notes.fill('共用中修改原題');expect(card.locator('[data-work-sync-status]').get_by_role('status')).to_have_text('已同步',timeout=6000)
  assert writes[-1][1]['expected_seq']==3 and writes[-1][1]['expected_generation']==1 and writes[-1][1]['source_item_id']=='q'
  card.get_by_role('button',name='完成訂正',exact=True).click();expect(card.get_by_role('button',name='已訂正完畢',exact=True)).to_be_visible()
  page.get_by_role('group',name='題目來源').get_by_role('link',name='我上傳',exact=True).click();owned=page.locator('[data-problem-id="q"]');expect(owned.get_by_label('本題筆記')).to_have_value('共用中修改原題');expect(owned.get_by_role('button',name='已訂正完畢',exact=True)).to_be_visible()
  page.goto(url);expect(page.locator('[data-problem-id="entry"]').get_by_label('我的共用筆記')).to_have_value('共用中修改原題')
  if width<1024:page.get_by_role('button',name='開啟刷題側邊欄',exact=True).click()
  sidebar=page.locator('aside' if width>=1024 else '#study-mobile-sidebar');sidebar.get_by_role('switch',name='只看其他人貢獻').click();page.wait_for_load_state('networkidle');assert 'exclude_self=yes' in page.url
  sidebar.get_by_role('button',name='所有科目',exact=True).click();sidebar.get_by_role('button',name='數學',exact=True).click();page.wait_for_timeout(200);page.wait_for_load_state('networkidle')
  assert calls[-1]['exclude_self']==['yes'] and any(q.get('metadata_only') and q.get('exclude_self')==['yes'] for q in calls),(page.url,calls)
  if width<1024 and page.get_by_role('button',name='開啟刷題側邊欄',exact=True).count():page.get_by_role('button',name='開啟刷題側邊欄',exact=True).click()
  link=sidebar.get_by_role('link',name='前往搜尋',exact=True);assert 'exclude_self=yes' in link.get_attribute('href');link.click();expect(page.get_by_role('heading',name='來源：他人的題目',exact=True)).to_be_visible();expect(page.get_by_role('heading',name='來源：同一原題',exact=True)).to_have_count(0)
  page.get_by_text('篩選',exact=True).click();expect(page.get_by_role('switch',name='只看其他人貢獻')).to_have_attribute('aria-checked','true')
  assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  context.close();print(f'PASS source work, legacy draft isolation, own progress and exclude-self navigation at {width}px')
 browser.close()
