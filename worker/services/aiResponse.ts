import type { Context } from 'hono';
import { stream } from 'hono/streaming';
/** Whitespace keeps JSON valid while the client remains connected to a longer model request. */
export function aiResponse<T>(c: Context, action: () => Promise<T>) {
  c.header('Content-Type', 'application/json; charset=UTF-8'); c.header('Cache-Control', 'no-store');
  return stream(c, async output => {
    await output.write('\n');
    const heartbeat = setInterval(() => { void output.write('\n').catch(() => {}); }, 10000);
    try { await output.write(JSON.stringify({ ok: true, data: await action() })); }
    catch (error) {
      const expected = error instanceof Error && 'code' in error;
      await output.write(JSON.stringify({ ok: false, error: { code: expected ? error.code : 'AI_UNAVAILABLE', message: expected ? error.message : '處理未完成，請稍後重試' } }));
    } finally { clearInterval(heartbeat); }
  });
}
