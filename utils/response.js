const response = (statusCode, body, event = null) => {
  let origin = "*";
  if (event && event.headers) {
    origin = event.headers.origin || event.headers.Origin || "*";
  }

  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json",
      // Usamos comillas dobles estrictas para evitar errores de parseo en la infraestructura
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify(body)
  };
};

module.exports = { response };