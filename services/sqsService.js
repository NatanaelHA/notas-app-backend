const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')

const sqs = new SQSClient({ region: 'us-east-1' })
const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/152146163155/notas-emails'

const publicarMensajeCorreo = async (mensaje) => {
  await sqs.send(new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(mensaje),
  }))
}

module.exports = {
  publicarMensajeCorreo,
}
