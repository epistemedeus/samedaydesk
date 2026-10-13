export class AccountClientError extends Error {
    unknownOutcome;
    constructor(message, unknownOutcome = false) {
        super(message);
        this.unknownOutcome = unknownOutcome;
    }
}
function opaque(bytes) {
    const data = crypto.getRandomValues(new Uint8Array(bytes));
    return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function parseAccount(raw) {
    if (!raw || typeof raw !== "object")
        throw new AccountClientError("The account response could not be verified.", true);
    const value = raw;
    const expected = ["accountId", "sessionId", "authTime", "expiresAt", "publicProfileId"];
    if (Object.keys(value).length !== expected.length || expected.some(key => typeof value[key] !== "string") ||
        !/^acc_[A-Za-z0-9_-]{16}$/.test(value.accountId) || !/^ses_[A-Za-z0-9_-]{16}$/.test(value.sessionId) ||
        !/^prf_[A-Za-z0-9_-]{16}$/.test(value.publicProfileId) ||
        !Number.isFinite(Date.parse(value.authTime)) || !Number.isFinite(Date.parse(value.expiresAt))) {
        throw new AccountClientError("The account response could not be verified.", true);
    }
    return value;
}
function parseReceipt(raw) {
    if (!raw || typeof raw !== "object")
        throw new AccountClientError("The account response could not be verified.", true);
    const value = raw;
    if (Object.keys(value).some(key => !["account", "recoveryCode", "sessionDelivery", "replayed"].includes(key)) ||
        value.sessionDelivery !== "cookie" || typeof value.replayed !== "boolean" ||
        (value.recoveryCode !== undefined && (typeof value.recoveryCode !== "string" || !/^acr_[A-Za-z0-9_-]{43}$/.test(value.recoveryCode)))) {
        throw new AccountClientError("The account response could not be verified.", true);
    }
    return { account: parseAccount(value.account), sessionDelivery: "cookie", replayed: value.replayed, ...(value.recoveryCode ? { recoveryCode: value.recoveryCode } : {}) };
}
/** Browser session credentials stay in the server's HttpOnly cookie. Pending proof stays in memory. */
export class AccountPreviewClient {
    basePath;
    fetcher;
    pending;
    constructor(basePath, fetcher = fetch) {
        this.basePath = basePath;
        this.fetcher = fetcher;
        if (!/^\/[A-Za-z0-9_/-]+$/.test(basePath) || basePath.startsWith("//") || basePath.includes(".."))
            throw new AccountClientError("Account preview service is not connected.");
        this.basePath = basePath.replace(/\/$/, "");
    }
    get hasPendingOperation() { return Boolean(this.pending); }
    async request(path, input, pending) {
        try {
            // Window.fetch requires its native receiver semantics; invoking it as a client method fails in Chrome.
            const fetcher = this.fetcher;
            return await fetcher(`${this.basePath}/${path}`, {
                method: input === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
                headers: { "Content-Type": "application/json", ...(pending ? { "Idempotency-Key": pending.idempotencyKey, "X-Account-Operation-Proof": pending.proof } : {}) },
                ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(10000),
            });
        }
        catch {
            throw new AccountClientError("The result is unknown. Check the last request before starting another.", true);
        }
    }
    async checkedReceipt(response) {
        if (!response.ok) {
            const unknown = response.status >= 500 || response.status === 429;
            throw new AccountClientError(unknown ? "The result is unknown. Check the last request before starting another." : "Account details were refused. Check your account ID and credentials.", unknown);
        }
        try {
            return parseReceipt(await response.json());
        }
        catch (error) {
            if (error instanceof AccountClientError)
                throw error;
            throw new AccountClientError("The account response could not be verified.", true);
        }
    }
    readbackBody(pending) {
        return { operation: pending.operation, ...(pending.operation === "signup" ? {} : { accountId: pending.input.accountId }) };
    }
    async submit(operation, input) {
        if (!["signup", "login", "recover"].includes(operation))
            throw new AccountClientError("Account action was refused.");
        if (this.pending) {
            if (this.pending.operation !== operation || JSON.stringify(this.pending.input) !== JSON.stringify(input))
                throw new AccountClientError("Check the last request before changing account details.", true);
            const readback = await this.request("readback", this.readbackBody(this.pending), this.pending);
            if (readback.status !== 404) {
                try {
                    const receipt = await this.checkedReceipt(readback);
                    this.pending = undefined;
                    return receipt;
                }
                catch (error) {
                    if (error instanceof AccountClientError && !error.unknownOutcome)
                        this.pending = undefined;
                    throw error;
                }
            }
        }
        else
            this.pending = { operation, input: { ...input }, idempotencyKey: `browser_${opaque(16)}`, proof: opaque(32) };
        try {
            const receipt = await this.checkedReceipt(await this.request(operation, input, this.pending));
            this.pending = undefined;
            return receipt;
        }
        catch (error) {
            if (error instanceof AccountClientError && !error.unknownOutcome)
                this.pending = undefined;
            throw error;
        }
    }
    async readback() {
        if (!this.pending)
            throw new AccountClientError("There is no pending account request.");
        const response = await this.request("readback", this.readbackBody(this.pending), this.pending);
        if (response.status === 404)
            throw new AccountClientError("No saved result yet. Try the same form again.", true);
        try {
            const receipt = await this.checkedReceipt(response);
            this.pending = undefined;
            return receipt;
        }
        catch (error) {
            if (error instanceof AccountClientError && !error.unknownOutcome)
                this.pending = undefined;
            throw error;
        }
    }
    async session() {
        const response = await this.request("session");
        if (response.status === 401)
            return null;
        if (!response.ok)
            throw new AccountClientError("Your session could not be checked. Try signing in again.");
        try {
            const raw = await response.json();
            if (!raw || Object.keys(raw).length !== 1 || !("account" in raw))
                throw new Error("invalid");
            return parseAccount(raw.account);
        }
        catch {
            throw new AccountClientError("Your session could not be verified.");
        }
    }
    async logout(allSessions = false) {
        if (this.pending)
            throw new AccountClientError("Check the last request before signing out.", true);
        const response = await this.request(allSessions ? "logout-all" : "logout", {});
        if (!response.ok)
            throw new AccountClientError("Sign-out could not be confirmed. Check your session again.");
    }
}
export function initializeAccountPreview(document) {
    const root = document.querySelector("[data-account-preview]");
    if (!root || !root.dataset.accountApi)
        return;
    let client;
    try {
        client = new AccountPreviewClient(root.dataset.accountApi);
    }
    catch {
        return;
    }
    const status = root.querySelector("[data-account-status]");
    const panel = root.querySelector("[data-account-current]");
    const recovery = root.querySelector("[data-account-recovery]");
    const check = root.querySelector("[data-account-readback]");
    let busy = false;
    const say = (message) => { status.textContent = message; status.hidden = false; };
    const show = (account, code) => {
        panel.hidden = false;
        root.querySelector("[data-account-id]").textContent = account.accountId;
        recovery.hidden = !code;
        root.querySelector("[data-account-recovery-code]").textContent = code ?? "";
        for (const input of root.querySelectorAll('input[name="accountId"]'))
            input.value = account.accountId;
        for (const input of root.querySelectorAll('input[type="password"]'))
            input.value = "";
        say(code ? "Account ready. Save your account ID and recovery code privately." : "You are signed in.");
    };
    const action = async (fn) => {
        if (busy)
            return;
        busy = true;
        for (const button of root.querySelectorAll("button"))
            button.disabled = true;
        try {
            await fn();
        }
        catch (error) {
            say(error instanceof AccountClientError ? error.message : "The account request could not be completed.");
        }
        finally {
            busy = false;
            for (const button of root.querySelectorAll("button"))
                button.disabled = false;
            check.hidden = !client.hasPendingOperation;
        }
    };
    for (const form of root.querySelectorAll("form[data-account-action]")) {
        form.addEventListener("submit", event => {
            event.preventDefault();
            const operation = form.dataset.accountAction;
            const input = Object.fromEntries([...new FormData(form)].filter((entry) => typeof entry[1] === "string" && entry[1] !== ""));
            void action(async () => { const receipt = await client.submit(operation, input); show(receipt.account, receipt.recoveryCode); });
        });
        form.querySelector("fieldset").disabled = false;
    }
    check.addEventListener("click", () => void action(async () => { const receipt = await client.readback(); show(receipt.account, receipt.recoveryCode); }));
    root.querySelector("[data-account-logout]").addEventListener("click", () => void action(async () => { await client.logout(); panel.hidden = true; recovery.hidden = true; root.querySelector("[data-account-recovery-code]").textContent = ""; say("You are signed out."); }));
    root.querySelector("[data-account-logout-all]").addEventListener("click", () => void action(async () => { await client.logout(true); panel.hidden = true; recovery.hidden = true; root.querySelector("[data-account-recovery-code]").textContent = ""; say("All sessions are signed out."); }));
    void action(async () => { const account = await client.session(); if (account)
        show(account); });
}
//# sourceMappingURL=client.js.map