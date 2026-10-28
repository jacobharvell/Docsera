export const friendlyUrlHostPageId = "de3b81474ba94c0a9296d12f9c6bd9cc";
export const legacyProofDescription = "Docsera friendly URL feasibility proof host; remove after Task 185 evaluation.";
export const productionHostDescription = "Docsera production friendly URL host for the installed scoped runtime.";

export function requireSuccessfulQueryRecords(response) {
  if (!response || typeof response !== "object" || response.ok !== true || !Array.isArray(response.records)) {
    throw new Error("UI Page collision query returned an unsuccessful or malformed SDK response.");
  }
  return response.records;
}

export function evaluateFriendlyUrlHostOwnership(pages) {
  if (pages.length === 0) return "empty";
  if (
    pages.length === 1 &&
    pages[0].sys_id === friendlyUrlHostPageId &&
    pages[0].name === "docsera" &&
    String(pages[0].direct) === "true" &&
    [legacyProofDescription, productionHostDescription].includes(pages[0].description)
  ) return "owned";
  throw new Error("Global docsera UI Page collision. Do not import the Docsera Global companion.");
}
