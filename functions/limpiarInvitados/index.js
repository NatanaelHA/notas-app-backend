const {
    obtenerInvitadosOrdenadosPorFecha,
    eliminarInvitado,
    filtrarInvitadosVencidos,
  } = require('../../services/cognitoService')
  const { eliminarNotasPorUsuario } = require('../../services/dynamoService')
  
  exports.handler = async () => {
    try {
      const invitados = await obtenerInvitadosOrdenadosPorFecha()
      const vencidos = filtrarInvitadosVencidos(invitados, 24)
  
      for (const invitado of vencidos) {
        const username = invitado.Username
        const subAttr = invitado.Attributes.find((a) => a.Name === 'sub')
        const userId = subAttr?.Value
  
        await eliminarInvitado(username)
  
        if (userId) {
          await eliminarNotasPorUsuario(userId)
        }
  
        console.log(`Invitado eliminado: ${username}`)
      }
  
      console.log(`Total de invitados eliminados: ${vencidos.length}`)
    } catch (error) {
      console.error('Error al limpiar invitados:', error)
    }
  }