import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import type { WorkspaceMediaLoader } from "../shared/types/docsera";

export type EditorCapabilities = Readonly<{
  canEdit: boolean;
  canUploadMedia: boolean;
  canPublish: boolean;
}>;

export type EditorDraftSnapshot = Readonly<{
  pageSysId: string;
  revision: number;
  envelope: DocseraDocumentEnvelope;
}>;

export type EditorSaveRequest = Readonly<{
  pageSysId: string;
  sessionGeneration: number;
  expectedRevision: number;
  envelope: DocseraDocumentEnvelope;
  signal?: AbortSignal;
}>;

export type EditorSaveResult =
  | { kind: "succeeded"; snapshot: EditorDraftSnapshot }
  | { kind: "conflict"; currentRevision: number; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "failed"; message: string; retryable: boolean };

export type EditorPersistenceAdapter = Readonly<{
  loadDraft: (pageSysId: string, signal?: AbortSignal) => Promise<EditorDraftSnapshot>;
  saveDraft: (request: EditorSaveRequest) => Promise<EditorSaveResult>;
}>;

export type EditorMediaReference = Readonly<{
  mediaId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}>;

export type EditorMediaAdapter = Readonly<{
  list: (input: { signal?: AbortSignal }) => Promise<EditorMediaReference[]>;
  upload: (input: {
    file: File;
    signal?: AbortSignal;
  }) => Promise<EditorMediaReference>;
  load: WorkspaceMediaLoader;
}>;

export type EditorHostStatus =
  | { kind: "loading" }
  | { kind: "clean"; revision: number }
  | { kind: "dirty"; revision: number }
  | { kind: "saving"; revision: number }
  | { kind: "saved"; revision: number }
  | { kind: "conflict"; revision: number; message: string }
  | { kind: "error"; message: string; recoverable: boolean };

export type EditorHostHandle = Readonly<{
  save: () => Promise<EditorSaveResult | null>;
  flush: () => Promise<EditorSaveResult | null>;
  focus: () => void;
  reload: () => Promise<void>;
}>;
