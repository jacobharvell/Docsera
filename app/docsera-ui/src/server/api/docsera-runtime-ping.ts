import { GlideDateTime, gs } from "@servicenow/glide";

const DOCSERA_SCOPE = "x_82900_docsera";

export function process(_request: unknown, response: { setBody: (payload: unknown) => void }) {
  response.setBody({
    result: {
      authenticated: true,
      scope: DOCSERA_SCOPE,
      status: "ok",
      timestamp: new GlideDateTime().getDisplayValue(),
      userDisplayName: gs.getUserDisplayName(),
      userName: gs.getUserName(),
      userSysId: gs.getUserID()
    }
  });
}
