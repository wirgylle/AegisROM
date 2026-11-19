# Как вносить изменения в AegisROM

## Ветки

| Ветка | Назначение | Кто пишет |
|---|---|---|
| `main` | Прод. Из неё выпускаются релизы. | Только merge из `dev` через pull request |
| `dev` | Разработка и тестирование. | Merge pull request'ов с задачами |
| `feature/...`, `fix/...`, `claude/...` | Одна задача — одна ветка | Автор задачи |

Напрямую в `main` и `dev` не пушим.

## Процесс

1. Создать ветку от свежего `dev`:

   ```bash
   git checkout dev
   git pull
   git checkout -b feature/bios-checker
   ```

2. Сделать изменения, закоммитить, запушить ветку.
3. Открыть pull request **в `dev`** (base: `dev`). В описании — что сделано и как проверить.
4. Дождаться зелёного CI, проверить, смержить.
5. Когда в `dev` набралось то, что идёт в релиз, и оно проверено, — pull request `dev` → `main`.
6. Релиз — тегом на `main`, см. [docs/releasing.md](docs/releasing.md).

Срочный фикс прода: ветка от `main`, PR в `main`, затем смержить `main` обратно в `dev`, чтобы ветки не разошлись.

## Области работы

Задачи делятся по областям, каждая трогает в основном свои файлы. Так проще ревьюить и не конфликтовать.

| Область | Файлы |
|---|---|
| Бэкенд | `cmd/`, `server.ts`, `go.mod` |
| Фронтенд | `src/`, `index.html`, `vite.config.ts` |
| Дизайн | `src/components/`, `src/index.css`, `public/` (иконки, манифест) |
| Архитектура | структура пакетов, `docs/architecture.md` |
| Git / документация / CI | `README.md`, `docs/`, `CONTRIBUTING.md`, `.github/`, `.gitignore`, `scripts/` |

Если задача задевает несколько областей, отметьте это в описании PR.

## Что не коммитим

- Бинарники (`.exe`, `.zip`, `cmd/aegis-setup/payload/AegisROM.exe.gz`) — они публикуются через GitHub Releases.
- Сгенерированный фронтенд `cmd/aegis-gui/webdist/` (кроме `.gitkeep`).
- `data/` — локальная база dev-сервера с вашими путями.
- `.env*`, `node_modules/`, `dist/`.

## CI

`.github/workflows/ci.yml` запускается на каждый pull request и push в `dev`/`main`:

- фронтенд: `npm ci`, `npm run lint`, `npm run build`;
- Go: `go vet` и `go build` под Windows, `go vet` под Linux, `go test`, сборка `aegis-scanner` под Windows/Linux/macOS.

Как запустить то же локально — [docs/development.md](docs/development.md).

## Коммиты

Короткое сообщение в повелительном наклонении, при желании с префиксом: `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`.
