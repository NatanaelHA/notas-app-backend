const { desactivarNota } = require('../../services/dynamoService')
const { response } = require('../../utils/response')

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const { noteId } = event.pathParameters
    const resultado = await desactivarNota(userId, noteId)
    return response(200, { data: resultado })
  } catch (error) {
    console.error('Error al desactivar nota:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}