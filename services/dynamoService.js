const {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand,
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
/* CONSULTAS DE NOTAS                                                        */
/* ------------------------------------------------------------------------- */

// Agrega una URL temporal de lectura sin guardarla en DynamoDB.
const agregarUrlTemporalAdjunto = async (nota) => {
  if (!nota?.adjuntoRuta) return nota

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: nota.adjuntoRuta,
  })

  return {
    ...nota,
    adjuntoUrl: await getSignedUrl(s3, command, { expiresIn: 300 }),
  }
}

// Lista las notas activas del usuario para mostrarlas en el frontend.
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
    result.Items.map(agregarUrlTemporalAdjunto),
  )

  return notas
}

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
/* CREACIÓN Y EDICIÓN DE NOTAS                                               */
/* ------------------------------------------------------------------------- */

// Guarda una nota nueva creada por el usuario.
const crearNota = async (nota) => {
  const params = {
    TableName: TABLE_NAME,
    Item: nota,
  }
  await dynamo.send(new PutCommand(params))
  return nota
}

// Actualiza únicamente el título y el contenido de una nota activa.
const actualizarNota = async (userId, noteId, titulo, cuerpo) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { userId, noteId },
    UpdateExpression:
      'set titulo = :titulo, cuerpo = :cuerpo, actualizadoEn = :actualizadoEn',
    ConditionExpression: 'attribute_exists(noteId) AND activo = :activo',
    ExpressionAttributeValues: {
      ':titulo': titulo,
      ':cuerpo': cuerpo,
      ':activo': true,
      ':actualizadoEn': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  }
  const result = await dynamo.send(new UpdateCommand(params))
  return agregarUrlTemporalAdjunto(result.Attributes)
}

/* ------------------------------------------------------------------------- */
/* ADJUNTOS                                                                  */
/* ------------------------------------------------------------------------- */

// Comprueba que una nota específica existe, está activa y pertenece al usuario.
const obtenerNotaActiva = async (userId, noteId) => {
  const result = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId, noteId },
  }))

  if (!result.Item?.activo) return null

  return result.Item
}

// Relaciona una imagen de S3 con la nota sin modificar la fecha de edición.
const asociarAdjunto = async (
  userId,
  noteId,
  { ruta, nombre, tipo, tamano },
) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { userId, noteId },
    UpdateExpression:
      'set adjuntoRuta = :ruta, adjuntoNombre = :nombre, adjuntoTipo = :tipo, adjuntoTamano = :tamano',
    ConditionExpression: 'attribute_exists(noteId) AND activo = :activo',
    ExpressionAttributeValues: {
      ':ruta': ruta,
      ':nombre': nombre,
      ':tipo': tipo,
      ':tamano': tamano,
      ':activo': true,
    },
    ReturnValues: 'ALL_NEW',
  }

  const result = await dynamo.send(new UpdateCommand(params))
  return result.Attributes
}

// Elimina de S3 la imagen asociada a una nota.
const eliminarAdjuntoDeS3 = async (adjuntoRuta) => {
  if (!adjuntoRuta) return

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: adjuntoRuta,
  }))
}

/* ------------------------------------------------------------------------- */
/* ELIMINACIÓN DE NOTAS                                                      */
/* ------------------------------------------------------------------------- */

// Desactiva una nota y configura su eliminación automática mediante TTL.
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
    result.Items.map(async (nota) => {
      await eliminarAdjuntoDeS3(nota.adjuntoRuta)

      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { userId: nota.userId, noteId: nota.noteId },
      }))
    })
  )

  return result.Items.length
}

/* ------------------------------------------------------------------------- */
/* LÍMITES                                                                   */
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
  obtenerNotaActiva,
  asociarAdjunto,
  eliminarAdjuntoDeS3,
  desactivarNota,
  eliminarNotasPorUsuario,
  contarNotasActivas,
}
