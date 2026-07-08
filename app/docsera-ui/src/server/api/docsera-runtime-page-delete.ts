type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

export async function process(_request: unknown, response: ResponseLike) {
  response.setStatus?.(405);
  response.setBody({
    error: {
      message: "Delete page requires the POST /pages/delete action route."
    }
  });
}
