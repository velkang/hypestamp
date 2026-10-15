// Static assets and the SPA fallback are served before this code runs; only the
// `run_worker_first` API paths reach it, and they are forwarded to the API Worker.
type Env = { API: { fetch(request: Request): Promise<Response> } };

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.API.fetch(request);
  },
};
