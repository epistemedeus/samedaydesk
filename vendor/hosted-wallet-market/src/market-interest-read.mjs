// Current proposal notes stay in the existing interests rows. This read creates
// no receipt, measure, quote, assent, allocation or funding operation.
export const INTEREST_PAGE_LIMIT = 50;
export const INTEREST_PAGE_DEFAULT = 20;
export const INTEREST_NOTE_BYTES = 4096; // Existing interest() producer limit.
const key = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(value);
const refuse = (code, http = 400) => { throw Object.assign(new Error(code), {code, codeName: code, http}); };
const cursorFor = (actor, taskId, after) => Buffer.from(JSON.stringify([actor.tenantId, actor.actorId, taskId, after])).toString('base64url');

/** Called only after the machine dispatcher enforces its session/origin/CSRF
 * policy. A cursor is a task/requester-bound position, never access authority.
 * Pages read current rows; they do not promise a snapshot across requests. */
export async function readMarketInterests(market, context, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(name => !['taskId', 'limit', 'cursor'].includes(name)) || !key(input.taskId)) refuse('body_refused');
  const limit = input.limit === undefined ? INTEREST_PAGE_DEFAULT : input.limit;
  const cursor = input.cursor === undefined ? '' : input.cursor;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > INTEREST_PAGE_LIMIT ||
      typeof cursor !== 'string' || cursor.length > 1024) refuse('page_refused');
  const actor = await market.actor(context);
  // Re-read actual membership, including its role; JSON never supplies an actor.
  if ((await market.member(actor.actorId, actor.tenantId)).role !== 'requester') refuse('requester_required', 403);
  let after = '';
  if (cursor) {
    try {
      const position = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!Array.isArray(position) || position.length !== 4 || position[0] !== actor.tenantId ||
          position[1] !== actor.actorId || position[2] !== input.taskId || !key(position[3]) ||
          cursorFor(actor, input.taskId, position[3]) !== cursor) refuse('page_refused');
      after = position[3];
    } catch { refuse('page_refused'); }
  }
  return market.store.transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const task = await market.store.task(actor.tenantId, input.taskId, client);
    market.owner(actor, task);
    // Bound bytes at the database boundary too: an oversized historical row
    // refuses rather than silently changing a proposal or loading arbitrary text.
    const rows = (await client.query(`SELECT actor_id,
      CASE WHEN octet_length(note) <= $4 THEN note ELSE NULL END AS note
      FROM ${market.store.table('interests')} WHERE tenant_id=$1 AND task_id=$2
      AND actor_id COLLATE "C" > $3 COLLATE "C"
      ORDER BY actor_id COLLATE "C" LIMIT $5`,
    [actor.tenantId, task.id, after, INTEREST_NOTE_BYTES, limit + 1])).rows;
    const page = rows.slice(0, limit);
    if (page.some(row => !key(row.actor_id) || typeof row.note !== 'string')) refuse('proposal_note_refused', 409);
    return {taskId: task.id, items: page.map(row => ({taskId: task.id, contributorId: row.actor_id, note: row.note})),
      nextCursor: rows.length > limit ? cursorFor(actor, task.id, page.at(-1).actor_id) : null};
  });
}
