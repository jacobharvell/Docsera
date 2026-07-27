export async function initializeWorkspaceFoundationViaLiveLoad({ listPages, workspace }) {
  return listPages(workspace.slug, "live");
}

export async function prepareProvisionedWorkspaceForEdit({
  acquireLease,
  createWorkspace,
  initializeWorkspace = initializeWorkspaceFoundationViaLiveLoad
}) {
  const workspaceResult = await createWorkspace();
  const workspace = workspaceResult?.workspace ?? workspaceResult;

  await initializeWorkspace({ workspace });
  const lease = await acquireLease({ workspace });

  return {
    lease,
    workspace,
    workspaceResult
  };
}
