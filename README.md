# Notas App — Servicio de notas

Backend serverless responsable del dominio de notas de **Notas App**. Expone las operaciones de creación, consulta, actualización y desactivación de notas, administra sus adjuntos y reacciona a la eliminación de usuarios invitados.

Este repositorio forma parte de una arquitectura separada por servicios:

- [`notas-app-frontend`](https://github.com/NatanaelHA/notas-app-frontend): interfaz web.
- [`notas-app-backend`](https://github.com/NatanaelHA/notas-app-backend): servicio de notas (este repositorio).
- [`notas-app-usuarios`](https://github.com/NatanaelHA/notas-app-usuarios): usuarios invitados y Cognito.
- [`notas-app-notifications`](https://github.com/NatanaelHA/notas-app-notifications): envío de correos con SES.

## Responsabilidades

Este servicio es responsable de:

- Guardar y consultar notas en DynamoDB.
- Limitar a 20 las notas activas por usuario.
- Actualizar y desactivar notas.
- Aplicar un TTL de 7 días a las notas desactivadas.
- Generar URLs prefirmadas para subir y descargar adjuntos de S3.
- Publicar en SQS una solicitud de notificación cuando se crea una nota.
- Consumir el evento `InvitadoEliminado` y borrar permanentemente las notas del invitado.

Este servicio **no** administra usuarios en Cognito ni envía correos directamente mediante SES. Esas responsabilidades pertenecen a los servicios de usuarios y notificaciones.

## Arquitectura

### Operaciones HTTP de notas

```text
Frontend (Next.js)
        ↓
API Gateway (HTTP API + autorizador JWT de Cognito)
        ↓
Lambdas de notas (Node.js 22)
        ↓
DynamoDB / S3
```

Aunque Cognito protege los endpoints mediante API Gateway, el User Pool es administrado por `notas-app-usuarios`. Este servicio solo consume los claims JWT, como `sub`, `email` y `custom:esInvitado`.

### Notificación al crear una nota

```text
crearNota
    ↓
SQS (notas-emails)
    ↓
mailer, en notas-app-notifications
    ↓
SES
```

`crearNota` guarda la nota y publica un mensaje en SQS. El envío del correo ocurre de forma asíncrona en el servicio de notificaciones.

### Eliminación de notas de invitados

```text
notas-app-usuarios
    ↓ publica InvitadoEliminado
EventBridge
    ↓
eliminarNotasInvitado
    ↓
DynamoDB
```

La operación es idempotente: si el mismo evento se procesa nuevamente y las notas ya no existen, no se produce daño. Si DynamoDB falla, la Lambda vuelve a lanzar el error para permitir reintentos y registra el `userId` afectado en CloudWatch.

## Servicios AWS utilizados

| Servicio | Uso dentro de este backend |
|---|---|
| AWS Lambda | Ejecuta las funciones del servicio. |
| API Gateway | Expone los endpoints HTTP y valida los JWT de Cognito. |
| Amazon DynamoDB | Almacena las notas en la tabla `notas`. |
| Amazon S3 | Almacena adjuntos en el bucket `notas-app-adjuntos`. |
| Amazon SQS | Recibe solicitudes de correo publicadas por `crearNota`. |
| Amazon EventBridge | Entrega el evento `InvitadoEliminado` a su Lambda consumidora. |
| Amazon CloudWatch | Registra logs y métricas de las funciones. |

## Lambdas

| Función | Activación | Descripción |
|---|---|---|
| `obtenerNotas` | API Gateway | Obtiene las notas activas del usuario y genera URLs temporales para sus adjuntos. |
| `crearNota` | API Gateway | Crea una nota, aplica el límite de 20 notas activas y publica una solicitud de correo en SQS. |
| `actualizarNota` | API Gateway | Actualiza título, cuerpo y referencia del adjunto de una nota activa. |
| `desactivarNota` | API Gateway | Realiza un soft delete y configura un TTL de 7 días. |
| `obtenerUrlSubida` | API Gateway | Genera una URL prefirmada de S3 válida durante 5 minutos. |
| `eliminarNotasInvitado` | EventBridge | Elimina permanentemente todas las notas asociadas al `userId` de un invitado eliminado. |

## Endpoints

Los endpoints protegidos obtienen la identidad desde `event.requestContext.authorizer.jwt.claims`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/notas` | Lista las notas activas del usuario. |
| `POST` | `/notas` | Crea una nota. |
| `PUT` | `/notas/{noteId}` | Actualiza una nota existente. |
| `DELETE` | `/notas/{noteId}` | Desactiva una nota y configura su TTL. |
| `POST` | `/notas/{noteId}/adjunto` | Genera una URL para subir un adjunto. |

> Las rutas y sus integraciones están configuradas en API Gateway; este repositorio contiene el código de los handlers.

## Contratos de integración

### Mensaje enviado a SQS

Cuando se crea una nota, `crearNota` publica un mensaje con esta estructura:

```json
{
  "userId": "sub-del-usuario",
  "email": "usuario@ejemplo.com",
  "titulo": "Título de la nota",
  "noteId": "id-de-la-nota",
  "esInvitado": false
}
```

### Evento `InvitadoEliminado`

`eliminarNotasInvitado` recibe desde EventBridge un evento cuyo detalle contiene:

```json
{
  "detail": {
    "tipo": "InvitadoEliminado",
    "userId": "sub-del-invitado",
    "eliminadoEn": "2026-08-20T00:00:00.000Z"
  }
}
```

## Modelo de nota

Una nota nueva contiene inicialmente:

```json
{
  "userId": "sub-del-usuario",
  "noteId": "uuid",
  "titulo": "Título",
  "cuerpo": "Contenido",
  "activo": true,
  "creadoEn": "fecha ISO 8601"
}
```

Al actualizarla se registra `actualizadoEn`. Al desactivarla se agregan `desactivadoEn` y `ttl`, y `activo` cambia a `false`.

## Estructura del proyecto

```text
notas-app/
├── functions/
│   ├── actualizarNota/
│   │   └── index.js
│   ├── crearNota/
│   │   └── index.js
│   ├── desactivarNota/
│   │   └── index.js
│   ├── eliminarNotasInvitado/
│   │   └── index.js
│   ├── obtenerNotas/
│   │   └── index.js
│   └── obtenerUrlSubida/
│       └── index.js
├── models/
│   └── nota.js
├── services/
│   └── dynamoService.js
├── utils/
│   └── response.js
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json
└── package-lock.json
```

## Instalación local

Requisitos:

- Node.js 22.
- npm.

Instala las versiones registradas en `package-lock.json`:

```bash
npm ci
```

## CI/CD

El workflow `.github/workflows/deploy.yml` se ejecuta con cada push a:

- `develop`, usando el environment de GitHub `development`.
- `main`, usando el environment de GitHub `production`.

El workflow instala dependencias, genera `lambda.zip` y actualiza el código de las seis Lambdas existentes mediante AWS CLI.

Secrets requeridos por el workflow:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

> El workflow actualiza código existente. La creación de Lambdas, API Gateway, triggers, reglas, tabla, bucket, cola y permisos se administra directamente en AWS.

## Decisiones de diseño

### Soft delete y TTL

Las notas eliminadas desde la aplicación se marcan como inactivas y reciben un TTL de 7 días. DynamoDB las elimina automáticamente después de ese periodo.

### Límite de notas

Cada usuario puede mantener hasta 20 notas activas. Las notas desactivadas no cuentan para este límite.

### Notificaciones asíncronas

El servicio publica mensajes en SQS y no espera a que SES envíe el correo. Esto desacopla la creación de notas del servicio de notificaciones.

### Limpieza desacoplada de invitados

El servicio de usuarios no accede directamente a la tabla `notas`. Publica `InvitadoEliminado` y este backend elimina los datos que le pertenecen.
