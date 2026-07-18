type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

export async function process(_request: unknown, response: ResponseLike) {
  response.setStatus?.(405);
  response.setBody({
    error: {
      code: "publish_unavailable",
      retryable: false,
      message: "Workspace publish is not active on this route."
    }
  });
}
