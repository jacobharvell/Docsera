const PAGE_OWNERSHIP_HANDOFF_EVENT = "docsera-page-ownership-handoff";

export type PageOwnershipHandoffDetail = {
  pageSysId: string;
  reason: "page-create-inline-title";
};

type PageOwnershipHandoffEvent = CustomEvent<PageOwnershipHandoffDetail>;

function normalizeDetail(detail: PageOwnershipHandoffDetail): PageOwnershipHandoffDetail {
  return {
    pageSysId: detail.pageSysId.trim(),
    reason: detail.reason
  };
}

export function requestPageOwnershipHandoff(detail: PageOwnershipHandoffDetail): void {
  if (typeof document === "undefined" || typeof CustomEvent === "undefined") {
    return;
  }

  document.dispatchEvent(
    new CustomEvent<PageOwnershipHandoffDetail>(PAGE_OWNERSHIP_HANDOFF_EVENT, {
      detail: normalizeDetail(detail)
    })
  );
}

export function subscribeToPageOwnershipHandoff(
  ownerDocument: Document,
  listener: (detail: PageOwnershipHandoffDetail) => void
): () => void {
  const handleEvent = (event: Event) => {
    const handoffEvent = event as PageOwnershipHandoffEvent;
    if (!handoffEvent.detail) {
      return;
    }

    listener(normalizeDetail(handoffEvent.detail));
  };

  ownerDocument.addEventListener(PAGE_OWNERSHIP_HANDOFF_EVENT, handleEvent as EventListener);
  return () => {
    ownerDocument.removeEventListener(PAGE_OWNERSHIP_HANDOFF_EVENT, handleEvent as EventListener);
  };
}
