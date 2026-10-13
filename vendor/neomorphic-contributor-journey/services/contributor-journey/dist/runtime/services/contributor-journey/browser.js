import { AccountPreviewClient } from '../../src/lib/contribute/account/client.js';
/** Private same-origin operator desk. Authority and all durable state stay in the received services. */
export function initializeInstalledPreview(document) {
    const root = document.querySelector('[data-installed-journey]');
    if (!root || root.dataset.api !== '/api/neomorphic-contributor-journey')
        return;
    const api = root.dataset.api, accountClient = new AccountPreviewClient(api + '/v1/account');
    const el = (name) => root.querySelector(`[data-${name}]`);
    const form = (name) => new FormData(el(name));
    const pending = new Map();
    let csrf = '', account = null, task = null, claim = null, revision = 0, review = null, workId = '', profileVersion = 0, showcase = null, post = null, selection = null, sharePreview = null, share = null;
    const say = (message) => { el('journey-status').textContent = message; };
    const request = async (route, body, method = body === undefined ? 'GET' : 'POST') => {
        let key = '';
        if (body !== undefined) {
            const serialized = JSON.stringify(body), prior = pending.get(method + route);
            if (prior && prior.body !== serialized)
                throw new Error('Read status before changing a request whose result is unknown.');
            key = prior?.key ?? body.idempotencyKey ?? body.operationKey ?? crypto.randomUUID();
            pending.set(method + route, { key, body: serialized });
        }
        const response = await fetch(api + '/v1' + route, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
            headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CJ-CSRF': csrf } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        csrf = response.headers.get('x-cj-csrf') ?? csrf;
        const value = await response.json();
        if (!response.ok || value.ok === false) {
            if (response.status < 500)
                pending.delete(method + route);
            throw new Error(value.error?.code ?? value.code ?? 'The request could not be confirmed.');
        }
        pending.delete(method + route);
        return value.value ?? value;
    };
    let busy = false;
    const act = async (fn) => { if (busy)
        return; busy = true; try {
        await fn();
    }
    catch (error) {
        say(error instanceof Error ? error.message : 'The result is unknown. Refresh the desk to read status.');
    }
    finally {
        busy = false;
    } };
    const on = (name, fn) => el(name).addEventListener('click', () => void act(fn));
    const submit = (name, fn) => el(name).addEventListener('submit', event => { event.preventDefault(); void act(fn); });
    const reviewRoute = () => '/review?taskId=' + encodeURIComponent(claim.taskId) + '&reservationId=' + encodeURIComponent(claim.reservationId);
    const refreshReview = async () => {
        if (!claim)
            return;
        review = await request(reviewRoute());
        el('review').textContent = `${review.viewer}: ${review.state}. Next: ${review.nextAction}. Fulfillment: ${review.fulfillment.state}.`;
        if (review.handoff) {
            const work = await request('/work?taskId=' + encodeURIComponent(claim.taskId) + '&reservationId=' + encodeURIComponent(claim.reservationId));
            workId = work.workId;
        }
    };
    const chooseClaim = async (value) => {
        claim = value;
        const read = await request('/submission/' + claim.reservationId);
        revision = read.draft?.revision ?? 0;
        el('draft-form').querySelector('textarea').value = read.draft?.evidence.body ?? '';
        el('delivery').textContent = `${read.status.deliveryState}. Next: ${read.status.nextAction}.`;
        const target = el('review-target');
        target.elements.namedItem('taskId').value = claim.taskId;
        target.elements.namedItem('reservationId').value = claim.reservationId;
        if (read.status.submission)
            await refreshReview();
    };
    const refresh = async () => {
        account = await accountClient.session();
        if (!account) {
            el('account-current').textContent = 'Create an account or sign in to continue.';
            say('Account required.');
            return;
        }
        await request('/account/session');
        el('account-current').textContent = 'Your private account ID: ' + account.accountId;
        const profile = await request('/profile');
        profileVersion = profile.publication?.consentVersion ?? 0;
        const tasks = await request('/claims');
        el('tasks').replaceChildren();
        for (const value of tasks.tasks) {
            const li = document.createElement('li'), button = document.createElement('button');
            button.type = 'button';
            button.className = 'office-submit';
            button.textContent = value.title + ' · ' + value.availability;
            button.onclick = () => void act(async () => { task = value; el('accept-terms').checked = false; const exact = await request('/claims/terms?taskId=' + encodeURIComponent(task.taskId)); el('terms').textContent = JSON.stringify(exact.document, null, 2); });
            li.append(button);
            el('tasks').append(li);
        }
        const owned = await request('/claims/claims');
        el('claims').replaceChildren();
        for (const value of owned.claims) {
            const li = document.createElement('li'), button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Continue ' + value.taskId + ' · ' + value.status;
            button.onclick = () => void act(() => chooseClaim(value));
            li.append(button);
            el('claims').append(li);
        }
        say('Your desk is up to date.');
    };
    submit('account-form', async () => {
        const data = form('account-form'), action = String(data.get('action'));
        const input = action === 'signup' ? { password: String(data.get('password')) } : action === 'login' ? { accountId: String(data.get('accountId')), password: String(data.get('password')) } : { accountId: String(data.get('accountId')), recoveryCode: String(data.get('recoveryCode')), newPassword: String(data.get('password')) };
        const receipt = await accountClient.submit(action, input);
        el('recovery').hidden = !receipt.recoveryCode;
        el('recovery').textContent = receipt.recoveryCode ? 'Save privately: ' + receipt.account.accountId + ' / ' + receipt.recoveryCode : '';
        for (const input of root.querySelectorAll('input[type=password]'))
            input.value = '';
        await refresh();
    });
    on('account-readback', async () => { const receipt = await accountClient.readback(); el('recovery').hidden = !receipt.recoveryCode; el('recovery').textContent = receipt.recoveryCode ?? ''; await refresh(); });
    on('refresh', refresh);
    on('signout', async () => { await accountClient.logout(); csrf = ''; el('recovery').textContent = ''; claim = null; review = null; workId = ''; await refresh(); });
    on('claim', async () => {
        if (!task || !el('accept-terms').checked)
            throw new Error('Read and accept the exact terms first.');
        await request('/claims/binding', { roundKey: task.roundKey });
        const result = await request('/claims/claims', { taskId: task.taskId, termsId: task.termsId, termsVersion: task.termsVersion, acceptTerms: true });
        if (result.kind !== 'claimed') {
            say('No slot is reserved. You can choose another task.');
            return;
        }
        await chooseClaim(result.claim);
        say('Claim saved.');
    });
    submit('draft-form', async () => { if (!claim)
        throw new Error('Open your claim first.'); const saved = await request('/submission/' + claim.reservationId + '/draft', { reservationId: claim.reservationId, termsVersion: claim.termsVersion, expectedRevision: revision, evidence: { format: 'json', body: String(form('draft-form').get('evidence')), sourceReferences: [] } }); revision = saved.savedRevision; say('Draft saved.'); });
    on('deliver', async () => { if (!claim)
        throw new Error('Open your claim first.'); const result = await request('/submission/' + claim.reservationId + '/submit', { reservationId: claim.reservationId, expectedRevision: revision }); el('delivery').textContent = result.deliveryState; await refreshReview(); say('Delivery status read from the task record.'); });
    submit('review-target', async () => { const data = form('review-target'); claim = { taskId: String(data.get('taskId')), reservationId: String(data.get('reservationId')) }; await refreshReview(); say('Review opened.'); });
    const text = () => el('review-text').value;
    const operation = (route) => pending.get('POST' + route)?.key ?? crypto.randomUUID();
    const reviewCommand = async (action, extra) => { if (!review)
        throw new Error('Open the current review first.'); const result = await request('/review/' + action, { source: review.source, ...extra, idempotencyKey: operation('/review/' + action) }); review = result.view; await refreshReview(); say('Review status saved.'); };
    on('question', () => reviewCommand('clarification', { text: text() }));
    for (const response of ['reply', 'refuse'])
        on(response, () => reviewCommand('response', { text: text(), questionId: review?.clarification.question?.id, response }));
    on('pass', () => reviewCommand('verdict', { outcome: 'pass' }));
    on('accept', () => reviewCommand('decision', { decision: 'accept', verdictId: review?.verdict?.id }));
    on('reject', () => reviewCommand('decision', { decision: 'reject', reason: text() }));
    submit('profile-form', async () => { const data = form('profile-form'), result = await request('/profile', { expectedVersion: profileVersion, displayName: String(data.get('alias')), visibilityConsent: data.has('consent') }, 'PUT'); profileVersion = result.profile.consentVersion; say('Profile choice saved.'); });
    submit('summary-form', async () => { const data = form('summary-form'); await request('/review/summary', { workId, summary: String(data.get('summary')), evidenceDescription: String(data.get('evidence')) }); say('Requester summary approval saved.'); });
    on('showcase-read', async () => { showcase = await request('/showcase/mine/' + workId); el('showcase-preview').textContent = showcase.candidate.displayName + ': ' + showcase.candidate.summary + ' / ' + showcase.candidate.evidenceDescription; el('showcase-consent').checked = false; });
    on('publish', async () => { if (!showcase || !el('showcase-consent').checked)
        throw new Error('Review this summary and choose whether to publish.'); await request('/showcase/mine/' + workId + '/consent', { expectedVersion: showcase.consent.version, summaryDigest: showcase.summaryDigest, consentVersion: showcase.consentVersion, publicationConsent: true, includePaidBadge: false }, 'PUT'); showcase = await request('/showcase/mine/' + workId); say('Summary visible in this private preview.'); });
    on('unpublish', async () => { const current = await request('/showcase/mine/' + workId + '/consent'); await request('/showcase/mine/' + workId + '/consent', { expectedVersion: current.version }, 'DELETE'); say('Summary withdrawn.'); });
    const refreshDiscussion = async () => { const page = await request('/discussion/tasks/' + encodeURIComponent(claim.taskId)); el('discussion').replaceChildren(); for (const value of page.items) {
        const li = document.createElement('li');
        li.textContent = value.kind === 'post' ? value.body : 'Post unavailable';
        el('discussion').append(li);
        if (value.kind === 'post')
            post = value;
    } };
    submit('discussion-form', async () => { if (!claim)
        throw new Error('Open a task first.'); const data = form('discussion-form'), pub = data.has('public'); await request('/discussion/tasks/' + encodeURIComponent(claim.taskId), { kind: 'post', body: String(data.get('body')), audience: pub ? 'public' : 'private', ...(pub ? { consent: { confirmed: true, version: 'discussion-public-v1' } } : {}) }); await refreshDiscussion(); say('Discussion post saved.'); });
    on('discussion-approve', async () => { await refreshDiscussion(); if (!post)
        throw new Error('No post is available.'); await request('/discussion/tasks/' + encodeURIComponent(claim.taskId), { kind: 'moderate', postId: post.postId, expectedVersion: post.version, decision: 'approve' }); await refreshDiscussion(); say('Post approved.'); });
    on('discussion-withdraw', async () => { await refreshDiscussion(); if (!post)
        throw new Error('No post is available.'); await request('/discussion/tasks/' + encodeURIComponent(claim.taskId), { kind: 'withdraw', postId: post.postId, expectedVersion: post.version }); await refreshDiscussion(); say('Post withdrawn.'); });
    on('share-preview', async () => { selection = { source: { kind: 'showcase', id: workId }, fields: ['summary'], nextAction: 'signup', expiresAt: new Date(Date.now() + 3600000).toISOString() }; sharePreview = await request('/referral/preview', selection); el('share-preview-copy').textContent = sharePreview.summary; el('share-consent').checked = false; });
    on('share-create', async () => { if (!sharePreview || !el('share-consent').checked)
        throw new Error('Review the preview and choose whether to share.'); share = await request('/referral/create', { selection, consent: { accepted: true, previewDigest: sharePreview.previewDigest }, operationKey: operation('/referral/create') }); const link = el('share-url'); link.href = share.public.url; link.textContent = link.href; link.hidden = false; say('Share link saved. Choose where to share it.'); });
    on('share-withdraw', async () => { if (!share)
        throw new Error('No share link is selected.'); await request('/referral/withdraw', { shareRef: share.shareRef, expectedRevision: share.revision, operationKey: operation('/referral/withdraw') }); el('share-url').hidden = true; say('Share link withdrawn.'); });
    void act(async () => { await refresh(); const ref = new URL(location.href).searchParams.get('ref'); if (ref && /^rf[a-f0-9]{48}$/.test(ref)) {
        const shared = await request('/referral/arrival/' + ref);
        el('share-preview-copy').textContent = shared.summary;
    } });
}
//# sourceMappingURL=browser.js.map