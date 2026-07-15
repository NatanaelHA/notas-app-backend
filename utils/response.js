const response = (statusCode, body) => {
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json"
      // Quitamos Access-Control-Allow-Origin y los demás porque ya están configurados en la interfaz de API Gateway
    },
    body: JSON.stringify(body)
  };
};

module.exports = { response };