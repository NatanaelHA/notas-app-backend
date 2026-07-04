# Notas App Backend - AWS Serverless

Backend serverless para una aplicación Full Stack de gestión de notas construida con AWS Lambda, API Gateway y Amazon DynamoDB.

## 📋 Descripción General

Aplicación Full Stack de Gestión de Notas con arquitectura serverless en AWS:

- **Backend**: AWS Lambda, API Gateway y Amazon DynamoDB para el CRUD de notas
- **Frontend**: Next.js 16, TypeScript y AWS Amplify
- **Autenticación**: Amazon Cognito (JWT) con verificación de sesiones server-side
- **Almacenamiento de archivos**: Amazon S3 con presigned URLs para carga segura
- **Procesamiento asíncrono**: Amazon SQS, Amazon SES y DLQ para notificaciones por correo
- **Infraestructura como código (IaC)**: AWS CloudFormation / SAM / Terraform

## 🏗️ Arquitectura Backend

### AWS Lambda Functions

Las funciones Lambda implementan la lógica de negocio principal:

```
├── src/functions/
│   ├── notes/
│   │   ├── createNote.ts          # Crear nueva nota
│   │   ├── getNotes.ts            # Obtener notas del usuario
│   │   ├── getNoteById.ts         # Obtener nota específica
│   │   ├── updateNote.ts          # Actualizar nota
│   │   └── deleteNote.ts          # Eliminar nota
│   ├── attachments/
│   │   ├── getPresignedUrl.ts     # Generar URL firmada S3
│   │   ├── uploadAttachment.ts    # Procesar carga de archivo
│   │   └── deleteAttachment.ts    # Eliminar archivo
│   ├── auth/
│   │   ├── authorizer.ts          # JWT Token Authorizer
│   │   └── validateSession.ts     # Validar sesión Cognito
│   └── notifications/
│       ├── processNotification.ts # Procesar mensaje SQS
│       └── sendEmail.ts           # Enviar email con SES
```

### Amazon DynamoDB

Base de datos NoSQL para almacenar datos de notas:

**Tabla: `notes`**
```
PK: userId (String)              # Partition Key
SK: noteId (String)              # Sort Key
Atributos:
  - title: String                # Título de la nota
  - content: String              # Contenido
  - tags: StringSet              # Etiquetas
  - attachments: List            # IDs de archivos adjuntos
  - createdAt: Number            # Timestamp de creación
  - updatedAt: Number            # Timestamp de actualización
  - isArchived: Boolean           # Estado de archivo
  - color: String                # Color de categorización

Índices globales secundarios:
  - GSI1: createdAt (userId -> createdAt)
  - GSI2: updatedAt (userId -> updatedAt)
  - GSI3: tags (userId -> tags)
```

**Tabla: `attachments`**
```
PK: attachmentId (String)        # Partition Key
SK: userId (String)              # Sort Key
Atributos:
  - noteId: String               # ID de nota asociada
  - fileName: String             # Nombre del archivo
  - s3Key: String                # Clave en S3
  - fileSize: Number             # Tamaño en bytes
  - mimeType: String             # Tipo MIME
  - uploadedAt: Number           # Timestamp de carga
  - expiresAt: Number            # Expiración (opcional)
```

**Tabla: `users-metadata`**
```
PK: userId (String)              # Partition Key
Atributos:
  - email: String                # Email del usuario
  - fullName: String             # Nombre completo
  - createdAt: Number            # Fecha de registro
  - lastLogin: Number            # Último acceso
  - preferences: Map             # Preferencias del usuario
  - quotaUsed: Number            # Espacio usado (bytes)
  - quotaLimit: Number           # Límite de cuota (bytes)
```

### API Gateway

Endpoints REST para acceso a las funciones Lambda:

```
POST   /notes                     # Crear nota
GET    /notes                     # Listar notas del usuario
GET    /notes/{noteId}            # Obtener nota específica
PUT    /notes/{noteId}            # Actualizar nota
DELETE /notes/{noteId}            # Eliminar nota

POST   /attachments/presigned-url # Obtener URL firmada S3
DELETE /attachments/{attachmentId} # Eliminar archivo

POST   /auth/validate-session     # Validar sesión
```

**Autorización**: JWT Token Authorizer valida tokens de Cognito en todas las requests

## 📦 Amazon S3

