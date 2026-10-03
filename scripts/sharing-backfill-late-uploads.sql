-- Run after deploying the Worker that writes assets and asset_refs.
-- This catches items uploaded by the previous Worker between migration and deploy.
INSERT OR IGNORE INTO assets(id,storage_key)
SELECT DISTINCT image_url,image_url FROM items WHERE image_url IS NOT NULL AND image_url!='';

INSERT OR IGNORE INTO asset_refs(id,asset_id,item_id,role)
SELECT 'item:'||id,image_url,id,'source_image' FROM items WHERE image_url IS NOT NULL AND image_url!='';

SELECT COUNT(*) AS missing_source_links FROM items i
LEFT JOIN assets a ON a.id=i.image_url AND a.state='ready'
LEFT JOIN asset_refs ar ON ar.id='item:'||i.id AND ar.asset_id=i.image_url
 AND ar.item_id=i.id AND ar.role='source_image'
WHERE i.image_url IS NOT NULL AND i.image_url!='' AND (a.id IS NULL OR ar.id IS NULL);
