# El Impostor — Guía de Procedimientos

> **Propósito**: Documento maestro para cualquier agente que retome el proyecto.
> **Creado**: 2026-06-16 (sesión completa de SDD + deploys + bug fixes)
> **Proyecto**: `impostor-web` (Engram), `F:\web impostor`, `https://github.com/TtvNekix/impostor-web.git`

---

## 1. Contexto del Proyecto

**El Impostor** es un juego multijugador de deducción social en tiempo real, similar a Among Us pero jugable en navegador sin instalación. Corre en un contenedor Proxmox con Node.js 22.

### Stack

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js 22 + TypeScript (strict) |
| Server | Express + raw `ws` (NO Socket.IO — reemplazado porque Engine.IO no pasaba el proxy NPM) |
| Client | React 18 + Vite + Zustand |
| Test runner | Vitest 1.6 (server only, 154 tests) |
| Client tests | **No hay** (0 E2E, 0 unitarios) |
| Idioma | 6: EN, ES, PT, FR, IT, DE — **castellano sin voseo** (vosotros imperatives: "introduce", "completa", "elige", "separa", "hablad", "votad", "leed") |
| Monorepo | pnpm workspaces (`shared/`, `server/`, `client/`) |
| Deploy | Python paramiko a `192.168.1.11` |

### URLs

- **Producción**: https://impostor.nekix.lol
- **API salas públicas**: https://impostor.nekix.lol/api/rooms?visibility=public
- **Health**: https://impostor.nekix.lol/health
- **Repo**: https://github.com/TtvNekix/impostor-web

### Estructura de directorios

```
F:\web impostor/
├── client/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom hooks (useSocket, usePublicRooms, etc.)
│   │   ├── screens/           # Page-level components
│   │   ├── stores/            # Zustand stores
│   │   ├── i18n/              # 6 archivos de idioma (en, es, pt, fr, it, de)
│   │   ├── styles/globals.css # ÚNICO archivo CSS (~3076 lines, 51 KB)
│   │   └── App.tsx            # Router entry
│   └── dist/                  # Build output
├── server/
│   ├── src/
│   │   ├── room/              # RoomStore, RoomManager
│   │   ├── game/              # GameEngine, StateMachine, RoundManager
│   │   ├── connection/        # ConnectionManager
│   │   ├── ws/handlers.ts     # WebSocket event handlers (archivo grande)
│   │   ├── audit/logger.ts    # Discord webhook logs
│   │   ├── words/WordBank.ts  # Word bank loader
│   │   └── __tests__/         # 9 test files, 154 tests
│   ├── src/index.ts           # Entry point, express routes, WS setup
│   └── src/audit/logger.ts    # logEvent (fire-and-forget Discord webhook POST)
├── shared/
│   └── src/
│       ├── types/             # room.ts, game.ts, protocol.ts, api.ts
│       ├── constants.ts       # TODAS las constantes del juego
│       └── index.ts           # Barrel export
├── scripts/deploy.py          # Deploy script (paramiko)
├── docs/
│   ├── GUIDE.md               # Este archivo
│   └── superpowers/           # SDD artifacts
│       ├── specs/             # Main specs after archive
│       │   ├── game-lifecycle/
│       │   ├── multi-match/
│       │   ├── player-connection/
│       │   ├── room-management/
│       │   ├── spectator-mode/
│       │   ├── voting-system/
│       │   ├── word-assignment/
│       │   └── public-rooms-discovery/   # <-- nueva feature agregada 16/06
│       └── changes/
│           └── archive/       # Completed SDD changes
│               ├── 2026-06-16-impostor-web-game/
│               └── 2026-06-16-public-rooms-list/
└── openspec/config.yaml       # SDD config (no editar manualmente)
```

---

## 2. Cómo Acceder a Engram (Memoria Persistente)

Engram es el sistema de memoria que sobrevive a compactaciones y cambios de sesión.
Para acceder a los datos de esta sesión en una sesión nueva:

### Al inicio de una sesión nueva (protocolo obligatorio)

```python
# Paso 1: Recuperar contexto reciente
mem_context(project: "impostor-web")

# Paso 2: Buscar datos específicos
mem_search(query: "public-rooms-list", project: "impostor-web")

# Paso 3: Si hay más de 10 resultados, usar topic_key exacto
mem_search(query: "topic:backlog/post-phase-1-features", project: "impostor-web")
```

