/** Wrap an async route handler so thrown errors reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Central error handler. */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  const status = err.status || err.statusCode || (err.code === "23505" ? 409 : 500);
  const message =
    err.code === "23505"
      ? "A record with this value already exists."
      : err.expose
      ? err.message
      : err.message || "Something went wrong.";

  if (status >= 500) {
    console.error("[error]", err);
  }

  res.status(status).json({ message });
};

/** 404 for unknown API routes. */
export const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};
