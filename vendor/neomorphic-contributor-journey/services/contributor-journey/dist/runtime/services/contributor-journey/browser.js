import { AccountPreviewClient } from '../../src/lib/contribute/account/client.js';
/** Preview only. Server reads own identity, authority and all durable work.
 * Unknown commands stay in this tab's existing in-memory journal, partitioned
 * by private account. No evidence, credential or recovery code enters storage.
 */
export function initializeInstalledPreview(document) {
    const root = document.querySelector('[data-installed-journey]');
    if (!root || root.dataset.api !== '/api/neomorphic-contributor-journey')
        return;
    const api = root.dataset.api, accountClient = new AccountPreviewClient(api + '/v1/account');
    const el = (name) => root.querySelector(`[data-${name}]`);
    const form = (name) => new FormData(el(name));
    const show = (name, visible) => { el(name).hidden = !visible; };
    const pending = new Map();
    let account = null, csrf = '', epoch = 0, controller = new AbortController(), expiry;
    let task = null, claim = null, revision = 0, review = null, workId = '', profileVersion = 0;
    let tasks = [], requesterTaskIds = [], authority = null, delivery = null;
    let showcase = null, post = null, selection = null, sharePreview = null, share = null, busy = false;
    const say = (message) => { el('journey-status').textContent = message; };
    const slot = (owner, method, route) => `${owner}\n${method}${route}`;
    const operation = (route) => account && pending.get(slot(account.accountId, 'POST', route))?.key || crypto.randomUUID();
    const isRequester = () => review?.viewer === 'requester' && authority?.taskId === review.source.taskId && authority.canModerate;
    const isContributor = () => review?.viewer === 'contributor' && claim?.accountId === account?.accountId;
    const render = () => {
        for (const panel of root.querySelectorAll('[data-private]'))
            panel.hidden = !account;
        el('account-entry').open = !account;
        el('account-entry-label').textContent = account ? 'Use another account or recover access' : 'Create an account, sign in or recover access';
        show('signout', !!account);
        show('account-readback', accountClient.hasPendingOperation);
        show('terms-panel', !!account && !!task);
        show('draft-panel', !!account && !!claim?.accountId);
        show('review-target', !!account && requesterTaskIds.length > 0);
        show('review-panel', !!account && !!review);
        const deciding = !!review && !review.decision, requester = !!isRequester();
        show('question', requester && !!review?.clarification.canRequest);
        show('pass', requester && deciding);
        show('accept', requester && deciding && review?.verdict?.outcome === 'pass');
        show('reject', requester && deciding);
        show('reply', !!isContributor() && !!review?.clarification.canRespond);
        show('refuse', !!isContributor() && !!review?.clarification.canRespond);
        show('review-text-field', requester && deciding || !!isContributor() && !!review?.clarification.canRespond);
        show('summary-form', requester && !!workId);
        const mine = !!account && !!isContributor() && !!workId;
        show('showcase-panel', mine);
        show('publish', mine && !!showcase);
        show('showcase-consent-field', mine && !!showcase);
        show('unpublish', mine && showcase?.consent?.visibility === 'visible');
        show('sharing-panel', mine);
        show('share-consent-field', mine && !!sharePreview);
        show('share-create', mine && !!sharePreview);
        show('share-withdraw', mine && !!share);
        show('discussion-panel', !!account && !!authority?.canRead);
        show('discussion-form', !!account && !!authority?.canPost);
        show('discussion-public-field', !!account && !!authority?.publicDiscussionEnabled);
        show('discussion-approve', !!account && !!authority?.canModerate && post?.audience === 'public' && post.moderation === 'pending');
        show('discussion-withdraw', !!account && !!post?.isAuthor);
        const editing = !!claim?.accountId && delivery?.editable === true && claim.canStart;
        show('draft-save', editing);
        show('deliver', editing);
        el('draft-form').querySelector('textarea').readOnly = !editing;
        const list = el('pending');
        list.replaceChildren();
        for (const item of pending.values())
            if (item.accountId === account?.accountId) {
                const li = document.createElement('li'), button = document.createElement('button');
                button.type = 'button';
                button.className = 'office-submit';
                button.dataset.pendingRetry = '';
                button.textContent = 'Check saved ' + (item.route.startsWith('/submission/') ? 'delivery request' : item.route.startsWith('/profile') ? 'profile request' : 'task request');
                button.addEventListener('click', () => void act(async () => {
                    await request(item.route, JSON.parse(item.body), item.method, item.key);
                    await refresh();
                    say('Saved request reconciled.');
                }));
                li.append(button);
                list.append(li);
            }
        show('pending-panel', !!account && list.children.length > 0);
    };
    // Clear the actual fields and projections, including hidden ones. Never erase
    // canonical server records or the original owner's unknown operation journal.
    const clearPrivate = () => {
        epoch++;
        controller.abort();
        controller = new AbortController();
        clearTimeout(expiry);
        account = null;
        csrf = '';
        task = null;
        claim = null;
        review = null;
        workId = '';
        revision = 0;
        profileVersion = 0;
        tasks = [];
        requesterTaskIds = [];
        authority = null;
        delivery = null;
        showcase = null;
        post = null;
        selection = null;
        sharePreview = null;
        share = null;
        for (const name of ['terms', 'tasks', 'claims', 'requester-tasks', 'selected-task', 'delivery', 'review', 'review-question', 'showcase-preview', 'discussion', 'share-preview-copy', 'recovery', 'pending'])
            el(name).replaceChildren();
        for (const name of ['draft-form', 'review-target', 'profile-form', 'summary-form', 'discussion-form'])
            el(name).reset();
        for (const input of root.querySelectorAll('[data-account-form] input'))
            input.value = '';
        for (const name of ['accept-terms', 'showcase-consent', 'share-consent'])
            el(name).checked = false;
        el('review-text').value = '';
        const link = el('share-url');
        link.textContent = '';
        link.removeAttribute('href');
        link.hidden = true;
        show('recovery', false);
        el('account-current').textContent = 'Create an account or sign in to continue.';
        render();
    };
    const fetchSession = async () => {
        const response = await fetch(api + '/v1/account/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (response.status === 401)
            return null;
        if (!response.ok)
            throw new Error('Your session could not be checked. Refresh or sign in again.');
        const body = await response.json();
        if (!body.account || !response.headers.get('x-cj-csrf'))
            throw new Error('Your session could not be confirmed.');
        return { account: body.account, csrf: response.headers.get('x-cj-csrf') };
    };
    const guard = async (owner, version) => {
        let session;
        try {
            session = await fetchSession();
        }
        catch (error) {
            clearPrivate();
            throw error;
        }
        if (epoch !== version)
            throw new Error('The account changed. Refresh the desk.');
        if (!session || session.account.accountId !== owner) {
            clearPrivate();
            throw new Error('Account required.');
        }
        csrf = session.csrf;
    };
    const request = async (route, body, method = body === undefined ? 'GET' : 'POST', exactKey, anonymous = false) => {
        const owner = account?.accountId, version = epoch;
        if (!anonymous) {
            if (!owner)
                throw new Error('Account required.');
            await guard(owner, version);
        }
        const serialized = body === undefined ? undefined : JSON.stringify(body), id = owner ? slot(owner, method, route) : '';
        let key = '';
        if (serialized !== undefined) {
            if (!owner)
                throw new Error('Account required.');
            const prior = pending.get(id);
            if (prior && prior.body !== serialized)
                throw new Error('Check the saved request before changing its details.');
            key = prior?.key ?? exactKey ?? body.idempotencyKey ?? body.operationKey ?? crypto.randomUUID();
            pending.set(id, { accountId: owner, route, method, key, body: serialized });
            render();
        }
        const sentCsrf = csrf;
        const response = await fetch(api + '/v1' + route, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
            headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CJ-CSRF': csrf } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(serialized === undefined ? {} : { body: serialized }) });
        if (epoch !== version || !anonymous && account?.accountId !== owner)
            throw new Error('The account changed. Refresh the desk.');
        if (response.status === 401 || !anonymous && response.headers.get('x-cj-csrf') !== sentCsrf) {
            clearPrivate();
            throw new Error('Account required.');
        }
        let value;
        try {
            value = await response.json();
        }
        catch {
            if (response.ok)
                throw new Error('The result is unknown. Check the saved request.');
            value = {};
        }
        if (!response.ok || value.ok === false) {
            if (response.status < 500 && response.status !== 429)
                pending.delete(id);
            throw new Error(value.error?.code ?? value.code ?? 'The request could not be confirmed.');
        }
        // Fence cookie changes in another tab as well as this desk's transitions.
        if (!anonymous)
            await guard(owner, version);
        if (serialized !== undefined)
            pending.delete(id);
        render();
        return value.value ?? value;
    };
    const act = async (fn) => {
        if (busy)
            return;
        busy = true;
        root.dataset.busy = 'true';
        try {
            await fn();
        }
        catch (error) {
            say(error instanceof Error ? error.message : 'The result is unknown. Check your saved request.');
        }
        finally {
            busy = false;
            root.dataset.busy = 'false';
            render();
        }
    };
    const on = (name, fn) => el(name).addEventListener('click', () => void act(fn));
    const submit = (name, fn) => el(name).addEventListener('submit', event => { event.preventDefault(); void act(fn); });
    const selectedTitle = (id) => tasks.find(t => t.taskId === id)?.title ?? 'Selected work';
    const readAuthority = async (taskId) => { authority = null; render(); const desk = await request('/desk?taskId=' + encodeURIComponent(taskId)); authority = desk.task; };
    const refreshDiscussion = async () => {
        post = null;
        el('discussion').replaceChildren();
        render();
        if (!authority?.canRead)
            return;
        const page = await request('/discussion/tasks/' + encodeURIComponent(authority.taskId));
        for (const value of page.items) {
            const li = document.createElement('li');
            li.textContent = value.kind === 'post' ? value.body : 'Post unavailable';
            if (value.kind === 'post' && (value.isAuthor || authority.canModerate)) {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = 'Select post';
                button.className = 'office-submit';
                button.onclick = () => { post = value; render(); };
                li.append(button);
                if (!post || authority.canModerate && value.moderation === 'pending')
                    post = value;
            }
            el('discussion').append(li);
        }
        render();
    };
    const refreshReview = async () => {
        review = null;
        workId = '';
        showcase = null;
        sharePreview = null;
        share = null;
        el('review').textContent = '';
        render();
        if (!claim)
            return;
        const target = '?taskId=' + encodeURIComponent(claim.taskId) + '&reservationId=' + encodeURIComponent(claim.reservationId);
        await readAuthority(claim.taskId);
        const view = await request('/review' + target);
        if (view.source.taskId !== claim.taskId || view.source.reservationId !== claim.reservationId)
            throw new Error('The selected work could not be confirmed.');
        review = view;
        if (view.handoff)
            workId = (await request('/work' + target)).workId;
        el('review').textContent = `${view.viewer}: ${view.state}. Next: ${view.nextAction.replaceAll('_', ' ')}. Fulfillment: ${view.fulfillment.state.replaceAll('_', ' ')}.`;
        const question = el('review-question');
        question.textContent = view.clarification.question?.text ?? '';
        await refreshDiscussion();
        render();
    };
    const chooseClaim = async (value) => {
        task = null;
        claim = null;
        review = null;
        authority = null;
        delivery = null;
        workId = '';
        showcase = null;
        share = null;
        sharePreview = null;
        post = null;
        render();
        if (value.accountId !== account?.accountId)
            throw new Error('Open your own work from the desk.');
        const read = await request('/submission/' + value.reservationId);
        claim = value;
        revision = read.draft?.revision ?? 0;
        delivery = read.status;
        el('draft-form').querySelector('textarea').value = read.draft?.evidence.body ?? '';
        el('selected-task').textContent = selectedTitle(value.taskId);
        el('delivery').textContent = `${read.status.deliveryState}. Next: ${read.status.nextAction.replaceAll('_', ' ')}.`;
        if (read.status.submission)
            await refreshReview();
        else {
            await readAuthority(value.taskId);
            await refreshDiscussion();
        }
        render();
    };
    const refresh = async () => {
        clearPrivate();
        const version = epoch;
        try {
            const verified = await accountClient.session();
            if (epoch !== version)
                return;
            if (!verified) {
                say('Account required.');
                return;
            }
            const session = await fetchSession();
            if (epoch !== version)
                return;
            if (!session || session.account.accountId !== verified.accountId || session.account.sessionId !== verified.sessionId)
                throw new Error('Your account changed. Sign in or refresh.');
            account = verified;
            csrf = session.csrf;
            expiry = setTimeout(() => { clearPrivate(); say('Account required.'); }, Math.max(0, Date.parse(verified.expiresAt) - Date.now()));
            el('account-current').textContent = 'Your private account ID: ' + account.accountId;
            const profile = await request('/profile');
            profileVersion = profile.publication?.consentVersion ?? 0;
            const profileForm = el('profile-form');
            profileForm.elements.namedItem('alias').value = profile.publication?.displayName ?? '';
            profileForm.elements.namedItem('consent').checked = profile.publication?.visible ?? false;
            tasks = (await request('/claims')).tasks;
            requesterTaskIds = (await request('/desk')).requesterTaskIds;
            for (const value of tasks) {
                const li = document.createElement('li'), button = document.createElement('button');
                button.type = 'button';
                button.className = 'office-submit';
                button.textContent = value.title + ' · ' + value.availability;
                button.onclick = () => void act(async () => { task = null; show('terms-panel', false); const exact = await request('/claims/terms?taskId=' + encodeURIComponent(value.taskId)); task = value; el('accept-terms').checked = false; el('terms').textContent = JSON.stringify(exact.document, null, 2); render(); });
                li.append(button);
                el('tasks').append(li);
            }
            const owned = await request('/claims/claims');
            for (const value of owned.claims) {
                const li = document.createElement('li'), button = document.createElement('button');
                button.type = 'button';
                button.className = 'office-submit';
                button.textContent = selectedTitle(value.taskId) + ' · ' + value.status + ' · ' + value.nextAction.replaceAll('_', ' ');
                button.onclick = () => void act(() => chooseClaim(value));
                li.append(button);
                el('claims').append(li);
            }
            if (!owned.claims.length)
                el('claims').textContent = 'Your claimed tasks will appear here.';
            for (const id of requesterTaskIds) {
                const li = document.createElement('li'), button = document.createElement('button');
                button.type = 'button';
                button.className = 'office-submit';
                button.textContent = 'Review ' + selectedTitle(id);
                button.onclick = () => { el('review-target').elements.namedItem('taskId').value = id; };
                li.append(button);
                el('requester-tasks').append(li);
            }
            render();
            say('Your desk is up to date.');
        }
        catch (error) {
            clearPrivate();
            throw error;
        }
    };
    const accountFields = () => {
        const action = el('account-form').elements.namedItem('action').value;
        for (const field of root.querySelectorAll('[data-account-for]')) {
            field.hidden = !field.dataset.accountFor.split(' ').includes(action);
            for (const input of field.querySelectorAll('input'))
                input.disabled = field.hidden;
        }
        const password = el('account-form').elements.namedItem('password');
        password.autocomplete = action === 'login' ? 'current-password' : 'new-password';
        el('account-submit').textContent = action === 'signup' ? 'Create account' : action === 'login' ? 'Sign in' : 'Recover account';
    };
    el('account-form').querySelector('select').addEventListener('change', accountFields);
    accountFields();
    const finishAccount = async (receipt) => {
        for (const input of root.querySelectorAll('[data-account-form] input'))
            input.value = '';
        await refresh();
        if (account?.accountId === receipt.account.accountId && receipt.recoveryCode) {
            el('recovery').textContent = 'Save privately: ' + receipt.account.accountId + ' / ' + receipt.recoveryCode;
            show('recovery', true);
        }
    };
    submit('account-form', async () => {
        const data = form('account-form'), action = String(data.get('action'));
        const input = action === 'signup' ? { password: String(data.get('password')) } : action === 'login' ? { accountId: String(data.get('accountId')), password: String(data.get('password')) } : { accountId: String(data.get('accountId')), recoveryCode: String(data.get('recoveryCode')), newPassword: String(data.get('password')) };
        if (action === 'signup')
            for (const name of ['displayName', 'contactEmail'])
                if (String(data.get(name) ?? '').trim())
                    input[name] = String(data.get(name));
        clearPrivate();
        await finishAccount(await accountClient.submit(action, input));
    });
    on('account-readback', async () => { clearPrivate(); await finishAccount(await accountClient.readback()); });
    on('refresh', refresh);
    on('signout', async () => { clearPrivate(); for (const input of root.querySelectorAll('[data-account-form] input'))
        input.value = ''; await accountClient.logout(); await refresh(); });
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
    submit('draft-form', async () => {
        if (!claim?.accountId)
            throw new Error('Open your own claim first.');
        const saved = await request('/submission/' + claim.reservationId + '/draft', { reservationId: claim.reservationId, termsVersion: claim.termsVersion, expectedRevision: revision, evidence: { format: 'json', body: String(form('draft-form').get('evidence')), sourceReferences: [] } });
        revision = saved.savedRevision;
        say('Draft saved.');
    });
    on('deliver', async () => { if (!claim?.accountId)
        throw new Error('Open your own claim first.'); await request('/submission/' + claim.reservationId + '/submit', { reservationId: claim.reservationId, expectedRevision: revision }); await chooseClaim(claim); say('Delivery status read from the task record.'); });
    submit('review-target', async () => {
        const data = form('review-target'), taskId = String(data.get('taskId'));
        if (!requesterTaskIds.includes(taskId))
            throw new Error('Choose one of your requester tasks.');
        claim = { taskId, reservationId: String(data.get('reservationId')) };
        el('draft-form').querySelector('textarea').value = '';
        el('delivery').textContent = '';
        await refreshReview();
        say('Review opened.');
    });
    const reviewCommand = async (action, extra) => { if (!review)
        throw new Error('Open the current review first.'); await request('/review/' + action, { source: review.source, ...extra, idempotencyKey: operation('/review/' + action) }); await refreshReview(); say('Review status saved.'); };
    const text = () => el('review-text').value;
    on('question', () => reviewCommand('clarification', { text: text() }));
    for (const response of ['reply', 'refuse'])
        on(response, () => reviewCommand('response', { text: text(), questionId: review?.clarification.question?.id, response }));
    on('pass', () => reviewCommand('verdict', { outcome: 'pass' }));
    on('accept', () => reviewCommand('decision', { decision: 'accept', verdictId: review?.verdict?.id }));
    on('reject', () => reviewCommand('decision', { decision: 'reject', reason: text() }));
    submit('profile-form', async () => { const data = form('profile-form'), result = await request('/profile', { expectedVersion: profileVersion, displayName: String(data.get('alias')), visibilityConsent: data.has('consent') }, 'PUT'); profileVersion = result.profile.consentVersion; say('Profile choice saved.'); });
    submit('summary-form', async () => { await request('/review/summary', { workId, summary: String(form('summary-form').get('summary')), evidenceDescription: String(form('summary-form').get('evidence')) }); say('Requester summary approval saved.'); });
    on('showcase-read', async () => { showcase = await request('/showcase/mine/' + workId); el('showcase-preview').textContent = showcase.candidate.displayName + ': ' + showcase.candidate.summary + ' / ' + showcase.candidate.evidenceDescription; el('showcase-consent').checked = false; render(); });
    on('publish', async () => { if (!showcase || !el('showcase-consent').checked)
        throw new Error('Review this summary and choose whether to publish.'); await request('/showcase/mine/' + workId + '/consent', { expectedVersion: showcase.consent.version, summaryDigest: showcase.summaryDigest, consentVersion: showcase.consentVersion, publicationConsent: true, includePaidBadge: false }, 'PUT'); showcase = await request('/showcase/mine/' + workId); say('Summary visible in this private preview.'); });
    on('unpublish', async () => { const current = await request('/showcase/mine/' + workId + '/consent'); await request('/showcase/mine/' + workId + '/consent', { expectedVersion: current.version }, 'DELETE'); showcase = null; el('showcase-preview').textContent = ''; say('Summary withdrawn.'); });
    submit('discussion-form', async () => { if (!authority?.canPost)
        throw new Error('Open your task first.'); const data = form('discussion-form'), pub = data.has('public'); await request('/discussion/tasks/' + encodeURIComponent(authority.taskId), { kind: 'post', body: String(data.get('body')), audience: pub ? 'public' : 'private', ...(pub ? { consent: { confirmed: true, version: 'discussion-public-v1' } } : {}) }); el('discussion-form').reset(); await refreshDiscussion(); say('Discussion post saved.'); });
    on('discussion-approve', async () => { if (!authority?.canModerate || !post)
        throw new Error('Select a post on your requester task.'); await request('/discussion/tasks/' + encodeURIComponent(authority.taskId), { kind: 'moderate', postId: post.postId, expectedVersion: post.version, decision: 'approve' }); await refreshDiscussion(); say('Post approved.'); });
    on('discussion-withdraw', async () => { if (!authority || !post?.isAuthor)
        throw new Error('Select your own post first.'); await request('/discussion/tasks/' + encodeURIComponent(authority.taskId), { kind: 'withdraw', postId: post.postId, expectedVersion: post.version }); await refreshDiscussion(); say('Post withdrawn.'); });
    on('share-preview', async () => { selection = { source: { kind: 'showcase', id: workId }, fields: ['summary'], nextAction: 'signup', expiresAt: new Date(Date.now() + 3600000).toISOString() }; sharePreview = await request('/referral/preview', selection); el('share-preview-copy').textContent = sharePreview.summary; el('share-consent').checked = false; render(); });
    on('share-create', async () => { if (!sharePreview || !el('share-consent').checked)
        throw new Error('Review the preview and choose whether to share.'); share = await request('/referral/create', { selection, consent: { accepted: true, previewDigest: sharePreview.previewDigest }, operationKey: operation('/referral/create') }); const link = el('share-url'); link.href = share.public.url; link.textContent = link.href; link.hidden = false; say('Share link saved. Choose where to share it.'); });
    on('share-withdraw', async () => { if (!share)
        throw new Error('No share link is selected.'); await request('/referral/withdraw', { shareRef: share.shareRef, expectedRevision: share.revision, operationKey: operation('/referral/withdraw') }); share = null; el('share-url').textContent = ''; el('share-url').removeAttribute('href'); el('share-url').hidden = true; say('Share link withdrawn.'); });
    // Hidden or expired sessions never retain a private projection awaiting refresh.
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        clearPrivate();
    else
        void act(refresh); });
    clearPrivate();
    void act(async () => {
        await refresh();
        const ref = new URL(location.href).searchParams.get('ref');
        if (ref && /^rf[a-f0-9]{48}$/.test(ref)) {
            const shared = await request('/referral/arrival/' + ref, undefined, 'GET', undefined, true);
            el('recipient-copy').textContent = shared.summary;
            show('recipient-panel', true);
        }
    });
}
//# sourceMappingURL=browser.js.map