### Topic Keys guardados en Engram (proyecto impostor-web)

| Key | Qué contiene | Valor |
|-----|-------------|-------|
| `sdd-init/impostor-web` | Init (stack, testing, conventions) | Esencial al inicio |
| `sdd/public-rooms-list/explore` | Exploración de la feature | Referencia |
| `sdd/public-rooms-list/proposal` | Propuesta con 5 decisiones cerradas | Referencia |
| `sdd/public-rooms-list/spec` | Specs (public-rooms-discovery + room-management delta) | Histórico |
| `sdd/public-rooms-list/design` | Diseño de 7 decisiones + chained PRs | Histórico |
| `sdd/public-rooms-list/tasks` | 22 tareas atómicas en 2 PRs | Histórico |
| `sdd/public-rooms-list/archive-report` | Reporte de archivo | Histórico |
| `backlog/post-phase-1-features` | **LISTA DE FEATURES PENDIENTES + parking lot** | **CRÍTICO** |
| `bug/deploy-script-missing-new-shared-file-api-ts-not-uploaded` | Bug de deploy | Referencia |
| `bug/fixed-3-issues-in-phase-1-selectimpostors-rule-history-cleanup-multi-impostor` | 3 bugs de re-rol arreglados | Referencia |
| `sdd-init/impostor-web` | Capabilities de testing, stack | Esencial |

### Para leer una observation completa

```python
# Después de mem_search, obtenés el ID:
mem_get_observation(id: 287)  # id numérico de la observation
```

---

## 3. Flujo de Trabajo SDD (Spec-Driven Development)

Cada nueva feature sigue este ciclo completo. El orquestador principal (gentle-orchestrator) coordina y delega a sub-agentes.

### 3.1 Preflight de sesión (HARD GATE — obligatorio)

Al inicio de CUALQUIER sesión que toque código, el orquestador debe preguntar:

```
Antes de continuar con SDD, elegí una opción por grupo.

A. Ritmo
   A1 Interactivo (recomendado): mostrar cada fase y esperar confirmación.
   A2 Automático: fases seguidas, parar solo en riesgo alto.

B. Artefactos
   B1 OpenSpec (recomendado): archivos en el repo.
   B2 Engram: más rápido, sin archivos.
   B3 Ambos: archivos + copia Engram.

C. PRs
   C1 Preguntarme: frenar si supera el presupuesto.
   C2 Un solo PR.
   C3 Encadenados: separar desde el inicio.
   C4 Auto: decidir según estimación.

D. Revisión
   D1 400 líneas (recomendado)
   D2 800 líneas
   D3 Otro
```

**Última sesión**: A2, B3, C4, D1.

### 3.2 Comandos disponibles

| Comando | Qué hace | Quién lo ejecuta |
|---------|----------|-------------------|
| `/sdd-init` | Bootstrap SDD (stack, testing cache, conventions) | Sub-agente sdd-init |
| `/sdd-explore <topic>` | Investigar idea, leer código, comparar enfoques | Sub-agente sdd-explore |
| `/sdd-propose` | Crear propuesta con scope, enfoque, riesgos | Sub-agente sdd-propose |
| `/sdd-spec` | Escribir specs delta con reqs y escenarios | Sub-agente sdd-spec |
| `/sdd-design` | Diseño técnico: componentes, datos, flujo | Sub-agente sdd-design |
| `/sdd-tasks` | Descomponer en tareas atómicas implementables | Sub-agente sdd-tasks |
| `/sdd-apply [change]` | Implementar tareas en batches | Sub-agente sdd-apply |
| `/sdd-verify [change]` | Validar contra specs | Sub-agente sdd-verify |
| `/sdd-archive [change]` | Archivar cambio completado | Sub-agente sdd-archive |
| `/sdd-new <change>` | Iniciar cambio nuevo (meta-comando) | **Orquestador** |
| `/sdd-ff <name>` | Fast-forward planning completo | **Orquestador** |

### 3.3 Datos de testing

```
Test runner: Vitest 1.6.0
Test command: pnpm --filter @impostor/server test
Tests actuales: 154/154 (9 files)
Build shared: pnpm --filter @impostor/shared build
Build server: pnpm --filter @impostor/server build
Build client: pnpm --filter @impostor/client build
Strict TDD: NO (Standard Mode — tests required but not TDD-first)
Client tests: NO hay (sin runner)
E2E: NO hay
Linter: NO hay (solo tsc strict)
Formatter: NO hay
Coverage: NO hay
```

