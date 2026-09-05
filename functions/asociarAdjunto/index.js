const {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const {
  obtenerNotaActiva,
  asociarAdjunto,
} = require('../../services/dynamoService')
const { response } = require('../../utils/response')

const s3 = new S3Client({ region: 'us-east-1' })
const BUCKET_NAME = 'notas-app-adjuntos'
const TAMANO_MAXIMO = 5 * 1024 * 1024
const TIPOS_PERMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const eliminarObjetoS3 = async (adjuntoRuta) => {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: adjuntoRuta,
  }))
}

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub
    const { noteId } = event.pathParameters
    const { adjuntoRuta, nombreArchivo } = JSON.parse(event.body)

    if (!adjuntoRuta || !nombreArchivo) {
      return response(400, {
        mensaje: 'La ruta y el nombre del archivo son obligatorios',
      })
    }

    if (!adjuntoRuta.startsWith(`${userId}/${noteId}/`)) {
      return response(400, { mensaje: 'La ruta del adjunto no es válida' })
    }

    const nota = await obtenerNotaActiva(userId, noteId)

    if (!nota) {
      return response(404, { mensaje: 'Nota no encontrada' })
    }

    let objeto

    try {
      objeto = await s3.send(new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: adjuntoRuta,
      }))
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404) {
        return response(404, { mensaje: 'Imagen no encontrada en S3' })
      }

      throw error
    }

    const tipoReal = objeto.ContentType
    const tamanoReal = objeto.ContentLength
    const imagenValida =
      TIPOS_PERMITIDOS.has(tipoReal) &&
      Number.isInteger(tamanoReal) &&
      tamanoReal > 0 &&
      tamanoReal <= TAMANO_MAXIMO

    if (!imagenValida) {
      await eliminarObjetoS3(adjuntoRuta)

      return response(400, {
        mensaje: 'La imagen subida no cumple el tipo o tamaño permitido',
      })
    }

    const notaActualizada = await asociarAdjunto(userId, noteId, {
      ruta: adjuntoRuta,
      nombre: nombreArchivo,
      tipo: tipoReal,
      tamano: tamanoReal,
    })

    if (nota.adjuntoRuta && nota.adjuntoRuta !== adjuntoRuta) {
      try {
        await eliminarObjetoS3(nota.adjuntoRuta)
      } catch (error) {
        console.error(
          `La imagen nueva fue asociada, pero no se pudo eliminar el adjunto anterior ${nota.adjuntoRuta}:`,
          error,
        )
      }
    }

    notaActualizada.adjuntoUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: adjuntoRuta,
      }),
      { expiresIn: 300 },
    )

    return response(200, { data: notaActualizada })
  } catch (error) {
    console.error('Error al asociar adjunto:', error)
    return response(500, { mensaje: 'Error interno del servidor' })
  }
}