Almacenamiento seguro de archivos adjuntos:

```
Bucket: notas-app-attachments-{account}-{region}

Estructura:
├── {userId}/
│   ├── {noteId}/
│   │   ├── attachment-{timestamp}-{filename}
│   │   └── thumbnail-{timestamp}-{filename}
│   └── ...
└── ...

Configuración:
  - Versionado: Habilitado
  - Server-side encryption: AES-256
  - Lifecycle policy: Eliminar objetos después de 90 días de no uso
  - CORS: Configurado para permitir Next.js frontend
  - Public Access Block: Bloqueado (acceso solo vía presigned URLs)
```

## 🔔 Procesamiento Asíncrono

### Amazon SQS & Lambda Integration

```
Flujo de notificaciones:
1. Lambda function publica mensaje a SQS Queue
2. SQS dispara Lambda consumer automáticamente
3. Consumer procesa mensaje y llama a SES
4. Dead Letter Queue (DLQ) captura mensajes fallidos
```

**Cola Principal: `notas-app-notifications-queue`**
- Visibilidad timeout: 60s
- Message retention: 4 días
- DLQ configurada con max receive count = 3

**Mensaje SQS**:
```json
{
  "userId": "user-123",
  "noteId": "note-456",
  "action": "note-created|note-updated|attachment-uploaded",
  "recipient": "user@example.com",
  "data": {
    "noteTitle": "Mi nota",
    "timestamp": 1234567890
  }
}
```

### Amazon SES

Servicio de correo para notificaciones:

```
Configuración:
  - Verified email: admin@notas-app.com
  - Template de bienvenida
  - Template de notificación de nota creada
  - Template de recordatorio de notas sin revisar
  
Límites:
  - 50,000 emails/día (sandbox)
  - Max 14 emails/segundo
```

## 🔐 Amazon Cognito

Autenticación y gestión de usuarios:

```
User Pool: notas-app-userpool
  - Password policy: Mín 8 caracteres, mayúsculas, números
  - MFA: Opcional (SMS/TOTP)
  - Atributos personalizados:
    - full_name
    - company
    - phone_number

App Client: notas-app-client
  - Auth flows: USER_PASSWORD_AUTH, REFRESH_TOKEN_AUTH
  - Token expiry: 1 hora (access), 30 días (refresh)
  - Callback URLs: https://app.notas-app.com/callback
```

**JWT Token Authorizer**:
- Valida firma del token
- Verifica expiración
- Extrae `sub` (userId) para pasar a Lambda
- Cache: 5 minutos

## 🗂️ Estructura del Proyecto

```
notas-app-backend/
├── src/
│   ├── functions/
│   │   ├── notes/
│   │   ├── attachments/
│   │   ├── auth/
│   │   └── notifications/
│   ├── lib/
│   │   ├── dynamodb.ts          # Utilidades DynamoDB
│   │   ├── s3.ts                # Utilidades S3
│   │   ├── cognito.ts           # Validación Cognito
│   │   ├── sqs.ts               # Cliente SQS
│   │   ├── ses.ts               # Cliente SES
│   │   └── errors.ts            # Manejo de errores
│   ├── models/
│   │   ├── Note.ts
│   │   ├── Attachment.ts
│   │   └── User.ts
│   ├── middleware/
│   │   ├── auth.ts              # Validación JWT
│   │   ├── errorHandler.ts
│   │   └── logger.ts
│   └── utils/
│       ├── validators.ts        # Validación de datos
│       ├── formatters.ts        # Formato de respuestas
│       └── helpers.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── infrastructure/
│   ├── template.yaml            # SAM Template
│   ├── parameters.json          # Parámetros por entorno
│   └── env/
│       ├── dev.env
│       ├── staging.env
│       └── prod.env
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Configuración e Instalación

### Requisitos Previos

- Node.js 18+
- AWS CLI v2 configurado con credenciales
- Sam CLI (para despliegue)
- Docker (para pruebas locales)

### Instalación Local

```bash
# Clonar repositorio
git clone https://github.com/NatanaelHA/notas-app-backend.git
cd notas-app-backend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con valores locales

# Instalar dependencias de desarrollo
npm install --save-dev
```

### Variables de Entorno

```
# AWS
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012

# DynamoDB
NOTES_TABLE=notes
ATTACHMENTS_TABLE=attachments
USERS_TABLE=users-metadata

