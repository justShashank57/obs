const CLIENT_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * clientId is used to build filesystem paths (configStore) and to key
 * sockets/auth. It must never be trusted as-is — a previous version of this
 * code interpolated it unsanitized into path.join(), which is a path
 * traversal vulnerability (e.g. clientId = "../../../etc/cron.d/x"). Every
 * entry point that accepts a clientId from a request must validate it with
 * this before it touches the filesystem or an auth decision.
 */
export function isValidClientId(id) {
  return typeof id === 'string' && CLIENT_ID_PATTERN.test(id);
}

export function requireValidClientIdParam(req, res, next) {
  if (!isValidClientId(req.params.clientId)) {
    return res.status(400).json({ error: 'Invalid client id' });
  }
  next();
}
