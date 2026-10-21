import { createWorkspaceEditLeaseProcessor } from "./docsera-runtime-workspace-edit-lease.ts";
const processor = createWorkspaceEditLeaseProcessor("end-previous-session");
export async function process(request: unknown, response: unknown) { return processor(request as never, response as never); }
