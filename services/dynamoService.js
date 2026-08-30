const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb')

const client = new DynamoDBClient({ region: 'us-east-1' })
const dynamo = DynamoDBDocumentClient.from(client)

const s3 = new S3Client({ region: 'us-east-1' })

const BUCKET_NAME = 'notas-app-adjuntos'
const TABLE_NAME = 'notas'

/* ------------------------------------------------------------------------- */
const obtenerNotasPorUsuario = async (userId) => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: 'activo = :activo',
    ExpressionAttributeValues: {
      ':userId': userId,
      ':activo': true,
    },
  }
  const result = await dynamo.send(new QueryCommand(params))

  const notas = await Promise.all(
    result.Items.map(async (nota) => {
      if (nota.adjuntoKey) {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: nota.adjuntoKey,
        })
        nota.adjuntoUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
      }
      return nota
    }),
  )

  return notas
}

/* ------------------------------------------------------------------------- */
// Obtiene solamente las notas activas que se incluirán en el resumen.
const obtenerNotasParaResumen = async (userId) => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: 'activo = :activo',
    ExpressionAttributeValues: {
      ':userId': userId,
      ':activo': true,
    },
  }
  const result = await dynamo.send(new QueryCommand(params))

  return (result.Items || []).map((nota) => ({
    noteId: nota.noteId,
    titulo: nota.titulo,
    cuerpo: nota.cuerpo,
    creadoEn: nota.creadoEn,
    actualizadoEn: nota.actualizadoEn,
  }))
}

/* ------------------------------------------------------------------------- */
const crearNota = async (nota) => {
  const params = {
    TableName: TABLE_NAME,
    Item: nota,
  }
  await dynamo.send(new PutCommand(params))
  return nota
}

/* ------------------------------------------------------------------------- */
const actualizarNota = async (userId, noteId, titulo, cuerpo, adjuntoKey) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { userId, noteId },
    UpdateExpression:
      'set titulo = :titulo, cuerpo = :cuerpo, adjuntoKey = :adjuntoKey, actualizadoEn = :actualizadoEn',
    ConditionExpression: 'attribute_exists(noteId) AND activo = :activo',
    ExpressionAttributeValues: {
      ':titulo': titulo,
      ':cuerpo': cuerpo,
      ':adjuntoKey': adjuntoKey || null,
      ':activo': true,
      ':actualizadoEn': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  }
  const result = await dynamo.send(new UpdateCommand(params))
  return result.Attributes
}

/* ------------------------------------------------------------------------- */
const desactivarNota = async (userId, noteId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { userId, noteId },
    UpdateExpression: 'set activo = :activo, desactivadoEn = :fecha, #ttl = :ttl',
    ConditionExpression: 'attribute_exists(noteId) AND activo = :activoActual',
    ExpressionAttributeNames: {
      '#ttl': 'ttl'
    },
    ExpressionAttributeValues: {
      ':activo': false,
      ':fecha': new Date().toISOString(),
      ':activoActual': true,
      ':ttl': Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
    },
    ReturnValues: 'ALL_NEW',
  }
  const result = await dynamo.send(new UpdateCommand(params))
  return result.Attributes
}

/* ------------------------------------------------------------------------- */
// Elimina PERMANENTEMENTE todas las notas de un usuario, ya sea invitado o real
const eliminarNotasPorUsuario = async (userId) => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
  }
  const result = await dynamo.send(new QueryCommand(params))

  await Promise.all(
    result.Items.map((nota) =>
      dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { userId: nota.userId, noteId: nota.noteId },
      }))
    )
  )

  return result.Items.length
}

/* ------------------------------------------------------------------------- */
// Cuenta cuántas notas activas tiene un usuario (para limitar el máximo permitido)
const contarNotasActivas = async (userId) => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: 'activo = :activo',
    ExpressionAttributeValues: {
      ':userId': userId,
      ':activo': true,
    },
    Select: 'COUNT',
  }
  const result = await dynamo.send(new QueryCommand(params))
  return result.Count
}

/* ------------------------------------------------------------------------- */
module.exports = {
  obtenerNotasPorUsuario,
  obtenerNotasParaResumen,
  crearNota,
  actualizarNota,
  desactivarNota,
  eliminarNotasPorUsuario,
  contarNotasActivas,
}
