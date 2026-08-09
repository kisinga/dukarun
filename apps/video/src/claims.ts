import claimsJson from '../projects/claims.json';
import { ClaimSchema, type Claim } from './schema';

export const claims: Claim[] = ClaimSchema.array().parse(claimsJson);

export const shippedClaimIds = new Set(
  claims.filter(claim => claim.status === 'shipped').map(claim => claim.id)
);

export function claimsFor(ids: readonly string[]): Claim[] {
  return ids.map(id => {
    const claim = claims.find(candidate => candidate.id === id);
    if (!claim) throw new Error(`Unknown claim: ${id}`);
    if (claim.status !== 'shipped') throw new Error(`Claim is not shipped: ${id}`);
    return claim;
  });
}
