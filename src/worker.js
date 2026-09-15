/**
 * The Pawsitions Worker.
 *
 * Almost every request to this site never gets here: Cloudflare serves the files
 * in public/ directly, which is faster and costs nothing. The Worker exists for
 * the one thing a static file cannot do — hold a live connection open between two
 * people playing each other.
 *
 * `run_worker_first` in wrangler.jsonc names the only path routed here first.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/ws/')) {
      // Online rooms arrive in phase 4. Until then, say so honestly rather than
      // leaving a connection hanging.
      return new Response('Online rooms are not built yet.', {
        status: 501,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    // Anything else is a static file, or index.html via single-page-application
    // handling. In practice this line is rarely reached.
    return env.ASSETS.fetch(request);
  },
};
