"""Actual canvas/notes auto-merge and automatic version dialog; synthetic APIs."""
import copy
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

USER={'id':'merge-user','name':'合併測試'}
CO={'id':'c1','title':'測試集','role':'contributor','can_contribute':True,'visibility':'public','lifecycle':'active'}
REMOTE={'id':'remote-stroke','color':'#374151','width':2,'points':[[10,10,.5],[40,10,.5]]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,channel='msedge')
 for width in map(int,os.environ.get('MERGE_WIDTHS','1280,390').split(',')):
  for source in os.environ.get('MERGE_SOURCES','owned,saved,contributing').split(','):
   context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block')
   cloud={'ink':{'strokes':[],'eraserMasks':[],'baseWidth':800,'baseHeight':300,'calcSpaceHeight':100,'expansions':[]},'inkSeq':1,'notesSeq':1,'notes':'第一段\n中間段\n最後段'}
   inject_ink=[True];writes=[];errors=[]
   ident='q' if source=='owned' else 's1' if source=='saved' else 'e1'
   def item():
    return {'id':'q','user_id':USER['id'],'source':'測試原題','image_url':'fixture','draw_data':copy.deepcopy(cloud['ink']),
      'draw_seq':cloud['inkSeq'],'notes_seq':cloud['notesSeq'],'typed_notes':cloud['notes'],'status':'unsolved','review_count':0,'keywords':'[]'}
   def fixture(route):
    req=route.request;path=urlparse(req.url).path
    if path.endswith('/image'):
     return route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="white"/></svg>')
    if req.method in ['PUT','PATCH'] and (path.endswith(('/draw','/notes')) or path=='/api/problems/q'):
     body=req.post_data_json;writes.append((path,copy.deepcopy(body)))
     if 'draw_data' in body:
      seq=body['vector_clock']['seq']-1 if source=='owned' else body['expected_seq']
      if inject_ink[0]:
       inject_ink[0]=False;cloud.update(ink={**copy.deepcopy(body['draw_data']),'strokes':[copy.deepcopy(REMOTE)]},inkSeq=cloud['inkSeq']+1)
      if seq!=cloud['inkSeq']: return route.fulfill(status=409,json={'error':{'code':'CONFLICT','message':'筆跡版本不同'}})
      cloud.update(ink=copy.deepcopy(body['draw_data']),inkSeq=seq+1)
      return route.fulfill(json={'seq':seq+1,'draw_seq':seq+1})
     seq=body['expected_notes_seq'] if source=='owned' else body['expected_seq']
     if seq!=cloud['notesSeq']: return route.fulfill(status=409,json={'error':{'code':'CONFLICT','message':'筆記版本不同'}})
     cloud.update(notes=body['typed_notes'],notesSeq=seq+1)
     return route.fulfill(json={'notes_seq':seq+1})
    result={'items':[],'collections':[],'subscriptions':[],'keys':[],'memberships':{}}
    if path=='/api/auth/me': result={'user':USER}
    elif path=='/api/taxonomy': result={'tree':[],'customNodes':[],'counts':{}}
    elif path=='/api/my/collections': result={'collections':[CO]}
    elif path=='/api/me/public-profile': result={'profile':{'display_name':'合併測試'}}
    elif path=='/api/search':
     row={'id':ident,'origin':'shared' if source=='contributing' else source,'title':'測試原題','collection_id':'c1' if source=='contributing' else None}
     if source=='owned': row['problem']=item()
     result={'items':[row],'next_offset':None,'scope':'mine'}
    elif path=='/api/problems/q': result={'item':item()}
    elif path=='/api/saved/s1': result={'saved':{'id':'s1','entry_id':'e1','status':'unsolved','row_version':1},
      'snapshot':{'source_title':'測試原題','collection_title':'測試集'},'layers':[],'source':{'available':True},
      'workspace':{'draw_asset_id':'ink','draw_seq':cloud['inkSeq'],'notes_seq':cloud['notesSeq'],'typed_notes':cloud['notes']}}
    elif path=='/api/collections/c1/items/e1': result={'collection':CO,'entry':{'id':'e1','generation':1},
      'source':{'id':'other','source':'測試原題','contributor_id':'teacher'},'capabilities':{'can_contribute':True},
      'layers':[{'id':'l1','user_id':USER['id'],'author_display':'合併測試','draw_asset_id':'ink','draw_seq':cloud['inkSeq'],'notes_seq':cloud['notesSeq'],'typed_notes':cloud['notes']}]}
    elif path.endswith('/draw'): result=cloud['ink']
    route.fulfill(json=result)
   context.route('**/api/**',fixture)
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:4181/study?source='+source+('&collection_id=c1' if source=='contributing' else ''))
   page.wait_for_load_state('networkidle')
   card=page.locator(f'[data-problem-id="{ident}"]');canvas=card.locator('canvas').last
   expect(canvas).to_be_visible();rect=canvas.bounding_box()
   page.mouse.move(rect['x']+50,rect['y']+40);page.mouse.down();page.mouse.move(rect['x']+110,rect['y']+40,steps=3);page.mouse.up()
   page.wait_for_timeout(2600)
   assert len(cloud['ink']['strokes'])==2,(source,cloud,writes)
   ids=[s['id'] for s in cloud['ink']['strokes']];assert ids[0]=='remote-stroke' and ids[1]!=ids[0]
   expect(page.get_by_role('dialog')).to_have_count(0)
   page.keyboard.press('Control+z');page.wait_for_timeout(1300)
   assert [s['id'] for s in cloud['ink']['strokes']]==['remote-stroke'],('undo removed remote ink',cloud)
   page.keyboard.press('Control+Shift+z');page.wait_for_timeout(1300)
   assert [s['id'] for s in cloud['ink']['strokes']]==ids
   notes=card.get_by_label('本題筆記' if source=='owned' else '我的私人筆記' if source=='saved' else '我的共用筆記')
   # Non-overlapping note edits merge into the local textarea without losing focus/caret.
   cloud.update(notes='更新第一段\n中間段\n最後段',notesSeq=cloud['notesSeq']+1)
   notes.fill('第一段\n中間段\n最後段新增');page.wait_for_timeout(2500)
   expect(notes).to_have_value('更新第一段\n中間段\n最後段新增');expect(notes).to_be_focused()
   assert cloud['notes']=='更新第一段\n中間段\n最後段新增'
   assert notes.evaluate('(el)=>el.selectionStart')==len(cloud['notes'])
   cloud.update(notes='雲端整段替換',notesSeq=cloud['notesSeq']+1);notes.fill('本機整段替換')
   dialog=page.get_by_role('dialog');expect(dialog).to_be_visible(timeout=6000)
   expect(dialog.get_by_text('本機整段替換',exact=True)).to_be_visible();expect(dialog.get_by_text('雲端整段替換',exact=True)).to_be_visible()
   # A new cloud edit after opening the dialog must be reviewed before overwriting.
   cloud.update(notes='雲端再次更新',notesSeq=cloud['notesSeq']+1);before=len(writes)
   dialog.get_by_role('button',name='保留本機版本',exact=True).click()
   expect(dialog.get_by_role('alert')).to_contain_text('雲端作業已更新');assert len(writes)==before
   dialog.get_by_role('button',name='保留本機版本',exact=True).click();expect(dialog).to_have_count(0);page.wait_for_timeout(1300)
   assert cloud['notes']=='本機整段替換'
   assert page.evaluate('Object.keys(localStorage).some(k=>k.includes(":backup:"))')
   page.reload();page.wait_for_load_state('networkidle');expect(page.get_by_role('dialog')).to_have_count(0)
   notes=page.get_by_label('本題筆記' if source=='owned' else '我的私人筆記' if source=='saved' else '我的共用筆記')
   cloud.update(notes='最後保留雲端',notesSeq=cloud['notesSeq']+1);notes.fill('捨棄這份本機')
   dialog=page.get_by_role('dialog');expect(dialog).to_be_visible(timeout=6000)
   dialog.get_by_role('button',name='保留雲端版本',exact=True).click();expect(dialog).to_have_count(0)
   expect(notes).to_have_value('最後保留雲端')
   assert page.evaluate('Object.keys(localStorage).filter(k=>/^rdv:(owned-work|work):v1:/.test(k)&&!k.includes(":backup:")).length')==0
   notes.fill('雲端版本之後的新筆記');page.wait_for_timeout(1300);assert cloud['notes']=='雲端版本之後的新筆記'
   assert not errors,errors
   print(f'PASS {width}px {source}: auto ink/notes, undo/redo, caret, automatic dialog, raced cloud, both choices + reload')
   context.close()
 # Several restored conflicts must not stack modals or trap focus in the wrong one.
 context=browser.new_context(viewport={'width':1280,'height':1000},service_workers='block')
 queue_items={ident:{'id':ident,'user_id':USER['id'],'source':'原題 '+ident,'image_url':'fixture',
  'draw_data':None,'draw_seq':0,'notes_seq':1,'typed_notes':'雲端 '+ident,'status':'unsolved','review_count':0,'keywords':'[]'} for ident in ['queue1','queue2']}
 def queue_fixture(route):
  path=urlparse(route.request.url).path
  if path.endswith('/image'): return route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100"></svg>')
  result={'items':[],'collections':[],'keys':[],'memberships':{}}
  if path=='/api/auth/me': result={'user':USER}
  elif path=='/api/taxonomy': result={'tree':[],'customNodes':[],'counts':{}}
  elif path=='/api/search': result={'items':[{'id':ident,'origin':'owned','title':item['source'],'problem':item} for ident,item in queue_items.items()],'next_offset':None,'scope':'mine'}
  elif path.startswith('/api/problems/'): result={'item':queue_items[path.rsplit('/',1)[-1]]}
  route.fulfill(json=result)
 context.route('**/api/**',queue_fixture)
 context.add_init_script("""for(const id of ['queue1','queue2'])localStorage.setItem('rdv:owned-work:v1:merge-user:'+id,
  JSON.stringify({notes:'本機 '+id,inkSeq:0,notesSeq:0,blocked:true}));""")
 page=context.new_page();page.goto('http://127.0.0.1:4181/study?source=owned');page.wait_for_load_state('networkidle')
 dialog=page.get_by_role('dialog');expect(dialog).to_have_count(1,timeout=6000)
 first='queue1' if '本機 queue1' in dialog.inner_text() else 'queue2'
 expect(dialog.get_by_text('本機 '+first,exact=True)).to_be_visible()
 dialog.get_by_role('button',name='關閉對話框').click()
 expect(dialog).to_have_count(1);other='queue2' if first=='queue1' else 'queue1'
 expect(dialog.get_by_text('本機 '+other,exact=True)).to_be_visible()
 dialog.get_by_role('button',name='關閉對話框').click();expect(dialog).to_have_count(0)
 assert page.evaluate('Object.keys(localStorage).filter(k=>k.includes("queue")&&!k.includes(":backup:")).length')==2
 print('PASS multiple restored conflicts: one modal at a time; dismissal keeps both drafts')
 context.close();browser.close()
