function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const isMalformedJson = error instanceof SyntaxError && error.status === 400 && 'body' in error;
  const status = isMalformedJson ? 400 : (error.statusCode || 500);
  const code = isMalformedJson
    ? 'INVALID_JSON'
    : (error.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'));
  const message = isMalformedJson
    ? 'Request body contains malformed JSON.'
    : (status === 500 ? 'An unexpected error occurred.' : error.message);

  if (status >= 500) {
    console.error('Request failed:', error.code || error.name || 'unknown error');
  }

  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
