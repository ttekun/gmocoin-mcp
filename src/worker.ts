import { handleRemoteRequest, type RemoteEnv } from "./remote.js";

export default {
  fetch: (request: Request, env: RemoteEnv): Promise<Response> =>
    handleRemoteRequest(request, env),
};
