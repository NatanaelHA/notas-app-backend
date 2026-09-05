const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { randomUUID } = require('node:crypto')
const { obtenerNotaActiva } = require('../../services/dynamoService')
const { response } = require('../../utils/response')

const s3 = new S3Client({ region: 'us-east-1' })
const BUCKET_NAME = 'notas-app-adjuntos'
const TAMANO_MAXIMO = 5 * 1024 * 1024
const EXTENSIONES_PERMITIDAS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const { noteId } = event.pathParameters
    const { nombreArchivo, tipoArchivo, tamanoArchivo } = JSON.parse(event.body)

    if (!nombreArchivo || typeof nombreArchivo !== 'string') {
      return response(400, { mensaje: 'El nombre del archivo es obligatorio' })
    }

    const extension = EXTENSIONES_PERMITIDAS[tipoArchivo]

    if (!extension) {
      return response(400, {
        mensaje: 'Solo se permiten imágenes JPEG, PNG o WebP',
      })
    }

    if (
      !Number.isInteger(tamanoArchivo) ||
      tamanoArchivo <= 0 ||
      tamanoArchivo > TAMANO_MAXIMO
    ) {
      return response(400, {
        mensaje: 'La imagen debe pesar como máximo 5 MB',
      })
    }

    const nota = await obtenerNotaActiva(userId, noteId)

    if (!nota) {
      return response(404, { mensaje: 'Nota no encontrada' })
    }

    const adjuntoRuta = `${userId}/${noteId}/${randomUUID()}.${extension}`

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: adjuntoRuta,
      ContentType: tipoArchivo,
    })

    const url = await getSignedUrl(s3, command, { expiresIn: 300 })

    return response(200, { url, adjuntoRuta })
  } catch (error) {
    console.error('Error al generar URL:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}
