-- Read-only D1 reference audit. A zero missing_* count is required before enabling sharing.
-- This checks database references; it does not prove the R2 bytes exist.
-- Keep metrics as independent statements to avoid compound SELECT limits.
SELECT 'missing_source_asset_or_ref' AS metric,COUNT(*) AS count FROM items i
LEFT JOIN assets a ON a.id=i.image_url AND a.state='ready'
LEFT JOIN asset_refs ar ON ar.item_id=i.id AND ar.asset_id=i.image_url AND ar.role='source_image'
WHERE i.image_url IS NOT NULL AND i.image_url!='' AND (a.id IS NULL OR ar.id IS NULL);

SELECT 'missing_current_snapshot_image_ref' AS metric,COUNT(*) AS count FROM saved_refs sr
JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id
LEFT JOIN asset_refs ar ON ar.snapshot_id=ss.id AND ar.asset_id=ss.image_asset_id AND ar.role='saved_image'
WHERE ar.id IS NULL;

SELECT 'missing_current_snapshot_draw_ref' AS metric,COUNT(*) AS count FROM saved_snapshot_layers ssl
JOIN saved_refs sr ON sr.current_snapshot_id=ssl.snapshot_id
LEFT JOIN asset_refs ar ON ar.snapshot_id=ssl.snapshot_id AND ar.asset_id=ssl.draw_asset_id AND ar.role='saved_draw'
WHERE ssl.draw_asset_id IS NOT NULL AND ar.id IS NULL;

SELECT 'missing_shared_draw_ref' AS metric,COUNT(*) AS count FROM shared_layers sl
LEFT JOIN asset_refs ar ON ar.layer_id=sl.id AND ar.asset_id=sl.draw_asset_id AND ar.role='shared_draw'
WHERE sl.state='active' AND sl.draw_asset_id IS NOT NULL AND ar.id IS NULL;

SELECT 'missing_personal_draw_ref' AS metric,COUNT(*) AS count FROM personal_workspaces pw
LEFT JOIN asset_refs ar ON ar.workspace_id=pw.id AND ar.asset_id=pw.draw_asset_id AND ar.role='personal_draw'
WHERE pw.draw_asset_id IS NOT NULL AND ar.id IS NULL;

SELECT 'unreferenced_ready_assets' AS metric,COUNT(*) AS count FROM assets a
WHERE a.state='ready' AND NOT EXISTS(SELECT 1 FROM asset_reference_inventory ar WHERE ar.asset_id=a.id);

SELECT 'nonready_referenced_assets' AS metric,COUNT(*) AS count FROM asset_reference_inventory ar
JOIN assets a ON a.id=ar.asset_id WHERE a.state!='ready';

SELECT 'missing_share_asset_ref' AS metric,COUNT(*) AS count FROM independent_shares s
LEFT JOIN share_asset_refs r ON r.token=s.token AND r.asset_id=s.image_asset_id
WHERE r.token IS NULL;
