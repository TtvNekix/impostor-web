# 🆕 AI Agent Onboarding — El Impostor

> **Propósito**: Esto es lo PRIMERO que debe leer cualquier agente (orquestador Gentle AI) que retome el proyecto El Impostor. Reemplaza la pérdida de contexto por compactación.

## ⚡ Orden de acciones al iniciar una sesión nueva

### Paso 0: Leer este documento

Ya lo estás haciendo. Sigue estos pasos en orden.

### Paso 1: Cargar el backlog desde Engram

```python
mem_search(query: "backlog/post-phase-1-features", project: "impostor-web")
```

Si **no existe** en Engram, leer `docs/GUIDE.md` → sección 6 para ver el backlog completo.

### Paso 2: Cargar el init desde Engram

```python
mem_search(query: "sdd-init/impostor-web", project: "impostor-web")
```

### Paso 3: Leer la guía de procedimientos

Leer `docs/GUIDE.md` completo (está en el repo, no depende de Engram).

### Paso 4: Leer el README

Leer `README.md` completo.

### Paso 5: Pedir preflight de sesión

El usuario debe elegir:
- A. Ritmo (A1 interactivo / A2 automático)
- B. Artefactos (B1 OpenSpec / B2 Engram / B3 Ambos)
- C. PRs (C1 preguntar / C2 single / C3 chained / C4 auto)
- D. Revisión (D1 400 / D2 800 / D3 otro)

**Última sesión elegida**: A2, B3, C4, D1.

---

## 📦 Datos clave del proyecto

| Propiedad | Valor |
|-----------|-------|
| Nombre Engram | `impostor-web` |
| Ruta local | `F:\web impostor` |
| Repo remote | `https://github.com/TtvNekix/impostor-web` |
| Producción | `https://impostor.nekix.lol` |
| Server | Servidor privado vía paramiko (credenciales en `scripts/deploy.py`) |
| Deploy script | `python scripts/deploy.py` |
| Tests | `pnpm --filter @impostor/server test` (154/154) |
| Build client | `pnpm --filter @impostor/client build` |
| Stack | Node 22 + Express + raw `ws` + React 18 + Vite + Zustand + Vitest |
| Monorepo | pnpm workspaces: `shared/`, `server/`, `client/` |
| CSS | Un solo archivo: `client/src/styles/globals.css` (~3076 líneas) |
| i18n | 6 archivos: `en, es, pt, fr, it, de` — DeepStringify enforce |
| Idioma español | **Castellano (España)** — sin voseo. Vosotros imperatives. |

---

## 🔑 Engram Topic Keys (los que importan)

| Topic Key | Qué contiene | Impor- tancia |
|-----------|-------------|:---:|
| `backlog/post-phase-1-features` | **Lista de features pendientes + parking lot** | 🔴 Crítico |
| `docs/procedures-guide` | Guía de procedimientos completa | 🔴 Crítico |
| `sdd-init/impostor-web` | Stack, testing, conventions | 🟡 Recomendado |
| `sdd/public-rooms-list/explore` | Feature pública completada | ⚪ Referencia |
| `bug/deploy-script-missing-new-shared-file-api-ts-not-uploaded` | Bug de deploy arreglado | 🟡 Repasar |
| `bug/fixed-3-issues-in-phase-1-selectimpostors-rule-history-cleanup-multi-impostor` | 3 bugs de re-rol arreglados | 🟡 Repasar |

---

## 🛠️ SDD Workflow (resumen para el agente)

1. **No empezar a codear sin preflight primero.** El preflight es un **HARD GATE**.
2. **Después del preflight**, correr `sdd-init` (si no está en Engram) o delegar init.
3. **Seguir el flujo** `explore → propose → spec → design → tasks → apply → verify → archive`.
4. **Cada fase delega a un sub-agente** (`sdd-explore`, `sdd-propose`, etc.). El orquestador NO codea, coordina.
5. **En modo Automático** (A2), las fases se corren seguidas sin pausa. El orquestador solo se detiene si:
   - El forecast de tamaño supera 400 líneas (revisión necesaria)
   - Hay un riesgo alto identificado
6. **No lanzar `sdd-apply` hasta que el usuario lo pida explícitamente**, o hasta que todas las fases de planning se hayan completado y el review workload guard haya pasado.
7. **Después de cada deploy**, verificar que el nuevo bundle JS está vivo en producción (chequear el hash en el HTML servido).

---

## 🐛 Bugs conocidos (no arreglados)

| Bug | Severidad | Notas |
|-----|-----------|-------|
| `GET /api/rooms` siempre devuelve `hasMore: false` incluso si hay >50 salas | Baja | El route handler post-filtra y resetea hasMore. Fix de 1 LOC: calcular hasMore real |
| Latencia en broadcast de WS cuando hay >10 jugadores | Baja | No hay batching. Broadcasting a N sockets es O(N) actualmente |
| Sin cobertura de tests en cliente | Media | Cualquier cambio de componente puede romperse sin que los tests lo atrapen |

---

## 📋 Cosas que NO hacer

- No modificar `openspec/specs/` directamente — siempre pasar por SDD (propose → spec → design → archive)
- No usar `backdrop-filter: blur()` en las ventanas modales — causa jank en Windows/Chrome
- No olvidar los 6 archivos de i18n al agregar strings
- No pushear sin correr `pnpm --filter @impostor/server build` primero (tsc strict atrapa errores)
- No saltarse el preflight de sesión (HARD GATE)
- No usar Socket.IO para nuevos eventos — el protocolo es raw `ws`

---

## 💬 Qué decirle al usuario al retomar

1. "Tengo el contexto del proyecto cargado. El juego está en producción en https://impostor.nekix.lol."
2. Mostrar el backlog de features pendientes (de `backlog/post-phase-1-features` en Engram o `docs/GUIDE.md` sección 6).
3. Preguntar qué feature quiere arrancar.

---

## 📄 Archivos que leer al inicio (para contexto completo)

```
docs/GUIDE.md              ← Guía de procedimientos
README.md                  ← README del proyecto
openspec/changes/archive/  ← Cambios completados (referencia)
openspec/specs/${domain}/  ← Specs actuales
```

Cualquier duda: buscar en Engram con `mem_search(project: "impostor-web", query: "...")`.
