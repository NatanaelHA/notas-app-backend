const { crearNota } = require('../../services/dynamoService')
const { crearModeloNota } = require('../../models/nota')
const { response } = require('../../utils/response')
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')

const sqs = new SQSClient({ region: 'us-east-1' })
const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/152146163155/notas-emails'

/* --------------------esta es la unica funcion que usa el ./models/ nota.js por ahora---------------------- */
exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const { titulo, cuerpo } = JSON.parse(event.body)
    const nota = crearModeloNota(userId, titulo, cuerpo)
    await crearNota(nota)

    await sqs.send(new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify({
        userId,
        email: event.requestContext.authorizer.jwt.claims.email,
        titulo: nota.titulo,
        noteId: nota.noteId
      })
    }))
    
    return response(201, { data: nota })
  } catch (error) {
    console.error('Error al crear nota:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}