const { v4: uuidv4 } = require('uuid')

const crearModeloNota = (userId, titulo, cuerpo) => {
  return {
    noteId: uuidv4(),
    activo: true,
    userId,
    cuerpo,
    titulo,
    creadoEn: new Date().toISOString()
  }
}

module.exports = { crearModeloNota }