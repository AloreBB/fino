# Fino

Android app for personal biweekly finances: it mirrors a tracking spreadsheet
(two pay periods per month, pockets, distribution scenarios), stores everything
in the phone's SQLite database, backs up daily to the user's Google Drive, and
accepts voice commands through the user's own ElevenLabs agent.

- UI copy in Spanish; code, comments and commit messages in English.
- Android only: `dev.alore.fino`. Money is integer cents, never float.

## Setup

```sh
npm install
npx expo start --dev-client   # needs a development build; Expo Go is not supported
```

Run the checks:

```sh
npx jest        # unit + golden tests (invented figures; the golden test reads .private/, see below)
npx tsc --noEmit
```

## History import (private data, never committed)

The spreadsheet, the generated history and the expected totals live only in
`.private/` (gitignored). To rebuild them:

```sh
python3 -m venv .private/venv
.private/venv/bin/pip install -r scripts/requirements.txt
.private/venv/bin/python -I scripts/import_excel.py .private/Seguimientos_2026.xlsx .private/
```

This writes `.private/fino-historial.json` (19 pay periods, the template and
3 scenarios) and `.private/expected.json` (the sheet's cached totals).
`tests/golden.test.ts` compares every pay period and scenario exactly, in
cents, and skips with a message when `.private/` is absent.

To load the history on the phone: send `.private/fino-historial.json` to the
phone by hand (never inside the repo or the APK: source uploads to EAS at
build time), open the app, go to Copia → Importar desde archivo. Delete the
file from every place it passed through afterwards.

## Google Drive backup

First launch asks to sign in, restore the newest copy (or pick an older one)
or start fresh. Nothing uploads until that choice is made. Afterwards the app
uploads one `fino-AAAA-MM-DD.json` file per day into a `Fino` folder, keeps
30 days, and shows its status on the main screen.

Google Cloud setup (one time, in the Cloud console): new project, enable the
Drive API, OAuth consent screen with the `drive.file` scope, Android client
for `dev.alore.fino` with the EAS keystore SHA-1, and publish the consent
screen to production.

## Voice

Each user creates their own ElevenLabs agent following `docs/voice-agent.md`
and pastes its ID in the app's voice settings. The APK carries no key and no
agent ID.

## Release build

```sh
eas login
eas build -p android --profile preview
```

Install the resulting APK on the phone.

## Repo hygiene

Financial data never enters git or the APK: no `.xlsx`, no generated history
or expected files, no keys, no agent ID. Tests use invented figures.
