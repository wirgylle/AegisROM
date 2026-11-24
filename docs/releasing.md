# Версии и релизы

## Версионирование

- `0.5.4` → `0.5.5`: багфиксы, улучшения интерфейса, точечные доработки.
- `0.6.0`, `0.7.0`: крупные подсистемы (патчер IPS/BPS/xdelta, валидатор BIOS, синхронизация сохранений, RetroAchievements).

Номер версии меняется в трёх местах в одном коммите:

- `package.json` → `"version"`
- `src/version.ts`
- `cmd/winsetup/discovery.go` → переменная `AppVersion` (в dev-сборках CI подменяет её через `-ldflags -X`)

## Тестовая сборка из dev

Каждый push в `dev` (то есть каждый смерженный PR) запускает workflow **Release (Windows 11 x64)**. Он собирает `Setup.exe`, `Portable.exe`, сканер и `.zip` с версией вида `0.6.0-dev+abc1234` (версия из `package.json` + короткий хеш коммита) и публикует их как **Pre-release** с тегом `dev-build-<номер запуска>`.

- Где скачать: https://github.com/wirgylle/AegisROM/releases — самый верхний релиз с меткой **Pre-release** и именем `AegisROM 0.6.0-dev+… (dev)`.
- Как отличить от стабильной: в заголовке окна, в установщике и в `version.json` стоит `0.6.0-dev+<коммит>`, в именах файлов `v0.6.0-dev.<коммит>`. Стабильный релиз помечен **Latest** и называется `v0.6.0`; `releases/latest` всегда ведёт на стабильный.
- Хранятся 3 последние dev-сборки, старые удаляются автоматически. Копия каждой сборки также лежит в Actions → запуск → **Artifacts** (14 дней).
- Вручную: Actions → Release (Windows 11 x64) → Run workflow → ветка `dev`.

### Dev builds (EN)

Every push to `dev` builds the assets with a version like `0.6.0-dev+abc1234` (package.json version + short commit hash) and publishes them as a **Pre-release** tagged `dev-build-<run number>`. Download: the top **Pre-release** on https://github.com/wirgylle/AegisROM/releases. The app window, installer and `version.json` show `0.6.0-dev+<commit>`; stable releases stay **Latest**. Only the 3 newest dev builds are kept.

## Как выпустить релиз

Бинарники в git не хранятся. Их собирает GitHub Actions (`.github/workflows/release-win11.yml`) и прикладывает к странице **Releases**.

1. Всё, что входит в релиз, смержено в `dev`, проверено, и `dev` смержен в `main` через pull request.
2. Версия поднята (см. выше) и это уже в `main`.
3. В `docs/releases/vX.Y.Z.md` лежат заметки к релизу для пользователей: что нового, что в beta, известные проблемы. Workflow поставит их в описание релиза, а под ними добавит автоматический список PR.
4. GitHub → **Actions** → **Release (Windows 11 x64)** → **Run workflow**. Ветка `main`, в поле `version` впиши версию без `v`, например `0.5.5`.
5. Workflow проверит, что запуск идёт с `main` и версия совпадает с `package.json`. Затем он соберёт `Setup.exe`, `Portable.exe`, сканер и `.zip`, создаст черновик релиза с этими файлами и заметками, опубликует его и поставит тег `v0.5.5`. Релиз помечается как Latest, поэтому ссылка `releases/latest` всегда ведёт на него.

**Не создавай релиз вручную через Releases → Draft a new release → Publish.** В репозитории включены неизменяемые релизы (immutable releases): к опубликованному релизу файлы приложить уже нельзя, и сборка упадёт. Так случилось с первой публикацией v0.5.4.

Из терминала можно запушить тег `vX.Y.Z` на коммит в `main` (`git tag v0.5.5 && git push origin v0.5.5`), результат тот же.

### Releasing (EN)

1. Everything for the release is merged into `dev`, tested, and `dev` is merged into `main` via a pull request.
2. The version is bumped in `package.json` and that change is on `main`.
3. User-facing notes are in `docs/releases/vX.Y.Z.md`.
4. GitHub → **Actions** → **Release (Windows 11 x64)** → **Run workflow** on `main`, with `version` set to the version without `v` (e.g. `0.5.5`).
5. The workflow checks the version against `package.json`, builds the assets, creates a draft release with them, then publishes it as Latest and creates the `vX.Y.Z` tag.

Don't publish a release by hand in the Releases UI: immutable releases are enabled, so assets can't be attached after publishing. Pushing a `vX.Y.Z` tag on a `main` commit works too.

Ссылка для пользователей на последнюю версию: `https://github.com/wirgylle/AegisROM/releases/latest`.
