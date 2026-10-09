import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('guest search excludes account-owned and partially synced drafts', async () => {
    const bundle = await build({ entryPoints: ['src/services/OfflineSyncManager.ts'], bundle: true,
      format: 'esm', platform: 'browser', target: 'es2022', write: false,
      define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
    const { OfflineSyncManager } = await import('data:text/javascript;base64,' +
      Buffer.from(bundle.outputFiles[0].text).toString('base64'));
    const rows = [
      { id: 'guest', source: '向量練習', typed_notes: '本機筆記', tagResult: { keywords: [], ocr_text: '電流' } },
      { id: 'account', source: '向量練習', cloudOwnerId: 'another-user' },
      { id: 'legacy-synced', source: '向量練習', cloudId: 'cloud-id' },
    ];
    OfflineSyncManager.getOfflineProblems = async () => rows;
    OfflineSyncManager.getOfflineProblemsAsItems = async () => rows.map(row => ({ id: row.id }));
    assert.deepEqual((await OfflineSyncManager.searchOfflineProblems('向量')).map(row => row.id), ['guest']);
    assert.deepEqual((await OfflineSyncManager.searchOfflineProblems('電流')).map(row => row.id), ['guest']);
    assert.deepEqual((await OfflineSyncManager.searchOfflineProblems('本機筆記')).map(row => row.id), ['guest']);
    assert.deepEqual(await OfflineSyncManager.searchOfflineProblems('  '), []);
    assert.deepEqual(await OfflineSyncManager.searchOfflineProblems('不存在'), []);
});
