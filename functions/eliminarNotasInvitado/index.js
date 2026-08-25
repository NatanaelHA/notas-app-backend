const {
  obtenerNotasParaResumen,
  eliminarNotasPorUsuario,
} = require('../../services/dynamoService')
const { publicarMensajeCorreo } = require('../../services/sqsService')

const EMAIL_AUDITORIA = 'natanaelhuenullan6@gmail.com'

exports.handler = async (event) => {
  try {
    const detalle = event.detail

    if (!detalle || !detalle.userId) {
      console.error('Evento recibido sin userId:', JSON.stringify(event))
      return
    }

    const notasParaResumen = await obtenerNotasParaResumen(detalle.userId)

    console.log(
      `Notas activas encontradas para el resumen del invitado ${detalle.userId}: ${notasParaResumen.length}`,
    )

    if (notasParaResumen.length > 0) {
      await publicarMensajeCorreo({
        tipo: 'resumen_invitado',
        userId: detalle.userId,
        email: EMAIL_AUDITORIA,
        notas: notasParaResumen,
      })

      console.log(`Resumen del invitado ${detalle.userId} publicado en SQS`)
    }

    const cantidadEliminadas = await eliminarNotasPorUsuario(detalle.userId)

    console.log(`Notas eliminadas para invitado ${detalle.userId}: ${cantidadEliminadas}`)
  } catch (error) {
    const userId = event?.detail?.userId || 'desconocido'
    console.error(`Error al eliminar notas del invitado ${userId}:`, error)
    throw error
  }
}