### 3.4 Reglas SDD del proyecto

- **Castellano absoluto**: NO voseo en ningún string visible al usuario. Usar "introduce", "completa", "elige", "hablad", "votad", "leed".
- **6 idiomas obligatorios**: cualquier nuevo string de i18n debe agregarse a los 6 archivos (en, es, pt, fr, it, de). DeepStringify en `I18nContext.tsx` chequea shape matching al build.
- **Si un idioma cae en build**: todos los 6 archivos deben tener exactamente la misma estructura de objeto. DeepStringify lo enforce.
- **Límite 50 LOC por tarea** en `sdd-tasks`. Si una tarea requiere más, dividirla.
- **Budget de review**: 400 líneas por PR. Si el forecast total excede, usar chained PRs.
- **Chain strategy**: `stacked-to-main` (cada PR mergea directo a main en orden).
- **No hacer deploy de archivos nuevos sin agregarlos a `scripts/deploy.py`** (ver sección 4).
- **Conventional commits**: `feat|fix|chore|test|docs(scope): mensaje`.
- **Sin "Co-Authored-By" ni atribución de IA** en commits.

---

## 4. Deploy a Producción

### 4.1 Script de deploy

```bash
# Deploy completo (client + server)
python scripts/deploy.py

# Solo cliente (para cambios de CSS/componentes)
python scripts/deploy.py --client-only

# Solo server
python scripts/deploy.py --server-only

# Solo verificar el estado actual
python scripts/deploy.py --verify
```

### 4.2 Cómo funciona (lo que hace el script)

1. **Descubre archivos server y shared automáticamente** — ya NO usa listas hardcodeadas (se arregló en commit 2ace7f9). Escanea `server/src/**/*.ts` y `shared/src/**/*.ts` excluyendo `__tests__/`.
2. Sube cada archivo vía SFTP a `/opt/impostor-web/`.
3. Sube `client/dist/index.html` + assets hasheados + archivos estáticos.
4. Limpia assets huérfanos (hashes viejos que ya no están en el HTML).
5. **Pre-restart smoke** (nuevo, commit d7a46a0): ejecuta `import('@impostor/shared')` vía tsx en el server para verificar que todos los módulos importados existen. Si falla, aborta antes de reiniciar y la versión vieja sigue sirviendo.
6. Reinicia el servicio `impostor-web`.
7. Espera 2s a que el puerto abra.
8. Verifica endpoints locales y públicos (200 OK).

### 4.3 Cuándo hacer `--client-only` vs `--server-only` vs full

| Cambiaste | Comando |
|-----------|---------|
| Solo CSS del frontend | `--client-only` |
| Solo componentes React (hooks, stores, screens) | `--client-only` |
| Solo i18n (traducciones) | `--client-only` |
| Server (GameEngine, RoomManager, handlers, etc.) | `--server-only` |
| Shared (tipos, constantes, API) | Full (o `--server-only`) |
| Todo | Full (sin flags) |

**IMPORTANTE**: Siempre buildear el cliente ANTES de deployar:
```bash
pnpm --filter @impostor/client build && python scripts/deploy.py --client-only
```

### 4.4 Problemas comunes de deploy (y cómo diagnosticarlos)

**Síntoma: 502 en producción, curl local da EXIT 7**
→ El server crash-loopa. Revisar:
```bash
python -c "
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.1.11', username='root', password='juanito2005', timeout=10)
si, so, se = c.exec_command('journalctl -u impostor-web -n 30 --no-pager', timeout=10)
print(so.read().decode())
print(se.read().decode())
c.close()
"
```
Buscar `ERR_MODULE_NOT_FOUND` — un archivo nuevo no está en el servidor.

**Síntoma: scripts/deploy.py FALLÓ el pre-restart smoke**
→ El import de shared o server tiene un módulo que no se resuelve en producción. Causa típica: nuevo archivo en `shared/src/` que no se subió porque el script anterior usaba lista hardcodeada. Con el nuevo `discover_ts_files()` debería subirse automáticamente.

**Síntoma: el cliente se ve igual después del deploy**
→ Cache del navegador. Hard refresh (`Ctrl+Shift+R`) o abrir en pestaña de incógnito.

---

## 5. Convenciones de Código

### 5.1 CSS

