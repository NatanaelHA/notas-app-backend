# Notas App — Backend

Backend serverless para una aplicación de notas personales, construido completamente sobre AWS.

## Arquitectura

Cliente (Next.js)
→ API Gateway (HTTP API)
→ Lambda (Node.js 22)
→ DynamoDB / S3 / SQS / Cognito


## Servicios AWS utilizados

- **AWS Lambda** — lógica de negocio (8 funciones)
- **API Gateway (HTTP API)** — expone las Lambdas como endpoints REST, protegidos con autorizador de Cognito (excepto `/invitado`)
- **Amazon Cognito** — autenticación de usuarios (JWT), incluye flujo de "modo invitado" con cuentas temporales
- **Amazon DynamoDB** — base de datos de notas (soft delete + TTL)
- **Amazon S3** — almacenamiento de archivos adjuntos vía presigned URLs
- **Amazon SQS** — cola de notificaciones por email, con Dead Letter Queue
- **Amazon SES** — envío de emails al crear una nota
- **Amazon EventBridge Scheduler** — limpieza automática de cuentas invitado (cada hora)
- **Amazon CloudWatch** — logs de todas las funciones

## Lambdas

| Función | Descripción |
|---|---|
| `obtenerNotas` | Lista las notas activas del usuario |
| `crearNota` | Crea una nota nueva (con límite de 20 notas por usuario) |
| `actualizarNota` | Edita una nota existente |
| `desactivarNota` | Soft delete de una nota (TTL de 7 días) |
| `obtenerUrlSubida` | Genera presigned URL para subir adjuntos a S3 |
| `mailer` | Consume mensajes de SQS y envía notificaciones por SES |
| `crearInvitado` | Crea una cuenta temporal de Cognito para probar la app sin registro |
| `limpiarInvitados` | Elimina cuentas invitado con más de 24h de antigüedad (disparada por EventBridge cada hora) |

## Endpoints

GET /notas (auth requerida)
POST /notas (auth requerida)
PUT /notas/{noteId} (auth requerida)
DELETE /notas/{noteId} (auth requerida)
POST /notas/{noteId}/adjunto (auth requerida)
POST /invitado (público, con rate limiting)


## Estructura del proyecto

notas-app/
├── functions/
│ ├── obtenerNotas/
│ ├── crearNota/
│ ├── actualizarNota/
│ ├── desactivarNota/
│ ├── obtenerUrlSubida/
│ ├── mailer/
│ ├── crearInvitado/
│ └── limpiarInvitados/
├── services/
│ ├── dynamoService.js # operaciones de DynamoDB
│ └── cognitoService.js # operaciones de Cognito (gestión de invitados)
├── models/
│ └── nota.js
├── utils/
│ └── response.js
└── .github/workflows/
└── deploy.yml


## CI/CD

Despliegue automático con **GitHub Actions**: cada push a `develop` o `main` empaqueta el código y actualiza todas las Lambdas en AWS.

## Notas de diseño

- **Soft delete + TTL**: las notas eliminadas no se borran inmediatamente, quedan marcadas como inactivas y DynamoDB las elimina automáticamente a los 7 días.
- **Modo invitado**: los usuarios pueden probar la app sin registrarse. Se genera una cuenta temporal en Cognito, limitada a 24h de vida y con un tope de 50 cuentas invitado simultáneas (elimina la más antigua al superar el límite).
- **Rate limiting**: la ruta pública `/invitado` tiene throttling en API Gateway para prevenir abuso.
