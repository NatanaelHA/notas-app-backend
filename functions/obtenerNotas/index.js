const { obtenerNotasPorUsuario } = require('../../services/dynamoService')
const { response } = require('../../utils/response')

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const notas = await obtenerNotasPorUsuario(userId)
    return response(200, { data: notas })
  } catch (error) {
    console.error('Error al obtener notas:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}