- **Único archivo**: `client/src/styles/globals.css` (~3076 líneas, 51 KB)
- **Naming**: `__block__element--modifier` (BEM-like), no CSS-in-JS
- **Variables** (definidas en `:root`): `--accent-primary` (cyan), `--accent-secondary` (rosa), `--accent-warning` (amarillo), `--accent-danger` (rojo), `--accent-gold` (oro), `--bg-card` (fondo de caja), `--text-primary` / `--text-secondary` / `--text-muted`, `--border-subtle`, `--radius-md` / `--radius-lg`, `--font-mono`, `--font-heading`, `--space-md`
- **Media queries**: `720px` (tablet) y `480px` (mobile) — ambas al final del archivo
- **NO usar** `backdrop-filter: blur()` en `modal-backdrop` — causa jank en Windows/Chrome. Reemplazado por fondo sólido oscuro.
- **Checkbox custom**: NO usar `accent-color` nativo. Usar `appearance: none` + `::after` para el tick. Ver `.mode-card__checkbox`.
- **Animaciones**: `@keyframes fadeIn` (0.18s), `fadeInUp` (0.25s), `fadeInScale` (0.22s). Preferir `ease` o `ease-out`.

### 5.2 TypeScript

- `tsc --strict` — aprovecharlo, no usar `as any` (salvo legacy en handlers.ts)
- No usar `require()`, siempre `import` ESM
- Los `interface` no existen en runtime (solo los `const` y `function`)
- `shared/src/` usa TypeScript interfaces como source of truth

### 5.3 Manejo de errores

- El server nunca debe crashear. Todo error inesperado se captura con `uncaughtException` / `unhandledRejection` handlers en `index.ts` que loguean vía `logEvent` al webhook de Discord.
- `logEvent` es fire-and-forget — nunca hace throw si el webhook falla.
- Errores de room se devuelven como `ROOM_ERROR` con código + mensaje internacionalizable.

### 5.4 WebSocket Protocol (raw ws)

El server usa `ws` (no Socket.IO). Los mensajes son JSON con forma:
```ts
// Cliente → Server
{ event: "CREATE_ROOM" | "JOIN_ROOM" | "UPDATE_SETTINGS" | ..., data: { ... } }

// Server → Cliente
{ event: "ROOM_JOINED" | "GAME_STARTED" | ..., data: { ... } }
```

Eventos definidos en `shared/src/types/protocol.ts`.

---

## 6. Próximas Features (Backlog)

Priorizadas según la última sesión. El orden es sugerido — se puede cambiar.

### Implementar próximamente (seleccionadas por el usuario)

| # | Feature | Dependencias | Tamaño estimado | Comentario |
|---|---------|--------------|-----------------|------------|
| 1 | **Sesiones de jugador** (userId en localStorage) | Ninguna | Pequeño (<200 LOC) | Habilita stats persistentes |
| 2 | **Chat in-lobby** | Ninguna | Mediano (~400 LOC) | Engagement, no requiere storage |
| 3 | **Room passwords** | Ninguna | Pequeño (~150 LOC) | Complemento de salas públicas |
| 4 | **E2E tests con Playwright** | CI/CD pipeline | Medio (~300 LOC test) | Atrapa regresiones |
| 5 | **Tests unitarios de cliente** | Vitest en `client/` | Medio | Urgente: client sin tests |
| 6 | **Skins visuales** | CSS variables existentes | Pequeño | Delight, sin tocar server |
| 7 | **Performance** (broadcast batching) | Ninguna | Chico-mediano | Latencia en partidas grandes |
| 8 | **Deep links** (`/join/ABC12`) | Ninguna | Chico | UX |
| 9 | **Monitoring** | Discord/uptime | Chico | Ops |
| 10 | **Lista de salas públicas** | ✅ **HECHA** | 480 LOC | Deployada y archivada |

### Parking lot (confirmadas como valiosas, hacer después)

- Modo "Por imagen" (anunciado como Próximamente en UI)
- Estadísticas persistentes de jugador
- Logros/badges
- Roles custom (detective, jester)
- Replay de partidas
- Modo torneo/bracket
- Chat pre-partida (ya en lobby?)
- Persistencia de estado (SQLite)
- CI/CD pipeline
- Multi-región
- Bot de Discord
- Feed de partidas públicas

---

## 7. Comandos Útiles

### Local (desarrollo)

