const { actualizarNota } = require('../../services/dynamoService')
const { response } = require('../../utils/response')

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const { noteId } = event.pathParameters
    const { titulo, cuerpo } = JSON.parse(event.body)
    const nota = await actualizarNota(userId, noteId, titulo, cuerpo)
    return response(200, { data: nota })
  } catch (error) {
    console.error('Error al actualizar nota:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}
