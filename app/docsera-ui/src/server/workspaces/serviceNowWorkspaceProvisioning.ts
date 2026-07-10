import { GlideDateTime, GlideRecord, gs } from "@servicenow/glide";
import {
  DOCSERA_WORKSPACE_TABLE,
  createWorkspaceDraft,
  type WorkspaceDraftInput,
  type WorkspaceGroup,
  type WorkspaceRecord,
  WORKSPACE_ROLE_NAMES
} from "./serverWorkspaceDomain.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";

const DOCSERA_WORKSPACE_PROVISION_REQUEST_TABLE = "x_82900_docsera_workspace_provision_request";
const PROVISION_STATUS_ROUTE_PATH =
  "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status";
type ProvisionRequestState = "requested" | "processing" | "succeeded" | "failed";

type ProvisionRequestRecord = {
  adminGroupSysId: string;
  editorGroupSysId: string;
  errorCode: string;
  errorMessage: string;
  requestId: string;
  state: ProvisionRequestState;
  workspaceSysId: string;
};

type WorkspaceProvisioningOutcome =
  | {
      kind: "failed";
      errorCode: string;
      errorMessage: string;
      requestId: string;
    }
  | {
      kind: "pending";
      requestId: string;
      state: "processing" | "requested";
    }
  | {
      adminGroup: WorkspaceGroup;
      editorGroup: WorkspaceGroup;
      kind: "succeeded";
      requestId: string;
      workspace: WorkspaceRecord;
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function readLastErrorMessage(record: {
  getLastErrorMessage?: () => string;
}): string {
  return cleanText(record.getLastErrorMessage?.());
}

function logProvisioningFailure(
  event: string,
  safeMessage: string,
  detail?: string
): void {
  const payload = {
    message: safeMessage,
    detail: cleanText(detail) || undefined
  };
  gs.error(`[Docsera workspace provisioning] ${event} ${JSON.stringify(payload)}`);
}

function mapGroupRecord(record: {
  getUniqueValue: () => string;
  getValue: (fieldName: string) => unknown;
}): WorkspaceGroup {
  return {
    sysId: cleanText(record.getUniqueValue()),
    name: cleanText(record.getValue("name")),
    description: cleanText(record.getValue("description")) || undefined
  };
}

function readRequestState(value: unknown): ProvisionRequestState {
  const state = cleanText(value);
  if (state === "processing" || state === "succeeded" || state === "failed") {
    return state;
  }

  return "requested";
}

function readProvisionRequestRecord(requestId: string): ProvisionRequestRecord | null {
  const sysId = cleanText(requestId);
  if (!sysId) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_PROVISION_REQUEST_TABLE);
  if (!record.get("sys_id", sysId)) {
    return null;
  }

  return {
    adminGroupSysId: cleanText(record.getValue("admin_group")),
    editorGroupSysId: cleanText(record.getValue("editor_group")),
    errorCode: cleanText(record.getValue("error_code")),
    errorMessage: cleanText(record.getValue("error_message")),
    requestId: sysId,
    state: readRequestState(record.getValue("state")),
    workspaceSysId: cleanText(record.getValue("workspace"))
  };
}

function loadWorkspaceBySysId(workspaceSysId: string): WorkspaceRecord | null {
  const sysId = cleanText(workspaceSysId);
  if (!sysId) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!record.get("sys_id", sysId)) {
    return null;
  }

  return mapWorkspaceRecord(record);
}

function loadGroupBySysId(groupSysId: string): WorkspaceGroup | null {
  const sysId = cleanText(groupSysId);
  if (!sysId) {
    return null;
  }

  const record = new GlideRecord("sys_user_group");
  if (!record.get("sys_id", sysId)) {
    return null;
  }

  return mapGroupRecord(record);
}

function listReservedWorkspaceSlugs(): string[] {
  const slugs: string[] = [];

  const workspaces = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  workspaces.query();
  while (workspaces.next()) {
    const slug = cleanText(workspaces.getValue("workspace_slug"));
    if (slug) {
      slugs.push(slug);
    }
  }

  const requests = new GlideRecord(DOCSERA_WORKSPACE_PROVISION_REQUEST_TABLE);
  requests.addQuery("state", "IN", "requested,processing");
  requests.query();
  while (requests.next()) {
    const slug = cleanText(requests.getValue("workspace_slug"));
    if (slug) {
      slugs.push(slug);
    }
  }

  return slugs;
}

