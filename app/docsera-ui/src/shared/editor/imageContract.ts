export {
  DOCSERA_IMAGE_ALIGNMENTS,
  DOCSERA_IMAGE_DEFAULTS,
  canonicalizeDocseraImageAttrs,
  validateDocseraImageAttrs,
  type DocseraImageAlignment,
  type DocseraImageAttrs
} from "../../server/pages/serverImageContract";

export type WorkspaceMediaLoader = (input: { mediaId: string; signal?: AbortSignal }) => Promise<Blob | null>;
