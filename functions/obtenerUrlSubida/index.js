const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { response } = require('../../utils/response')

const s3 = new S3Client({ region: 'us-east-1' })
const BUCKET_NAME = 'notas-app-adjuntos'

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const { noteId } = event.pathParameters
    const { tipoArchivo } = JSON.parse(event.body)

    const key = `${userId}/${noteId}/${Date.now()}`

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: tipoArchivo
    })

    const url = await getSignedUrl(s3, command, { expiresIn: 300 })

    return response(200, { url, key })
  } catch (error) {
    console.error('Error al generar URL:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}