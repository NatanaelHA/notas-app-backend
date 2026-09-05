const {
  desactivarNota,
  eliminarAdjuntoDeS3,
} = require('../../services/dynamoService')
const { response } = require('../../utils/response')

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const { noteId } = event.pathParameters
    const resultado = await desactivarNota(userId, noteId)

    if (resultado.adjuntoRuta) {
      try {
        await eliminarAdjuntoDeS3(resultado.adjuntoRuta)
      } catch (error) {
        console.error(
          `La nota ${noteId} fue desactivada, pero no se pudo eliminar su adjunto de S3:`,
          error,
        )
      }
    }

    return response(200, { data: resultado })
  } catch (error) {
    console.error('Error al desactivar nota:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}
