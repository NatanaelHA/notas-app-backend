const {
  obtenerNotasParaResumen,
  eliminarNotasPorUsuario,
} = require('../../services/dynamoService')
const { publicarMensajeCorreo } = require('../../services/sqsService')

exports.handler = async (event) => {
  try {
    const detalle = event.detail

    if (!detalle?.userId || !detalle?.email) {
      throw new Error(
        `Evento UsuarioParaLimpieza incompleto: ${JSON.stringify(event)}`,
      )
    }

    const notasParaResumen = await obtenerNotasParaResumen(detalle.userId)

    console.log(
      `Notas activas encontradas para el resumen del usuario ${detalle.userId}: ${notasParaResumen.length}`,
    )

    if (notasParaResumen.length > 0) {
      await publicarMensajeCorreo({
        tipo: 'resumen_usuario',
        userId: detalle.userId,
        email: detalle.email,
        notas: notasParaResumen,
      })

      console.log(
        `Resumen del usuario ${detalle.userId} publicado en SQS`,
      )
    }

    const cantidadEliminadas = await eliminarNotasPorUsuario(detalle.userId)

    console.log(
      `Notas eliminadas para usuario ${detalle.userId}: ${cantidadEliminadas}`,
    )
  } catch (error) {
    const userId = event?.detail?.userId || 'desconocido'
    console.error(`Error al eliminar notas del usuario ${userId}:`, error)
    throw error
  }
}
