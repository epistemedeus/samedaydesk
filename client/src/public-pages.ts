import { lazy, type ComponentType } from "react";

// These routes have the same anonymous initial state in the browser and build.
// Never add an account, receipt capability, authenticated or user-data route here.
type PageLoader = () => Promise<{ default: ComponentType }>;
const definitions: ReadonlyArray<readonly [string, string, PageLoader]> = [
  ["/", "src/pages/Landing.tsx", () => import("./pages/Landing")],
  ["/tools/ai-readiness", "src/pages/AiReadiness.tsx", () => import("./pages/AiReadiness")],
  ["/x402", "src/pages/Mcp.tsx", () => import("./pages/Mcp")],
  ["/x402/seller-conformance", "src/pages/SellerConformance.tsx", () => import("./pages/SellerConformance")],
  ["/x402/verified", "src/pages/VerifiedRoutes.tsx", () => import("./pages/VerifiedRoutes")],
  ["/for-agents", "src/pages/ForAgents.tsx", () => import("./pages/ForAgents")],
  ["/for-agents/record-repeat", "src/pages/RecordRepeat.tsx", () => import("./pages/RecordRepeat")],
  ["/for-agents/distribution-repair", "src/pages/DistributionRepair.tsx", () => import("./pages/DistributionRepair")],
  ["/for-agents/consumer-repeat", "src/pages/ConsumerRepeat.tsx", () => import("./pages/ConsumerRepeat")],
  ["/for-agents/useful-jobs", "src/pages/UsefulJobs.tsx", () => import("./pages/UsefulJobs")],
  ["/terms", "src/pages/Legal.tsx", () => import("./pages/Legal").then((m) => ({ default: m.Terms }))],
  ["/privacy", "src/pages/Legal.tsx", () => import("./pages/Legal").then((m) => ({ default: m.Privacy }))],
];

export const publicPages = definitions.map(([path, entry, load]) => ({ path, entry, load, page: lazy(load) }));

export type InitialPublicPage = { path: string; Page: ComponentType };

export async function initialPublicPage(path: string): Promise<InitialPublicPage | undefined> {
  const route = publicPages.find((item) => item.path === path);
  return route && { path, Page: (await route.load()).default };
}
