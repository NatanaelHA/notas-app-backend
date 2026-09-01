# Notas App — Servicio de notas

Backend serverless responsable del dominio de notas de **Notas App**. Expone las operaciones de creación, consulta, actualización y desactivación de notas, administra sus adjuntos y procesa la limpieza de notas de invitados y usuarios reales.

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
- Consumir los eventos `InvitadoEliminado` y `UsuarioParaLimpieza`.
- Obtener las notas activas que se incluirán en cada resumen.
- Publicar en SQS un resumen antes de borrar permanentemente todas las notas del usuario correspondiente.

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

### Resumen y eliminación de notas de invitados

```text
notas-app-usuarios
    ↓ publica InvitadoEliminado
EventBridge (regla invitadoEliminadoARegistroNotas)
    ↓
eliminarNotasInvitado
    ↓ consulta notas activas en DynamoDB
    ├─ si existen, publica resumen_invitado en SQS (notas-emails)
    │      ↓
    │  mailer, en notas-app-notifications
    │      ↓
    │  SES envía el resumen al correo de auditoría
    │
    └─ después borra todas las notas del invitado en DynamoDB
```

`eliminarNotasInvitado` publica el resumen antes de borrar las notas. El mensaje contiene la información necesaria para que el servicio de notificaciones prepare el correo sin consultar DynamoDB. No incluye archivos adjuntos ni URLs prefirmadas de S3.

La operación es idempotente: si el mismo evento se procesa nuevamente y las notas ya no existen, no se produce daño. Si DynamoDB falla, la Lambda vuelve a lanzar el error y registra el `userId` afectado en CloudWatch.

La regla de EventBridge `invitadoEliminadoARegistroNotas` tiene configurada la cola SQS `eventos-invitados-fallidos` como DLQ. Esta DLQ protege la entrega entre EventBridge y el destino: si EventBridge no logra entregar el evento a la Lambda después de agotar su política de reintentos, conserva allí el evento original.

Los errores que ocurren después de que Lambda acepta la invocación pertenecen al mecanismo asíncrono de Lambda. Sin una configuración personalizada, Lambda reintenta por defecto dos veces los errores de ejecución. La DLQ de la regla no sustituye un destino de fallos propio de la Lambda.

La DLQ se configura en AWS como parte del destino de EventBridge; por eso no aparece como una cola enviada directamente desde el código de este backend.

### Resumen y eliminación semanal de notas de usuarios reales

```text
notas-app-usuarios
    ↓ publica UsuarioParaLimpieza con userId
EventBridge (regla usuarioParaLimpiezaARegistroNotas)
    ↓
eliminarNotasUsuario
    ↓ consulta notas activas en DynamoDB
    ├─ si existen, publica resumen_usuario en SQS (notas-emails)
    │      ↓
    │  mailer, en notas-app-notifications
    │      ↓
    │  SES envía el resumen al correo de auditoría
    │
    └─ después borra todas las notas del usuario en DynamoDB
```

La limpieza se inicia cada domingo a las 03:00, zona horaria `America/Santiago`, desde el Scheduler `limpiarUsuariosSemanal` del servicio de usuarios. A diferencia del flujo de invitados, la cuenta real permanece en Cognito; solamente se eliminan sus notas.

El correo real del usuario no forma parte del evento ni del mensaje de SQS. `eliminarNotasUsuario` usa el correo de auditoría verificado en SES, lo que permite mantener este flujo dentro de las restricciones actuales del sandbox. El usuario puede conservar sus notas descargándolas en PDF desde el frontend antes de la limpieza semanal.

La regla `usuarioParaLimpiezaARegistroNotas` también utiliza `eventos-invitados-fallidos` como DLQ de entrega. El nombre histórico de la cola se conserva y la cola es compartida por las dos reglas.

## Servicios AWS utilizados

