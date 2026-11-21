/** Account owner supplies its durable, exclusive account -> round-scoped token ID
 * binding. This adapter reads existing tokens; it never issues or rotates one. */
export function createStoredOpportunityPrincipalResolver(kernel, lookupBinding) {
    return async (accountId, roundKey, provenance) => {
        const tokenId = await lookupBinding(accountId, roundKey);
        if (!tokenId)
            return null;
        return kernel.withOpportunityClient(async (client) => {
            const found = await client.query(`SELECT t.id, t.public_id, t.provenance, t.task_scope, t.expires_at, t.revoked_at
          FROM earned_work_contributor_tokens t JOIN opportunity_rounds r ON t.task_scope='opportunity:' || r.id
          WHERE t.id=$1 AND r.round_key=$2 AND r.provenance=$3`, [tokenId, roundKey, provenance]);
            const row = found.rows[0];
            if (!row || row.revoked_at || row.provenance !== provenance || (row.expires_at && row.expires_at <= kernel.now()))
                return null;
            return { id: row.id, publicId: row.public_id, payoutDestination: null, taskScope: row.task_scope,
                provenance: row.provenance, expiresAt: row.expires_at?.toISOString() ?? null };
        }, 'read');
    };
}
//# sourceMappingURL=account-principal.js.map