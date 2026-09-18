import { useEffect, useMemo, useRef, useState, type MouseEvent, type MutableRefObject, type UIEvent } from "react";
import type {
  WorkspaceMemberAccessLevel,
  WorkspaceMemberCallerCapabilities,
  WorkspaceMemberRecord,
  WorkspaceMemberUserSearchRecord,
  WorkspaceViewRecord
} from "../../shared/types/docsera";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";

type ManageAccessState =
  | { status: "idle" | "loading" }
  | { status: "error"; errorMessage: string; retryable: boolean }
  | { status: "success"; callerCapabilities: WorkspaceMemberCallerCapabilities; members: WorkspaceMemberRecord[] };

type UserSearchState =
  | { status: "idle"; users: WorkspaceMemberUserSearchRecord[] }
  | { status: "loading"; users: WorkspaceMemberUserSearchRecord[] }
  | { status: "error"; errorMessage: string; users: WorkspaceMemberUserSearchRecord[] }
  | { status: "success"; users: WorkspaceMemberUserSearchRecord[] };

type StagedMember = WorkspaceMemberUserSearchRecord & {
  accessLevel: WorkspaceMemberAccessLevel;
  errorMessage?: string;
};

type WorkspaceManageAccessOverlayProps = {
  loadMembers: (workspace: WorkspaceViewRecord) => Promise<ManageAccessState>;
  onClose: () => void;
  onMutationCommitted: () => Promise<void> | void;
  open: boolean;
  removeMemberAccess: (workspace: WorkspaceViewRecord, userSysId: string) => Promise<{ errorMessage?: string; ok: boolean }>;
  searchUsers: (workspace: WorkspaceViewRecord, term: string, excludedUserSysIds?: string[]) => Promise<UserSearchState>;
  setMemberAccess: (workspace: WorkspaceViewRecord, userSysId: string, accessLevel: WorkspaceMemberAccessLevel) => Promise<{ errorMessage?: string; ok: boolean }>;
  workspace: WorkspaceViewRecord | null;
};

const ADD_MEMBER_PAGE_SIZE = 10;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function memberIdentity(member: Pick<WorkspaceMemberRecord | WorkspaceMemberUserSearchRecord, "displayName" | "email" | "userName">): string {
  return cleanText(member.email) || cleanText(member.userName) || "No identifier";
}

function accessLabel(accessLevel: WorkspaceMemberAccessLevel): string {
  return accessLevel === "admin" ? "Workspace Admin" : "Editor";
}