| Servicio | Uso dentro de este backend |
|---|---|
| AWS Lambda | Ejecuta las funciones del servicio. |
| API Gateway | Expone los endpoints HTTP y valida los JWT de Cognito. |
| Amazon DynamoDB | Almacena las notas en la tabla `notas`. |
| Amazon S3 | Almacena adjuntos en el bucket `notas-app-adjuntos`. |
| Amazon SQS | Recibe los resúmenes de invitados y usuarios reales antes de la eliminación de sus notas. |
| Amazon EventBridge | Entrega `InvitadoEliminado` y `UsuarioParaLimpieza` a sus Lambdas consumidoras. |
| Amazon CloudWatch | Registra logs y métricas de las funciones. |

## Lambdas

| Función | Activación | Descripción |
|---|---|---|
| `obtenerNotas` | API Gateway | Obtiene las notas activas del usuario y genera URLs temporales para sus adjuntos. |
| `crearNota` | API Gateway | Crea una nota y aplica el límite de 20 notas activas. |
| `actualizarNota` | API Gateway | Actualiza título, cuerpo y referencia del adjunto de una nota activa. |
| `desactivarNota` | API Gateway | Realiza un soft delete y configura un TTL de 7 días. |
| `obtenerUrlSubida` | API Gateway | Genera una URL prefirmada de S3 válida durante 5 minutos. |
| `eliminarNotasInvitado` | EventBridge | Obtiene las notas activas, publica su resumen en SQS y elimina permanentemente todas las notas del invitado. |
| `eliminarNotasUsuario` | EventBridge | Obtiene las notas activas, publica el resumen semanal y elimina permanentemente todas las notas del usuario real sin borrar su cuenta. |

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

### Mensaje `resumen_invitado` enviado a SQS

Antes de borrar las notas, `eliminarNotasInvitado` publica un mensaje con esta estructura:

```json
{
  "tipo": "resumen_invitado",
  "userId": "sub-del-invitado",
  "email": "correo-de-auditoria-verificado-en-ses@ejemplo.com",
  "notas": [
    {
      "noteId": "id-de-la-nota",
      "titulo": "Título de la nota",
      "cuerpo": "Contenido",
      "creadoEn": "2026-08-25T02:14:32.687Z"
    }
  ]
}
```

Solo se incluyen notas activas en el resumen. Después de que SQS acepta el mensaje, la Lambda elimina todas las notas asociadas al invitado.

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

### Mensaje `resumen_usuario` enviado a SQS

`eliminarNotasUsuario` publica el resumen semanal con esta estructura:

```json
{
  "tipo": "resumen_usuario",
  "userId": "sub-del-usuario",
  "email": "correo-de-auditoria-verificado-en-ses@ejemplo.com",
  "notas": [
    {
      "noteId": "id-de-la-nota",
      "titulo": "Título de la nota",
      "cuerpo": "Contenido",
      "creadoEn": "2026-08-25T02:14:32.687Z"
    }
  ]
}
```

### Evento `UsuarioParaLimpieza`

`eliminarNotasUsuario` recibe desde EventBridge:

```json
{
  "detail": {
    "tipo": "UsuarioParaLimpieza",
    "userId": "sub-del-usuario",
    "programadoEn": "2026-08-30T07:00:40.000Z"
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
│   ├── eliminarNotasUsuario/
│   │   └── index.js
│   ├── obtenerNotas/
│   │   └── index.js
│   └── obtenerUrlSubida/
│       └── index.js
├── services/
│   ├── dynamoService.js
│   └── sqsService.js
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

El workflow instala dependencias, genera `lambda.zip` y actualiza el código de las siete Lambdas existentes mediante AWS CLI.

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

El servicio publica los resúmenes en SQS y no espera a que SES envíe el correo. Esto desacopla la limpieza de notas del envío realizado por el servicio de notificaciones.

### Limpieza desacoplada de invitados

El servicio de usuarios no accede directamente a la tabla `notas`. Publica `InvitadoEliminado` y este backend elimina los datos que le pertenecen.

### Limpieza desacoplada de usuarios reales

El servicio de usuarios publica `UsuarioParaLimpieza` solamente con el `userId`. Este backend prepara el resumen para el correo de auditoría y elimina las notas, mientras la cuenta real permanece en Cognito.