# S3
S3_BUCKET=notas-app-attachments
S3_PRESIGNED_URL_EXPIRY=3600

# SQS
SQS_QUEUE_URL=https://sqs.{region}.amazonaws.com/{account}/{queue-name}

# SES
SES_FROM_EMAIL=admin@notas-app.com
SES_REGION=us-east-1

# Cognito
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_CLIENT_ID=xxxxx
COGNITO_REGION=us-east-1

# Aplicación
NODE_ENV=development
LOG_LEVEL=debug
```

## 🛠️ Desarrollo Local

### Ejecutar Tests

```bash
# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Coverage
npm run test:coverage
```

### Build

```bash
# Compilar TypeScript
npm run build

# Validar SAM Template
sam validate -t infrastructure/template.yaml
```

### Local Testing con SAM

```bash
# Iniciar API local
sam local start-api --port 3001

# Invocar función Lambda local
sam local invoke GetNotesFunction --event events/get-notes.json
```

## 📦 Despliegue

### Development

```bash
# Deploy a dev
npm run deploy:dev

# O manualmente con SAM
sam deploy --template-file infrastructure/template.yaml \
  --stack-name notas-app-backend-dev \
  --parameter-overrides Environment=dev
```

### Staging/Production

```bash
# Deploy a staging
npm run deploy:staging

# Deploy a producción
npm run deploy:prod
```

## 📊 Monitoreo y Logging

### CloudWatch Logs

- **Lambda**: `/aws/lambda/notas-app-{function-name}`
- **API Gateway**: `/aws/apigateway/notas-app-api`
- **Retention**: 30 días

### CloudWatch Metrics

- **Invocations**: Total de invocaciones Lambda
- **Duration**: Tiempo de ejecución
- **Errors**: Tasa de errores
- **Throttles**: Limitaciones de capacidad
- **DynamoDB**: Capacidad de lectura/escritura
- **SQS**: Mensajes procesados/fallidos

### X-Ray Tracing

Habilitado para análisis de latencia y rendimiento:

```bash
# Visualizar traces
aws xray get-trace-summaries --start-time $(date -d '1 hour ago' +%s)
```

## 🔒 Seguridad

### Best Practices Implementadas

- ✅ **IAM Roles**: Principio de menor privilegio (least privilege)
- ✅ **Encryption**: Datos en tránsito (HTTPS) y en reposo (KMS)
- ✅ **Authentication**: JWT con Cognito
- ✅ **CORS**: Configurado solo para dominio del frontend
- ✅ **Input Validation**: Sanitización de datos de entrada
- ✅ **Rate Limiting**: Implementado en API Gateway
- ✅ **VPC**: Lambda en VPC privada (opcional)
- ✅ **Secrets Manager**: Para almacenar credenciales sensibles

### Roles IAM

```
LambdaExecutionRole
  - dynamodb:GetItem
  - dynamodb:PutItem
  - dynamodb:UpdateItem
  - dynamodb:DeleteItem
  - dynamodb:Query
  - s3:GetObject
  - s3:PutObject
  - s3:DeleteObject
  - sqs:SendMessage
  - ses:SendEmail
  - logs:CreateLogGroup
  - logs:CreateLogStream
  - logs:PutLogEvents
```

## 📝 API Endpoints

### Notas

```
POST /notes
  Body: { title, content, tags, color }
  Response: { noteId, createdAt, updatedAt }

GET /notes
  Params: ?limit=20&offset=0&tag=importante
  Response: { notes[], total, nextToken }

GET /notes/{noteId}
  Response: { noteId, title, content, tags, attachments, createdAt, updatedAt }

PUT /notes/{noteId}
  Body: { title, content, tags, color }
  Response: { updatedAt }

DELETE /notes/{noteId}
  Response: { success: true }
```

### Attachments

```
POST /attachments/presigned-url
  Body: { noteId, fileName, fileSize, mimeType }
  Response: { uploadUrl, attachmentId, expiresIn }

DELETE /attachments/{attachmentId}
  Response: { success: true }
```

## 🤝 Contribución

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia MIT - ver el archivo LICENSE para más detalles.

## 📞 Contacto

- **Autor**: NatanaelHA
- **Email**: contact@example.com
- **GitHub**: [@NatanaelHA](https://github.com/NatanaelHA)

---

**Última actualización**: Julio 2026