```bash
# Iniciar dev server
cd F:\web impostor
pnpm --filter @impostor/server dev          # Inicia server con tsx watch
pnpm --filter @impostor/client dev          # Inicia Vite dev server

# Tests
pnpm --filter @impostor/server test         # Todos los tests
pnpm --filter @impostor/server test -- src/__tests__/GameEngine.test.ts

# Builds
pnpm --filter @impostor/client build        # Build del cliente
pnpm --filter @impostor/server build        # tsc check del server
pnpm --filter @impostor/shared build        # Build shared dist (raro)

# Deploy
python scripts/deploy.py --verify           # Estado actual de producción
python scripts/deploy.py --client-only      # Solo cliente
python scripts/deploy.py --server-only      # Solo server
```

### Remote (producción vía paramiko)

```python
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.1.11', username='root', password='juanito2005', timeout=10)

# Ver logs
si, so, se = c.exec_command('journalctl -u impostor-web -n 50 --no-pager')
print(so.read().decode())

# Ver estado
si, so, se = c.exec_command('systemctl status impostor-web --no-pager | head -15')
print(so.read().decode())

# Ver archivos en el server (si un archivo nuevo no se subió)
si, so, se = c.exec_command('ls /opt/impostor-web/shared/src/types/')
print(so.read().decode())

c.close()
```

### Git

```bash
# Ver diff de los últimos cambios
git log --oneline -10

# Ver qué cambió en un commit
git show <hash> --stat

# Ver ramas
git branch -a

# Crear rama para feature
git checkout -b feature/<name>

# Stacked-to-main: mergear a main sin PR
git checkout main && git merge feature/<name>
```

---

## 8. Lecciones Aprendidas (para no cometer los mismos errores)

### Bug: deploy.py no sube archivos nuevos (2026-06-16)

**Causa**: `SHARED_FILES` y `SERVER_FILES` eran listas hardcodeadas. Al agregar `shared/src/types/api.ts` (nuevo), no se subió al servidor. El server crasheó en startup con `ERR_MODULE_NOT_FOUND`.

**Fix**: `discover_ts_files()` que escanea recursivamente `server/src/` y `shared/src/`. Agregado `pre_restart_smoke()` que verifica el import antes de reiniciar.

**Lección**: SIEMPRE usar auto-descubrimiento para archivos nuevos. No confiar en listas hardcodeadas.

### Bug: smoke test fallaba por interfaces vs runtime (2026-06-16)

**Causa**: El smoke test original chequeaba `m.PublicRoomDTO` (un `interface`), que se borra en JS emitido. El test fallaba siempre.

**Fix**: Chequear constantes runtime (`ALLOWED_LOCALES`, `MAX_PUBLIC_ROOMS_RETURNED`) que sí existen en JS.

**Lección**: `interface` solo existe en TypeScript. `const`, `function`, `class` existen en runtime. Siempre verificar con valores runtime, no tipos.

### Bug: cleanupRoom borraba impostorHistory (2026-06-16)

**Causa**: El fix original de `cleanupRoom` agregó `impostorHistory.delete(roomCode)`, pero `startNewMatch` llama a `cleanupRoom`. Si la ronda termina y se inicia una nueva, el history se borraba y la regla de re-rol dejaba de funcionar entre rondas.

**Fix**: Separar `clearImpostorHistory` en un método público aparte, llamado desde `RoomManager.onRoomDestroyed` callback (cuando la sala se destruye de verdad, no cuando se resetea para nueva ronda).

**Lección**: `cleanupRoom` no es "destruir sala", es "reset para nueva partida en la misma sala". No mezclar semánticas.

### Bug: re-rol rule implementó union en vez de intersection (2026-06-16)

**Causa**: El plan especificaba "excluir SOLO si el mismo jugador fue impostor en AMBAS de las últimas 2 rondas" (intersection). La implementación excluía si aparecía en CUALQUIERA de las últimas 2 (union). El comment en código también describía la regla incorrecta.

**Decisión**: Nos quedamos con la regla union (más restrictiva, mejor variedad). Pero se documentó y alinearon todos los comments.

**Lección**: Los apply agents pueden desviarse de la spec. Revisar el diff de cada PR, no solo los tests.

---

## 9. Autores y Contacto

- Proyecto personal de **TtvNekix**
- Base de operaciones: Buenos Aires
- Infraestructura propia (Proxmox en casa)
- No hay contribuciones externas esperadas
- Script de deploy usa paramiko con user `root` / password `juanito2005` (NO exponer en logs)