export function WorkspaceManageAccessOverlay({
  loadMembers,
  onClose,
  onMutationCommitted,
  open,
  removeMemberAccess,
  searchUsers,
  setMemberAccess,
  workspace
}: WorkspaceManageAccessOverlayProps) {
  const [state, setState] = useState<ManageAccessState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [mutatingUserSysId, setMutatingUserSysId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState("");
  const [addSearchState, setAddSearchState] = useState<UserSearchState>({ status: "idle", users: [] });
  const [hasMoreUsers, setHasMoreUsers] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());
  const [selectedStagedUserIds, setSelectedStagedUserIds] = useState<Set<string>>(() => new Set());
  const [stagedMembers, setStagedMembers] = useState<StagedMember[]>([]);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMemberRecord | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const addSearchIdRef = useRef(0);
  const availableSelectionAnchorRef = useRef<string>("");
  const stagedSelectionAnchorRef = useRef<string>("");

  const members = state.status === "success" ? state.members : [];
  const callerCapabilities = state.status === "success" ? state.callerCapabilities : null;
  const activeAdminCount = members.filter((member) => member.active && member.accessLevel === "admin").length;
  const filteredMembers = useMemo(() => {
    const needle = cleanText(query).toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      [member.displayName, member.email, member.userName, member.userSysId].some((value) => cleanText(value).toLowerCase().includes(needle))
    );
  }, [members, query]);
  const stagedUserIds = useMemo(() => new Set(stagedMembers.map((member) => member.userSysId)), [stagedMembers]);
  const availableUsers = useMemo(
    () => addSearchState.users.filter((user) => !stagedUserIds.has(user.userSysId)),
    [addSearchState.users, stagedUserIds]
  );

  async function refreshMembers() {
    if (!workspace) return;
    setState((current) => current.status === "success" ? current : { status: "loading" });
    setMutationError("");
    setState(await loadMembers(workspace));
  }

  useEffect(() => {
    if (!open || !workspace) {
      setState({ status: "idle" });
      return;
    }
    void refreshMembers();
  }, [open, workspace?.sysId, workspace?.slug]);

  useEffect(() => {
    if (!open) return;
    const ownerDocument = panelRef.current?.ownerDocument ?? document;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (removeTarget) {
          setRemoveTarget(null);
        } else if (addOpen) {
          closeAddMembers();
        } else {
          onClose();
        }
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (addOpen || removeTarget) return;
      const panel = panelRef.current;
      const target = event.target;
      if (panel && target instanceof Node && panel.contains(target)) {
        return;
      }
      onClose();
    };
    ownerDocument.addEventListener("keydown", handleKeyDown);
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown);
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [addOpen, onClose, open, removeTarget]);

  useEffect(() => {
    if (!addOpen || !workspace) return;
    const term = cleanText(addSearchTerm);
    const requestId = addSearchIdRef.current + 1;
    addSearchIdRef.current = requestId;
    setSelectedUserIds(new Set());
    availableSelectionAnchorRef.current = "";
    setHasMoreUsers(true);
    setAddSearchState({ status: "loading", users: [] });
    const timer = window.setTimeout(() => {
      void searchUsers(workspace, term).then((result) => {
        if (addSearchIdRef.current === requestId) {
          setHasMoreUsers(result.status === "success" && result.users.length >= ADD_MEMBER_PAGE_SIZE);
          setAddSearchState(result);
        }
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [addOpen, addSearchTerm, searchUsers, workspace?.sysId, workspace?.slug]);

  async function loadMoreUsers() {
    if (!workspace || !hasMoreUsers || addSearchState.status === "loading") return;
    const requestId = addSearchIdRef.current + 1;
    addSearchIdRef.current = requestId;
    const existingUsers = addSearchState.users;
    const excludedUserSysIds = [...existingUsers.map((user) => user.userSysId), ...stagedMembers.map((member) => member.userSysId)];
    setAddSearchState((current) => ({ status: "loading", users: current.users }));
    const result = await searchUsers(workspace, cleanText(addSearchTerm), excludedUserSysIds);
    if (addSearchIdRef.current !== requestId) return;
    if (result.status !== "success") {
      setAddSearchState(result);
      return;
    }
    setHasMoreUsers(result.users.length >= ADD_MEMBER_PAGE_SIZE);
    setAddSearchState({
      status: "success",
      users: [...existingUsers, ...result.users.filter((user) => !existingUsers.some((existing) => existing.userSysId === user.userSysId))]
    });
  }

  function handleUsersScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 48) {
      void loadMoreUsers();
    }
  }

  function closeAddMembers() {
    setAddOpen(false);
    setAddSearchTerm("");
    setAddSearchState({ status: "idle", users: [] });
    setHasMoreUsers(true);
    setSelectedUserIds(new Set());
    setSelectedStagedUserIds(new Set());
    setStagedMembers([]);
    availableSelectionAnchorRef.current = "";
    stagedSelectionAnchorRef.current = "";
  }

  function openAddMembers() {
    setAddOpen(true);
    setAddSearchTerm("");
    setAddSearchState({ status: "idle", users: [] });
    setHasMoreUsers(true);
    setSelectedUserIds(new Set());
    setSelectedStagedUserIds(new Set());
    setStagedMembers([]);
    availableSelectionAnchorRef.current = "";
    stagedSelectionAnchorRef.current = "";
  }

  function selectionFromEvent(
    event: MouseEvent,
    rows: { userSysId: string }[],
    targetUserSysId: string,
    currentSelection: Set<string>,
    anchorRef: MutableRefObject<string>
  ): Set<string> {
    if (event.shiftKey && anchorRef.current) {
      const anchorIndex = rows.findIndex((row) => row.userSysId === anchorRef.current);
      const targetIndex = rows.findIndex((row) => row.userSysId === targetUserSysId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        return new Set(rows.slice(start, end + 1).map((row) => row.userSysId));
      }
    }

    anchorRef.current = targetUserSysId;
    if (event.ctrlKey || event.metaKey) {
      const nextSelection = new Set(currentSelection);
      if (nextSelection.has(targetUserSysId)) {
        nextSelection.delete(targetUserSysId);
      } else {
        nextSelection.add(targetUserSysId);
      }
      return nextSelection;
    }

    return new Set([targetUserSysId]);
  }

  function selectAvailableUser(event: MouseEvent, userSysId: string) {
    setSelectedUserIds((current) => selectionFromEvent(event, availableUsers, userSysId, current, availableSelectionAnchorRef));
  }

  function selectStagedUser(event: MouseEvent, userSysId: string) {
    setSelectedStagedUserIds((current) => selectionFromEvent(event, stagedMembers, userSysId, current, stagedSelectionAnchorRef));
  }

  function stageSelectedUsers() {
    const selectedUsers = availableUsers.filter((user) => selectedUserIds.has(user.userSysId) && !stagedUserIds.has(user.userSysId));
    if (selectedUsers.length === 0) return;
    setStagedMembers((current) => [...current, ...selectedUsers.map((user) => ({ ...user, accessLevel: "editor" as const }))]);
    setSelectedUserIds(new Set());
    availableSelectionAnchorRef.current = "";
  }

  function updateStagedAccessLevel(userSysId: string, accessLevel: WorkspaceMemberAccessLevel) {
    setStagedMembers((current) => current.map((member) => member.userSysId === userSysId ? { ...member, accessLevel, errorMessage: undefined } : member));
  }

  function unstageSelectedUsers() {
    if (selectedStagedUserIds.size === 0) return;
    setStagedMembers((current) => current.filter((member) => !selectedStagedUserIds.has(member.userSysId)));
    setSelectedStagedUserIds(new Set());
    stagedSelectionAnchorRef.current = "";
  }

  if (!open || !workspace) return null;

  function isProtectedLastAdmin(member: WorkspaceMemberRecord): boolean {
    return member.active && member.accessLevel === "admin" && activeAdminCount <= 1;
  }

  async function commitRoleChange(member: WorkspaceMemberRecord, accessLevel: WorkspaceMemberAccessLevel) {
    if (!workspace || member.accessLevel === accessLevel || isProtectedLastAdmin(member)) return;
    setMutatingUserSysId(member.userSysId);
    setMutationError("");
    const result = await setMemberAccess(workspace, member.userSysId, accessLevel);
    setMutatingUserSysId("");
    if (!result.ok) {
      setMutationError(result.errorMessage || "Workspace access could not be updated.");
      return;
    }
    await refreshMembers();
    await onMutationCommitted();
  }

  async function commitAddMember() {
    if (!workspace || stagedMembers.length === 0) return;
    setMutationError("");
    let failed = false;
    let remaining = stagedMembers;
    for (const member of stagedMembers) {
      setMutatingUserSysId(member.userSysId);
      const result = await setMemberAccess(workspace, member.userSysId, member.accessLevel);
      if (!result.ok) {
        failed = true;
        remaining = remaining.map((staged) =>
          staged.userSysId === member.userSysId
            ? { ...staged, errorMessage: result.errorMessage || "Workspace access could not be updated." }
            : staged
        );
      } else {
        remaining = remaining.filter((staged) => staged.userSysId !== member.userSysId);
        setAddSearchState((current) => ({ ...current, users: current.users.filter((user) => user.userSysId !== member.userSysId) }));
      }
      setStagedMembers(remaining);
    }
    setMutatingUserSysId("");
    await refreshMembers();
    await onMutationCommitted();
    if (failed) return;
    closeAddMembers();
  }

  async function commitRemoveMember() {
    if (!workspace || !removeTarget || isProtectedLastAdmin(removeTarget)) return;
    const target = removeTarget;
    setMutatingUserSysId(target.userSysId);
    setMutationError("");
    const result = await removeMemberAccess(workspace, target.userSysId);
    setMutatingUserSysId("");
    if (!result.ok) {
      setMutationError(result.errorMessage || "Workspace access could not be removed.");
      return;
    }
    setRemoveTarget(null);
    await refreshMembers();
    await onMutationCommitted();
  }

  return (
    <div className="docsera-manage-access" data-docsera-manage-access="true">
      <aside ref={panelRef} className="docsera-manage-access__panel" role="complementary" aria-label="Manage access">
        <div className="docsera-manage-access__header">
          <div>
            <h2 className="docsera-manage-access__title">Manage access</h2>
          </div>
          <button type="button" className="docsera-modal__close docsera-manage-access__close" aria-label="Close manage access" onClick={onClose}>
            <DocseraIcon icon={docseraIcons.close} />
          </button>
        </div>
        <div className="docsera-manage-access__body">
          {state.status === "loading" || state.status === "idle" ? <div className="docsera-manage-access__state" role="status">Loading members...</div> : null}
          {state.status === "error" ? (
            <div className="docsera-manage-access__state" role="alert">
              <p>{state.errorMessage}</p>
              {state.retryable ? <button type="button" className="docsera-modal__secondary" onClick={() => void refreshMembers()}>Retry</button> : null}
            </div>
          ) : null}
          {state.status === "success" ? (
            <>
              {mutationError ? <div className="docsera-workspace-settings-overlay__alert" role="alert">{mutationError}</div> : null}
              <div className="docsera-manage-access__toolbar">
                <input className="docsera-workspace-settings-overlay__input" value={query} placeholder="Search members" aria-label="Search members" onChange={(event) => setQuery(event.target.value)} />
                <button type="button" className="docsera-modal__primary" onClick={openAddMembers}>Add members</button>
              </div>
              {filteredMembers.length === 0 ? <div className="docsera-manage-access__state">No members match this search.</div> : null}
              <div className="docsera-manage-access__list">
                {filteredMembers.map((member) => {
                  const protectedLastAdmin = isProtectedLastAdmin(member);
                  return (
                    <div key={member.userSysId} className={`docsera-manage-access__member${member.active ? "" : " docsera-manage-access__member--inactive"}`}>
                      <div className="docsera-manage-access__member-main">
                        <span className="docsera-manage-access__member-name">{cleanText(member.displayName) || member.userName || "Unknown user"}</span>
                        <span className="docsera-manage-access__member-meta">{memberIdentity(member)}{member.active ? "" : " · inactive"}</span>
                        {protectedLastAdmin ? <span className="docsera-manage-access__restriction">Last active Workspace Admin</span> : null}
                      </div>
                      <div className="docsera-manage-access__member-actions">
                        <select aria-label={`Access level for ${member.displayName}`} value={member.accessLevel} disabled={Boolean(mutatingUserSysId) || protectedLastAdmin} onChange={(event) => void commitRoleChange(member, event.target.value as WorkspaceMemberAccessLevel)}>
                          <option value="editor">Editor</option>
                          <option value="admin">Workspace Admin</option>
                        </select>
                        <button type="button" className="docsera-modal__secondary docsera-manage-access__remove-button" disabled={Boolean(mutatingUserSysId) || protectedLastAdmin} onClick={() => setRemoveTarget(member)}>Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </aside>

      {addOpen ? (
        <div className="docsera-modal docsera-modal--top-biased" role="presentation">
          <div className="docsera-modal__panel docsera-manage-access__add-panel" role="dialog" aria-modal="true" aria-labelledby="docsera-add-member-title">
            <div className="docsera-modal__header">
              <h3 id="docsera-add-member-title" className="docsera-modal__title">Add members</h3>
              <button type="button" className="docsera-modal__close" aria-label="Close add members" onClick={closeAddMembers}>
                <DocseraIcon icon={docseraIcons.close} />
              </button>
            </div>
            <div className="docsera-modal__body docsera-manage-access__add-body">
              <div className="docsera-manage-access__add-columns">
                <section className="docsera-manage-access__add-column" aria-labelledby="docsera-available-users-title">
                  <div className="docsera-manage-access__add-column-header">
                    <h4 id="docsera-available-users-title">Users</h4>
                  </div>
                  <label className="docsera-manage-access__user-search">
                    <span className="docsera-manage-access__user-search-icon" aria-hidden="true">
                      <DocseraIcon icon={docseraIcons.search} />
                    </span>
                    <input className="docsera-manage-access__user-search-input" type="search" value={addSearchTerm} placeholder="Search" aria-label="Search users" onChange={(event) => setAddSearchTerm(event.target.value)} />
                  </label>
                  <div className="docsera-manage-access__search-results" role="listbox" aria-label="Users" onScroll={handleUsersScroll}>
                    {addSearchState.status === "error" ? <div className="docsera-manage-access__state" role="alert">{addSearchState.errorMessage}</div> : null}
                    {addSearchState.status === "success" && availableUsers.length === 0 ? <div className="docsera-manage-access__state">No active non-members found.</div> : null}
                    {availableUsers.map((user) => (
                      <button key={user.userSysId} type="button" className={`docsera-manage-access__user-option${selectedUserIds.has(user.userSysId) ? " docsera-manage-access__user-option--selected" : ""}`} role="option" aria-selected={selectedUserIds.has(user.userSysId)} onClick={(event) => selectAvailableUser(event, user.userSysId)}>
                        <span>{cleanText(user.displayName) || user.userName}</span>
                        <small>{memberIdentity(user)}</small>
                      </button>
                    ))}
                  </div>
                </section>
                <div className="docsera-manage-access__add-transfer">
                  <button type="button" className="docsera-modal__secondary docsera-manage-access__move-button" aria-label="Stage selected users" disabled={selectedUserIds.size === 0 || Boolean(mutatingUserSysId)} onClick={stageSelectedUsers}>
                    <DocseraIcon icon={docseraIcons.chevronRight} />
                  </button>
                  <button type="button" className="docsera-modal__secondary docsera-manage-access__move-button" aria-label="Remove selected staged members" disabled={selectedStagedUserIds.size === 0 || Boolean(mutatingUserSysId)} onClick={unstageSelectedUsers}>
                    <DocseraIcon icon={docseraIcons.chevronLeft} />
                  </button>
                </div>
                <section className="docsera-manage-access__add-column" aria-labelledby="docsera-members-to-add-title">
                  <div className="docsera-manage-access__add-column-header">
                    <h4 id="docsera-members-to-add-title">Members to add</h4>
                  </div>
                  <div className="docsera-manage-access__list-align-spacer" aria-hidden="true" />
                  <div className="docsera-manage-access__staged-list" role="listbox" aria-label="Members to add">
                    {stagedMembers.length === 0 ? <div className="docsera-manage-access__state">No users staged.</div> : null}
                    {stagedMembers.map((member) => (
                      <div key={member.userSysId} className={`docsera-manage-access__staged-member${selectedStagedUserIds.has(member.userSysId) ? " docsera-manage-access__staged-member--selected" : ""}${member.errorMessage ? " docsera-manage-access__staged-member--error" : ""}`} role="option" aria-selected={selectedStagedUserIds.has(member.userSysId)} tabIndex={0} onClick={(event) => selectStagedUser(event, member.userSysId)}>
                        <div className="docsera-manage-access__member-main">
                          <span className="docsera-manage-access__member-name">{cleanText(member.displayName) || member.userName}</span>
                          <span className="docsera-manage-access__member-meta">{memberIdentity(member)}</span>
                          {member.errorMessage ? <span className="docsera-manage-access__staged-error" role="alert">{member.errorMessage}</span> : null}
                        </div>
                        <div className="docsera-manage-access__member-actions">
                          <select className="docsera-manage-access__role-select" aria-label={`Access level for ${member.displayName}`} value={member.accessLevel} disabled={Boolean(mutatingUserSysId)} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStagedAccessLevel(member.userSysId, event.target.value as WorkspaceMemberAccessLevel)}>
                            <option value="editor">Editor</option>
                            <option value="admin">Workspace Admin</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
            <div className="docsera-modal__footer">
              <div className="docsera-modal__actions">
                <button type="button" className="docsera-modal__secondary" onClick={closeAddMembers}>Cancel</button>
                <button type="button" className="docsera-modal__primary" disabled={stagedMembers.length === 0 || Boolean(mutatingUserSysId)} onClick={() => void commitAddMember()}>Add members</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div className="docsera-modal docsera-modal--top-biased" role="presentation">
          <div className="docsera-modal__panel" role="dialog" aria-modal="true" aria-labelledby="docsera-remove-member-title">
            <div className="docsera-modal__form">
              <div className="docsera-modal__header">
                <h3 id="docsera-remove-member-title" className="docsera-modal__title">Remove access</h3>
              </div>
              <div className="docsera-modal__body">
                <p className="docsera-modal__copy docsera-modal__copy--warning">Remove workspace access for {cleanText(removeTarget.displayName) || removeTarget.userName}?</p>
                <p className="docsera-modal__helper">{memberIdentity(removeTarget)} will no longer have Editor or Workspace Admin access.</p>
              </div>
              <div className="docsera-modal__footer">
                <div className="docsera-modal__actions">
                  <button type="button" className="docsera-modal__secondary" onClick={() => setRemoveTarget(null)}>Cancel</button>
                  <button type="button" className="docsera-modal__primary docsera-modal__primary--destructive" disabled={Boolean(mutatingUserSysId) || isProtectedLastAdmin(removeTarget)} onClick={() => void commitRemoveMember()}>Remove access</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
