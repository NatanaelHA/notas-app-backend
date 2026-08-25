const { crearNota, contarNotasActivas } = require('../../services/dynamoService')
const { crearModeloNota } = require('../../models/nota')
const { response } = require('../../utils/response')

const MAX_NOTAS_POR_USUARIO = 20

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub

    const totalNotas = await contarNotasActivas(userId)
    if (totalNotas >= MAX_NOTAS_POR_USUARIO) {
      return response(403, { mensaje: `Has alcanzado el límite de ${MAX_NOTAS_POR_USUARIO} notas. Elimina alguna para crear una nueva.` })
    }

    const { titulo, cuerpo } = JSON.parse(event.body)
    const nota = crearModeloNota(userId, titulo, cuerpo)
    await crearNota(nota)

    return response(201, { data: nota })
  } catch (error) {
    console.error('Error al crear nota:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}