function createProvisionRequest(input: WorkspaceDraftInput): string {
  const draft = createWorkspaceDraft(input, listReservedWorkspaceSlugs());
  const record = new GlideRecord(DOCSERA_WORKSPACE_PROVISION_REQUEST_TABLE);
  record.initialize();
  record.setValue("name", draft.name);
  record.setValue("workspace_slug", draft.slug);
  record.setValue("workspace_group_key", draft.workspaceGroupKey);
  record.setValue("admin_group_name", draft.adminGroupName);
  record.setValue("editor_group_name", draft.editorGroupName);
  record.setValue("short_description", draft.shortDescription ?? "");
  record.setValue("icon_type", draft.icon.type);
  record.setValue("icon_key", draft.icon.key);
  record.setValue("icon_label", draft.icon.label);
  record.setValue("icon_asset_path", draft.icon.assetPath ?? "");
  record.setValue("workspace_status", draft.status);
  record.setValue("toc_default_visible", draft.layout.tocVisibleByDefault);
  record.setValue("page_width", draft.layout.pageWidth);
  record.setValue("requested_by", draft.creatorUserSysId);
  record.setValue("state", "requested");
  record.setValue("error_code", "");
  record.setValue("error_message", "");

  const requestId = cleanText(record.insert());
  if (!requestId) {
    const safeMessage = "Failed to queue workspace provisioning.";
    logProvisioningFailure(
      `createProvisionRequest insert failed ${draft.slug}`,
      safeMessage,
      readLastErrorMessage(record)
    );
    throw new Error(safeMessage);
  }

  return requestId;
}

function buildStatusPath(requestId: string): string {
  return `${PROVISION_STATUS_ROUTE_PATH}?requestId=${encodeURIComponent(requestId)}`;
}

function readProvisionRequestImmediately(requestId: string): ProvisionRequestRecord | null {
  return readProvisionRequestRecord(requestId);
}

function buildSucceededOutcome(request: ProvisionRequestRecord): WorkspaceProvisioningOutcome {
  const workspace = loadWorkspaceBySysId(request.workspaceSysId);
  const adminGroup = loadGroupBySysId(request.adminGroupSysId);
  const editorGroup = loadGroupBySysId(request.editorGroupSysId);

  if (!workspace || !adminGroup || !editorGroup) {
    throw new Error("Workspace provisioning finished without complete result data.");
  }

  return {
    adminGroup,
    editorGroup,
    kind: "succeeded",
    requestId: request.requestId,
    workspace
  };
}

function buildOutcomeFromRequestRecord(
  request: ProvisionRequestRecord | null
): WorkspaceProvisioningOutcome {
  if (!request) {
    throw new Error("Workspace provisioning request could not be found.");
  }

  if (request.state === "succeeded") {
    return buildSucceededOutcome(request);
  }

  if (request.state === "failed") {
    return {
      kind: "failed",
      errorCode: request.errorCode || "provisioning_failed",
      errorMessage: request.errorMessage || "Workspace provisioning failed.",
      requestId: request.requestId
    };
  }

  return {
    kind: "pending",
    requestId: request.requestId,
    state: request.state
  };
}

export function createServiceNowWorkspaceProvisioningService() {
  return {
    async createWorkspace(input: WorkspaceDraftInput): Promise<WorkspaceProvisioningOutcome> {
      const creatorUserSysId = cleanText(gs.getUserID());
      if (!creatorUserSysId) {
        throw new Error("The current ServiceNow user could not be resolved.");
      }

      const requestId = createProvisionRequest({
        ...input,
        createdOn: new GlideDateTime().getDisplayValue(),
        creatorUserName: cleanText(gs.getUserName()),
        creatorUserSysId
      });

      return buildOutcomeFromRequestRecord(readProvisionRequestImmediately(requestId));
    },

    async getProvisioningStatus(requestId: string): Promise<WorkspaceProvisioningOutcome | null> {
      const request = readProvisionRequestRecord(requestId);
      if (!request) {
        return null;
      }

      return buildOutcomeFromRequestRecord(request);
    },

    listReservedWorkspaceSlugs,

    roleNames: WORKSPACE_ROLE_NAMES,

    statusPathFor(requestId: string): string {
      return buildStatusPath(requestId);
    }
  };
}
