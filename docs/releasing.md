# Версии и релизы

## Версионирование

- `0.5.4` → `0.5.5`: багфиксы, улучшения интерфейса, точечные доработки.
- `0.6.0`, `0.7.0`: крупные подсистемы (патчер IPS/BPS/xdelta, валидатор BIOS, синхронизация сохранений, RetroAchievements).

Номер версии меняется в трёх местах в одном коммите:

- `package.json` → `"version"`
- `src/version.ts`
- `cmd/winsetup/discovery.go` → константа `AppVersion`

## Тестовая сборка из dev

Каждый push в `dev` (то есть каждый смерженный PR) запускает workflow **Release (Windows 11 x64)** без публикации. Готовые `Setup.exe`, `Portable.exe` и `.zip` лежат в Actions → нужный запуск → блок **Artifacts** (нужно войти в GitHub, хранятся 14 дней). Вручную: Actions → Release (Windows 11 x64) → Run workflow → ветка `dev`.

## Как выпустить релиз

Бинарники в git не хранятся. Их собирает GitHub Actions (`.github/workflows/release-win11.yml`) и прикладывает к странице **Releases**.

1. Всё, что входит в релиз, смержено в `dev`, проверено, и `dev` смержен в `main` через pull request.
2. Версия поднята (см. выше) и это уже в `main`.
3. Создать и запушить тег на `main`:

   ```bash
   git checkout main
   git pull
   git tag v0.5.5
   git push origin v0.5.5
   ```

4. Workflow проверит, что тег стоит на коммите из `main` и совпадает с версией в `package.json`, соберёт `Setup.exe`, `Portable.exe`, сканер и `.zip` и создаст релиз с автоматическими release notes. Релиз помечается как Latest, поэтому ссылка `releases/latest` всегда ведёт на него (pre-release GitHub в `latest` не учитывает, поэтому флаг не ставится).

Без терминала: GitHub → **Releases** → **Draft a new release** → в поле тега ввести `v0.5.5`, target `main` → **Publish**. Тег создастся и запустит тот же workflow, файлы добавятся в релиз через несколько минут.

Ссылка для пользователей на последнюю версию: `https://github.com/wirgylle/AegisROM/releases/latest`.
