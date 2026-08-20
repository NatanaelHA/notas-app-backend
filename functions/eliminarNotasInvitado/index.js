const { eliminarNotasPorUsuario } = require('../../services/dynamoService')

exports.handler = async (event) => {
  try {
    const detalle = event.detail

    if (!detalle || !detalle.userId) {
      console.error('Evento recibido sin userId:', JSON.stringify(event))
      return
    }

    const cantidadEliminadas = await eliminarNotasPorUsuario(detalle.userId)

    console.log(`Notas eliminadas para invitado ${detalle.userId}: ${cantidadEliminadas}`)
  } catch (error) {
    const userId = event?.detail?.userId || 'desconocido'
    console.error(`Error al eliminar notas del invitado ${userId}:`, error)
    throw error
  }
}
